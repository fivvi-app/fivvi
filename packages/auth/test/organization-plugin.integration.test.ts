import {
  authIdentities,
  authUsers,
  authVerifications,
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  teamMembers,
} from '@fivvi/database';
import { addTeamRole, createAccount } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { organization } from 'better-auth/plugins/organization';
import { memberAc, ownerAc } from 'better-auth/plugins/organization/access';
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// This file is the evidence for ADR-022 (F002, spec #170, ticket #276) and pins better-auth's
// behaviour on purpose: it records what the organization plugin of the pinned version does over our
// tables, so the decision can be re-checked when the version changes. Nothing of the plugin is in
// `src/`; once ADR-022 is accepted this file may be removed.
//
// F002 (spec #170, first ticket, #276): does Better Auth's organization plugin (ADR-007) fit
// E011's `organizations` and `team_members` tables? This file is the evidence for the four
// conditions of the ticket, against the plugin version this repo pins (better-auth 1.7.12) and a
// real Postgres, with every query running as the app role `fivvi_app` (RLS forced, no BYPASSRLS).
// The plugin is configured in this test only; nothing of it is in `src/`. Each test names what the
// plugin does and which condition it settles; the outcome is recorded in ADR-022.

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';
const NO_SUCH_WORKSPACE = '0197c0de-0000-7000-8000-0000000000ff';

// `organizations` as F002 would extend it (spec #170: name, slug), declared here and added to the
// cloned database below, so the probe changes nothing in packages/database.
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const organizationsTable = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});
// The plugin would write the workspace a session has open (`activeOrganizationId`) on this table;
// the probe does not give it that column (see condition 4).
const sessionsTable = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: instant('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

interface ProbeOptions {
  /** Ids made by the application instead of Postgres (the only way to choose a workspace's id). */
  generateId?: () => string;
  presetOrganizationId?: string;
  /** A `beforeUpdateOrganization` hook that drops a slug from a rename. */
  pinSlug?: boolean;
}

/** Better Auth with the organization plugin, mapped onto `organizations` and `team_members`. */
function probeAuth(db: DatabaseExecutor, options: ProbeOptions = {}) {
  const { presetOrganizationId } = options;
  return betterAuth({
    secret: SECRET,
    baseURL: ORIGIN,
    basePath: '/api/auth',
    logger: { disabled: true },
    database: drizzleAdapter(db as never, {
      provider: 'pg',
      schema: {
        user: authUsers,
        session: sessionsTable,
        account: authIdentities,
        verification: authVerifications,
        organization: organizationsTable,
        member: teamMembers,
      },
    }),
    plugins: [
      // Test-only: the raw session token as bearer token, so the test needs no sign-in e-mail.
      bearer(),
      organization({
        roles: { owner: ownerAc, trainer: memberAc },
        creatorRole: 'owner',
        // The plugin's `member.userId` is our `team_members.account_id`.
        schema: { member: { fields: { userId: 'accountId' } } },
        organizationHooks: {
          ...(presetOrganizationId
            ? {
                beforeCreateOrganization: () =>
                  Promise.resolve({ data: { id: presetOrganizationId } }),
              }
            : {}),
          ...(options.pinSlug
            ? { beforeUpdateOrganization: () => Promise.resolve({ data: { slug: undefined } }) }
            : {}),
        },
      }),
    ],
    emailAndPassword: { enabled: false },
    telemetry: { enabled: false },
    advanced: { database: { generateId: options.generateId ?? 'uuid', validateSchema: false } },
  });
}
type ProbeAuth = ReturnType<typeof probeAuth>;

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} was not created.`);
  return value;
}

type Role = 'ownerA' | 'trainerA' | 'ownerB' | 'outsider';

/** Two workspaces with their people and sessions: A (Owner, Trainer), B (Owner) and an outsider. */
interface World {
  workspaceA: string;
  workspaceB: string;
  accounts: Record<Role, { id: string }>;
  tokens: Record<Role, string>;
}

describe('F002 does Better Auth’s organization plugin fit E011’s tables?', () => {
  let testDatabase: TestDatabase;
  let admin: DatabaseClient;
  /** The connection the web runs on: the app role, RLS applies. */
  let app: DatabaseClient;
  /** Every test gets its own world in `beforeEach`; no test reads what another one made. */
  let w: World;
  let counter = 0;

  const rows = async <T = Record<string, unknown>>(query: ReturnType<typeof sql>) =>
    (await admin.db.execute(query)).rows as T[];

  async function workspace(name: string, slug: string): Promise<string> {
    const [row] = await rows<{ id: string }>(
      sql`insert into organizations (name, slug) values (${name}, ${slug}) returning id`,
    );
    return must(row?.id, 'workspace');
  }

  /** A sign-in session of the account, made the way Better Auth makes one. */
  async function sessionOf(accountId: string): Promise<string> {
    const context = await probeAuth(app.db).$context;
    return (await context.internalAdapter.createSession(accountId)).token;
  }

  async function makeWorld(): Promise<World> {
    counter += 1;
    const person = (label: string) => createAccount(admin.db, { label: `${label}-${counter}` });
    const [ownerA, trainerA, ownerB, outsider] = await Promise.all(
      ['owner-a', 'trainer-a', 'owner-b', 'outsider'].map(person),
    );
    const accounts = {
      ownerA: must(ownerA, 'owner of A'),
      trainerA: must(trainerA, 'trainer of A'),
      ownerB: must(ownerB, 'owner of B'),
      outsider: must(outsider, 'outsider'),
    };
    const workspaceA = await workspace('Gym A', `gym-a-${counter}`);
    const workspaceB = await workspace('Gym B', `gym-b-${counter}`);
    await addTeamRole(admin.db, {
      workspaceId: workspaceA,
      accountId: accounts.ownerA.id,
      role: 'owner',
    });
    await addTeamRole(admin.db, {
      workspaceId: workspaceA,
      accountId: accounts.trainerA.id,
      role: 'trainer',
    });
    await addTeamRole(admin.db, {
      workspaceId: workspaceB,
      accountId: accounts.ownerB.id,
      role: 'owner',
    });
    return {
      workspaceA,
      workspaceB,
      accounts,
      tokens: {
        ownerA: await sessionOf(accounts.ownerA.id),
        trainerA: await sessionOf(accounts.trainerA.id),
        ownerB: await sessionOf(accounts.ownerB.id),
        outsider: await sessionOf(accounts.outsider.id),
      },
    };
  }

  /** One HTTP request to the plugin's endpoint, as the caller holding `token` (anonymous without). */
  async function call(
    auth: ProbeAuth,
    token: string | undefined,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ) {
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/organization${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const text = await response.text();
    return {
      status: response.status,
      json: text ? (JSON.parse(text) as unknown) : undefined,
    };
  }

  /**
   * The best case for the plugin: one Better Auth instance built over the request's own
   * transaction, with E011's context set in it the way `inWorkspaceScope` sets it, so every query
   * of the plugin runs inside the tenant context as `fivvi_app`.
   */
  function inTenantContext<T>(
    context: { accountId: string; workspaceIds: string[] },
    options: ProbeOptions,
    run: (auth: ProbeAuth) => Promise<T>,
  ): Promise<T> {
    return app.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.account_id', ${context.accountId}, true),
                   set_config('app.workspace_ids', ${context.workspaceIds.join(',')}, true),
                   set_config('app.client_id', '', true)`,
      );
      return run(probeAuth(tx, options));
    });
  }

  /** Create a workspace through the plugin, the only way that works: the id is chosen up front. */
  async function createThroughPlugin(who: Role, slug: string) {
    const id = crypto.randomUUID();
    const response = await inTenantContext(
      { accountId: w.accounts[who].id, workspaceIds: [id] },
      { generateId: () => crypto.randomUUID(), presetOrganizationId: id },
      (auth) => call(auth, w.tokens[who], 'POST', '/create', { name: 'New', slug }),
    );
    return { id, response };
  }

  /** What the plugin leaves behind, read with the privileged connection (RLS does not apply). */
  const teamRoles = (workspaceId: string) =>
    rows<{ account_id: string; role: string }>(
      sql`select account_id, role from team_members where organization_id = ${workspaceId} order by role, account_id`,
    );

  /** The message of an error and of the database error behind it. */
  const reasonOf = async (attempt: Promise<unknown>): Promise<string> => {
    try {
      await attempt;
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      return `${error instanceof Error ? error.message : ''} ${cause instanceof Error ? cause.message : ''}`;
    }
    return 'it did not fail';
  };

  const publicTables = async () =>
    (
      await rows<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'public'`,
      )
    ).map((row) => row.table_name);

  beforeAll(async () => {
    testDatabase = await cloneTemplateDatabase();
    admin = createDatabase({ url: testDatabase.url, maxConnections: 2 });
    app = createDatabase({ url: testDatabase.appUrl, maxConnections: 4 });
    // F002 adds these two columns to `organizations` (spec #170); the probe adds them to the clone.
    await admin.db.execute(
      sql`alter table organizations
            add column name text not null default '',
            add column slug text not null default gen_random_uuid()::text unique`,
    );
  });

  beforeEach(async () => {
    w = await makeWorld();
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await testDatabase?.drop();
  });

  it('runs as fivvi_app, the role RLS applies to', async () => {
    const [role] = (
      await app.db.execute(
        sql`select current_user::text as name,
                   (select rolbypassrls from pg_roles where rolname = current_user) as bypass`,
      )
    ).rows as { name: string; bypass: boolean }[];
    expect(role).toEqual({ name: 'fivvi_app', bypass: false });
  });

  describe('condition 1: one team role per account and workspace', () => {
    it('met: a second role for the same account is refused and the first stays', async () => {
      const before = await teamRoles(w.workspaceA);

      // addMember is the server-only call a hand-written route would make.
      await expect(
        inTenantContext(
          { accountId: w.accounts.ownerA.id, workspaceIds: [w.workspaceA] },
          {},
          (auth) =>
            auth.api.addMember({
              body: {
                userId: w.accounts.trainerA.id,
                role: 'owner',
                organizationId: w.workspaceA,
              },
            }),
        ),
      ).rejects.toThrow('User is already a member of this organization');

      expect(await teamRoles(w.workspaceA)).toEqual(before);
    });

    it('met, through the database: only owner and trainer exist; the plugin’s role lists and its default role fail in the enum', async () => {
      const [member] = await rows<{ id: string }>(
        sql`select id from team_members where account_id = ${w.accounts.trainerA.id}`,
      );
      const memberId = must(member?.id, 'trainer’s membership');
      const headers = new Headers({ authorization: `Bearer ${w.tokens.ownerA}` });
      const inA = { accountId: w.accounts.ownerA.id, workspaceIds: [w.workspaceA] };

      // The plugin accepts a list of roles and stores it as "owner,trainer".
      expect(
        await reasonOf(
          inTenantContext(inA, {}, (auth) =>
            auth.api.updateMemberRole({
              headers,
              body: { memberId, role: ['owner', 'trainer'], organizationId: w.workspaceA },
            }),
          ),
        ),
      ).toContain('invalid input value for enum team_role: "owner,trainer"');
      // Its default role is "member", which our enum does not have.
      expect(
        await reasonOf(
          inTenantContext(inA, {}, (auth) =>
            auth.api.addMember({
              body: {
                userId: w.accounts.outsider.id,
                role: 'member' as never,
                organizationId: w.workspaceA,
              },
            }),
          ),
        ),
      ).toContain('invalid input value for enum team_role: "member"');

      const after = await teamRoles(w.workspaceA);
      expect(after.find((row) => row.account_id === w.accounts.trainerA.id)?.role).toBe('trainer');
      expect(after).toHaveLength(2);
    });
  });

  describe('condition 2: our status codes (401, 404, 403)', () => {
    const rename = (organizationId: string) => ({ organizationId, data: { name: 'Renamed' } });

    it('met: 401 when nobody is signed in', async () => {
      const response = await call(
        probeAuth(app.db),
        undefined,
        'POST',
        '/update',
        rename(w.workspaceA),
      );

      expect(response.status).toBe(401);
    });

    it('met: 403 when the role is not allowed to rename', async () => {
      const response = await inTenantContext(
        { accountId: w.accounts.trainerA.id, workspaceIds: [w.workspaceA] },
        {},
        (auth) => call(auth, w.tokens.trainerA, 'POST', '/update', rename(w.workspaceA)),
      );

      expect(response.status).toBe(403);
      expect(response.json).toMatchObject({
        code: 'YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION',
      });
    });

    // The 400s are the plugin's own HTTP endpoints. A route behind `defineRoute` and the access
    // helper answers 404 before it ever calls `auth.api.*`, so this condition is met only behind
    // that helper (or a wrapper that maps these 400s); the plugin alone does not meet it.
    it('NOT met by the plugin’s endpoints: no place in the workspace is 400, never 404 (rename, read, other workspace, missing)', async () => {
      const outside = { accountId: w.accounts.outsider.id, workspaceIds: [] };
      const inB = { accountId: w.accounts.ownerB.id, workspaceIds: [w.workspaceB] };

      const renameByOutsider = await inTenantContext(outside, {}, (auth) =>
        call(auth, w.tokens.outsider, 'POST', '/update', rename(w.workspaceA)),
      );
      const readByOutsider = await inTenantContext(outside, {}, (auth) =>
        call(auth, w.tokens.outsider, 'GET', `/get-organization?organizationId=${w.workspaceA}`),
      );
      const renameOtherWorkspace = await inTenantContext(inB, {}, (auth) =>
        call(auth, w.tokens.ownerB, 'POST', '/update', rename(w.workspaceA)),
      );
      const readOtherWorkspace = await inTenantContext(inB, {}, (auth) =>
        call(auth, w.tokens.ownerB, 'GET', `/get-organization?organizationId=${w.workspaceA}`),
      );
      const renameMissing = await inTenantContext(outside, {}, (auth) =>
        call(auth, w.tokens.outsider, 'POST', '/update', rename(NO_SUCH_WORKSPACE)),
      );

      expect(renameByOutsider.status).toBe(400);
      expect(renameByOutsider.json).toMatchObject({
        code: 'USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION',
      });
      expect(readByOutsider.status).toBe(400);
      expect(readByOutsider.json).toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
      expect(renameOtherWorkspace.status).toBe(400);
      expect(readOtherWorkspace.status).toBe(400);
      expect(renameMissing.status).toBe(400);
      // Nothing of A changed.
      expect(await rows(sql`select name from organizations where id = ${w.workspaceA}`)).toEqual([
        { name: 'Gym A' },
      ]);
    });
  });

  describe('condition 3: every read and write runs in the request’s tenant context', () => {
    it('NOT met as the web would wire it: on the app pool, without a context, the real Owner cannot read, rename or list', async () => {
      // createAuth gets one pool (`db`) when the server starts; no request context reaches it.
      const pool = probeAuth(app.db);

      const read = await call(
        pool,
        w.tokens.ownerA,
        'GET',
        `/get-organization?organizationId=${w.workspaceA}`,
      );
      const renamed = await call(pool, w.tokens.ownerA, 'POST', '/update', {
        organizationId: w.workspaceA,
        data: { name: 'Renamed' },
      });
      const listed = await call(pool, w.tokens.ownerA, 'GET', '/list');

      // The real owner of A is "not a member" and A "does not exist": RLS hides both.
      expect(read.status).toBe(400);
      expect(renamed.status).toBe(400);
      expect(listed.json).toEqual([]);
      expect(await rows(sql`select name from organizations where id = ${w.workspaceA}`)).toEqual([
        { name: 'Gym A' },
      ]);
    });

    it('met only by a Better Auth instance per request, built over the request’s transaction: read, rename and list work', async () => {
      const inA = { accountId: w.accounts.ownerA.id, workspaceIds: [w.workspaceA] };
      const [{ slug } = { slug: '' }] = await rows<{ slug: string }>(
        sql`select slug from organizations where id = ${w.workspaceA}`,
      );

      const read = await inTenantContext(inA, {}, (auth) =>
        call(auth, w.tokens.ownerA, 'GET', `/get-organization?organizationId=${w.workspaceA}`),
      );
      const renamed = await inTenantContext(inA, {}, (auth) =>
        call(auth, w.tokens.ownerA, 'POST', '/update', {
          organizationId: w.workspaceA,
          data: { name: 'Gym A Utrecht' },
        }),
      );
      const listed = await inTenantContext(inA, {}, (auth) =>
        call(auth, w.tokens.ownerA, 'GET', '/list'),
      );

      expect(read.status).toBe(200);
      expect(read.json).toMatchObject({ id: w.workspaceA, name: 'Gym A', slug });
      expect(renamed.status).toBe(200);
      expect(renamed.json).toMatchObject({ id: w.workspaceA, name: 'Gym A Utrecht', slug });
      expect(listed.json).toEqual([expect.objectContaining({ id: w.workspaceA })]);
      expect(await rows(sql`select name from organizations where id = ${w.workspaceA}`)).toEqual([
        { name: 'Gym A Utrecht' },
      ]);
    });

    // E011's policy `organizations_workspace` (migration 0008, WITH CHECK id = ANY(app_workspace_ids()))
    // asks for the id before the row exists, so any create has to choose the id first: our own
    // route too. The failure below is the policy, not the plugin.
    it('create under RLS needs the id chosen before the insert, for the plugin and for plain SQL alike', async () => {
      const outsider = { accountId: w.accounts.outsider.id, workspaceIds: [] };

      const viaPlugin = await reasonOf(
        inTenantContext(outsider, {}, (auth) =>
          auth.api.createOrganization({
            headers: new Headers({ authorization: `Bearer ${w.tokens.outsider}` }),
            body: { name: 'New', slug: 'new-plugin' },
          }),
        ),
      );
      const viaSql = await reasonOf(
        app.db.transaction(async (tx) => {
          await tx.execute(
            sql`select set_config('app.account_id', ${w.accounts.outsider.id}, true),
                       set_config('app.workspace_ids', '', true),
                       set_config('app.client_id', '', true)`,
          );
          await tx.execute(sql`insert into organizations (name, slug) values ('New', 'new-sql')`);
        }),
      );

      expect(viaPlugin).toContain('row-level security');
      expect(viaSql).toContain('row-level security');
      expect(await rows(sql`select slug from organizations where slug like 'new-%'`)).toEqual([]);
    });

    it('create works with an id chosen up front for the whole instance and a hook that hands it to the plugin', async () => {
      const { id, response } = await createThroughPlugin('outsider', 'new');

      expect(response.status).toBe(200);
      expect(response.json).toMatchObject({ id, name: 'New', slug: 'new' });
      expect(await teamRoles(id)).toEqual([{ account_id: w.accounts.outsider.id, role: 'owner' }]);
    });
  });

  describe('condition 4: the plugin’s fields map onto our column names without a second membership table', () => {
    it('met: a member is a team_members row (organization_id, account_id, role), made through the field mapping', async () => {
      const { id } = await createThroughPlugin('outsider', 'new-member-row');

      const [owner] = await rows(
        sql`select organization_id, account_id, role from team_members where organization_id = ${id}`,
      );

      expect(owner).toEqual({
        organization_id: id,
        account_id: w.accounts.outsider.id,
        role: 'owner',
      });
      const tables = await publicTables();
      expect(tables).not.toContain('member');
      expect(tables).not.toContain('members');
    });

    it('met without a column on auth_sessions: sign-in sessions, create, read, rename and list all ran with no `active_organization_id`', async () => {
      // The probe's `auth_sessions` has no `active_organization_id`: the drizzle adapter leaves the
      // field out, so the plugin's "open workspace on the session" quietly does nothing. We never
      // need it (the workspace is the `workspaceId` of the path), so it is not an extra.
      const columns = await rows<{ column_name: string }>(
        sql`select column_name from information_schema.columns where table_name = 'auth_sessions'`,
      );
      expect(columns.map((column) => column.column_name)).not.toContain('active_organization_id');

      const { response } = await createThroughPlugin('outsider', 'new-no-session-column');
      expect(response.status).toBe(200);
    });

    it('an extra: deleting a workspace needs an `invitation` table that we do not have', async () => {
      expect(await publicTables()).not.toContain('invitation');

      const reason = await reasonOf(
        inTenantContext(
          { accountId: w.accounts.ownerA.id, workspaceIds: [w.workspaceA] },
          {},
          (auth) =>
            auth.api.deleteOrganization({
              headers: new Headers({ authorization: `Bearer ${w.tokens.ownerA}` }),
              body: { organizationId: w.workspaceA },
            }),
        ),
      );

      expect(reason).toMatch(/invitation/i);
      expect(await rows(sql`select id from organizations where id = ${w.workspaceA}`)).toHaveLength(
        1,
      );
    });

    it('slug: the caller picks it and a rename can change it, unless a hook drops it', async () => {
      const inB = { accountId: w.accounts.ownerB.id, workspaceIds: [w.workspaceB] };
      const slugOfB = () =>
        rows<{ slug: string }>(sql`select slug from organizations where id = ${w.workspaceB}`);
      const before = await slugOfB();
      const rename = {
        organizationId: w.workspaceB,
        data: { name: 'Gym B', slug: 'another-slug' },
      };

      // Pinned: with `beforeUpdateOrganization` dropping the slug, the rename keeps the old one.
      const pinned = await inTenantContext(inB, { pinSlug: true }, (auth) =>
        call(auth, w.tokens.ownerB, 'POST', '/update', rename),
      );
      expect(pinned.status).toBe(200);
      expect(await slugOfB()).toEqual(before);

      // Not pinned (the plugin as it is): the slug changes.
      const free = await inTenantContext(inB, {}, (auth) =>
        call(auth, w.tokens.ownerB, 'POST', '/update', rename),
      );
      expect(free.status).toBe(200);
      expect(free.json).toMatchObject({ slug: 'another-slug' });
    });
  });
});
