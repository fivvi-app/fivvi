import * as database from '@fivvi/database';
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// F002 (spec #170, first ticket, #276): does Better Auth's organization plugin (ADR-007) fit
// E011's `organizations` and `team_members` tables? This file is the evidence for the four
// conditions of the ticket, against the plugin version this repo pins (better-auth 1.7.12) and a
// real Postgres, with every query running as the app role `fivvi_app` (RLS forced, no BYPASSRLS).
// The plugin is configured in this test only; nothing of it is in `src/`. Each test names what the
// plugin does and which condition it settles; the outcome is recorded in ADR-022.

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const ORIGIN = 'http://localhost:3000';
const NO_SUCH_WORKSPACE = '0197c0de-0000-7000-8000-0000000000ff';
const CHOSEN_WORKSPACE = '0197c0de-0000-7000-8000-0000000000c1';

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
// The plugin writes the workspace a session has open (`activeOrganizationId`) on `auth_sessions`.
const sessionsTable = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: instant('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  activeOrganizationId: uuid('active_organization_id'),
});

interface ProbeOptions {
  /** Ids made by the application instead of Postgres (the only way to choose a workspace's id). */
  generateId?: () => string;
  presetOrganizationId?: string;
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
        ...(presetOrganizationId
          ? {
              organizationHooks: {
                beforeCreateOrganization: () =>
                  Promise.resolve({ data: { id: presetOrganizationId } }),
              },
            }
          : {}),
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

describe('F002 does Better Auth’s organization plugin fit E011’s tables?', () => {
  let testDatabase: TestDatabase;
  let admin: DatabaseClient;
  /** The connection the web runs on: the app role, RLS applies. */
  let app: DatabaseClient;
  let workspaceA: string;
  let workspaceB: string;
  let accounts: Record<'ownerA' | 'trainerA' | 'ownerB' | 'outsider', { id: string }>;
  let tokens: Record<'ownerA' | 'trainerA' | 'ownerB' | 'outsider', string>;

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
    await admin.db.execute(
      sql`alter table organizations
            add column name text not null default '',
            add column slug text not null default gen_random_uuid()::text unique`,
    );
    await admin.db.execute(sql`alter table auth_sessions add column active_organization_id uuid`);

    const person = (label: string) => createAccount(admin.db, { label });
    const [ownerA, trainerA, ownerB, outsider] = await Promise.all(
      ['owner-a', 'trainer-a', 'owner-b', 'outsider'].map(person),
    );
    accounts = {
      ownerA: must(ownerA, 'owner of A'),
      trainerA: must(trainerA, 'trainer of A'),
      ownerB: must(ownerB, 'owner of B'),
      outsider: must(outsider, 'outsider'),
    };
    workspaceA = await workspace('Gym A', 'gym-a');
    workspaceB = await workspace('Gym B', 'gym-b');
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
    tokens = {
      ownerA: await sessionOf(accounts.ownerA.id),
      trainerA: await sessionOf(accounts.trainerA.id),
      ownerB: await sessionOf(accounts.ownerB.id),
      outsider: await sessionOf(accounts.outsider.id),
    };
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
      const before = await teamRoles(workspaceA);

      // addMember is the server-only call a hand-written route would make.
      await expect(
        inTenantContext({ accountId: accounts.ownerA.id, workspaceIds: [workspaceA] }, {}, (auth) =>
          auth.api.addMember({
            body: { userId: accounts.trainerA.id, role: 'owner', organizationId: workspaceA },
          }),
        ),
      ).rejects.toThrow('User is already a member of this organization');

      expect(await teamRoles(workspaceA)).toEqual(before);
    });

    it('met, through the database: only owner and trainer exist; the plugin’s role lists and its default role fail in the enum', async () => {
      const [member] = await rows<{ id: string }>(
        sql`select id from team_members where account_id = ${accounts.trainerA.id}`,
      );
      const memberId = must(member?.id, 'trainer’s membership');
      const headers = new Headers({ authorization: `Bearer ${tokens.ownerA}` });
      const inA = { accountId: accounts.ownerA.id, workspaceIds: [workspaceA] };

      // The plugin accepts a list of roles and stores it as "owner,trainer".
      expect(
        await reasonOf(
          inTenantContext(inA, {}, (auth) =>
            auth.api.updateMemberRole({
              headers,
              body: { memberId, role: ['owner', 'trainer'], organizationId: workspaceA },
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
                userId: accounts.outsider.id,
                role: 'member' as never,
                organizationId: workspaceA,
              },
            }),
          ),
        ),
      ).toContain('invalid input value for enum team_role: "member"');

      const after = await teamRoles(workspaceA);
      expect(after.find((row) => row.account_id === accounts.trainerA.id)?.role).toBe('trainer');
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
        rename(workspaceA),
      );

      expect(response.status).toBe(401);
    });

    it('met: 403 when the role is not allowed to rename', async () => {
      const response = await inTenantContext(
        { accountId: accounts.trainerA.id, workspaceIds: [workspaceA] },
        {},
        (auth) => call(auth, tokens.trainerA, 'POST', '/update', rename(workspaceA)),
      );

      expect(response.status).toBe(403);
      expect(response.json).toMatchObject({
        code: 'YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION',
      });
    });

    it('NOT met: no place in the workspace is 400, never 404 (rename, read, other workspace, missing)', async () => {
      const outsideA = { accountId: accounts.outsider.id, workspaceIds: [] };
      const inB = { accountId: accounts.ownerB.id, workspaceIds: [workspaceB] };

      const renameByOutsider = await inTenantContext(outsideA, {}, (auth) =>
        call(auth, tokens.outsider, 'POST', '/update', rename(workspaceA)),
      );
      const readByOutsider = await inTenantContext(outsideA, {}, (auth) =>
        call(auth, tokens.outsider, 'GET', `/get-organization?organizationId=${workspaceA}`),
      );
      const renameOtherWorkspace = await inTenantContext(inB, {}, (auth) =>
        call(auth, tokens.ownerB, 'POST', '/update', rename(workspaceA)),
      );
      const readOtherWorkspace = await inTenantContext(inB, {}, (auth) =>
        call(auth, tokens.ownerB, 'GET', `/get-organization?organizationId=${workspaceA}`),
      );
      const renameMissing = await inTenantContext(outsideA, {}, (auth) =>
        call(auth, tokens.outsider, 'POST', '/update', rename(NO_SUCH_WORKSPACE)),
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
      expect(await rows(sql`select name from organizations where id = ${workspaceA}`)).toEqual([
        { name: 'Gym A' },
      ]);
    });
  });

  describe('condition 3: every read and write runs in the request’s tenant context', () => {
    it('NOT met as the web would wire it: on the app pool, without a context, nobody can create, read or rename', async () => {
      // createAuth gets one pool (`db`) when the server starts; no request context reaches it.
      const pool = probeAuth(app.db);

      const created = await call(pool, tokens.outsider, 'POST', '/create', {
        name: 'New',
        slug: 'new',
      });
      const read = await call(
        pool,
        tokens.ownerA,
        'GET',
        `/get-organization?organizationId=${workspaceA}`,
      );
      const renamed = await call(pool, tokens.ownerA, 'POST', '/update', {
        organizationId: workspaceA,
        data: { name: 'Renamed' },
      });
      const listed = await call(pool, tokens.ownerA, 'GET', '/list');

      // The insert is refused by RLS ("new row violates row-level security policy").
      expect(created.status).toBe(500);
      // The real owner of A is "not a member" and A "does not exist": RLS hides both.
      expect(read.status).toBe(400);
      expect(renamed.status).toBe(400);
      expect(listed.json).toEqual([]);
      expect(await rows(sql`select slug from organizations where slug = 'new'`)).toEqual([]);
    });

    it('met only by a Better Auth instance per request, built over the request’s transaction: read, rename and list work', async () => {
      const inA = { accountId: accounts.ownerA.id, workspaceIds: [workspaceA] };

      const read = await inTenantContext(inA, {}, (auth) =>
        call(auth, tokens.ownerA, 'GET', `/get-organization?organizationId=${workspaceA}`),
      );
      const renamed = await inTenantContext(inA, {}, (auth) =>
        call(auth, tokens.ownerA, 'POST', '/update', {
          organizationId: workspaceA,
          data: { name: 'Gym A Utrecht' },
        }),
      );
      const listed = await inTenantContext(inA, {}, (auth) =>
        call(auth, tokens.ownerA, 'GET', '/list'),
      );

      expect(read.status).toBe(200);
      expect(read.json).toMatchObject({ id: workspaceA, name: 'Gym A', slug: 'gym-a' });
      expect(renamed.status).toBe(200);
      expect(renamed.json).toMatchObject({ id: workspaceA, name: 'Gym A Utrecht', slug: 'gym-a' });
      expect(listed.json).toEqual([expect.objectContaining({ id: workspaceA })]);
      expect(await rows(sql`select name from organizations where id = ${workspaceA}`)).toEqual([
        { name: 'Gym A Utrecht' },
      ]);
    });

    it('NOT met for create, even then: Postgres makes the workspace’s id, after the context was set', async () => {
      const response = await inTenantContext(
        { accountId: accounts.outsider.id, workspaceIds: [] },
        {},
        (auth) => call(auth, tokens.outsider, 'POST', '/create', { name: 'New', slug: 'new' }),
      );

      expect(response.status).toBe(500);
      expect(await rows(sql`select slug from organizations where slug = 'new'`)).toEqual([]);
    });

    it('create works only with an id chosen up front by the application, and a hook that hands it to the plugin', async () => {
      const response = await inTenantContext(
        { accountId: accounts.outsider.id, workspaceIds: [CHOSEN_WORKSPACE] },
        { generateId: () => crypto.randomUUID(), presetOrganizationId: CHOSEN_WORKSPACE },
        (auth) => call(auth, tokens.outsider, 'POST', '/create', { name: 'New', slug: 'new' }),
      );

      expect(response.status).toBe(200);
      expect(response.json).toMatchObject({ id: CHOSEN_WORKSPACE, name: 'New', slug: 'new' });
      expect(await teamRoles(CHOSEN_WORKSPACE)).toEqual([
        { account_id: accounts.outsider.id, role: 'owner' },
      ]);
    });

    it('the request’s transaction is out of reach of packages/auth: the database package keeps it sealed', () => {
      // The plugin can only run in a tenant scope's transaction if the database package exports
      // its executor. E011 keeps it inside, so repositories are the only code that reads and writes.
      expect(Object.keys(database)).not.toContain('executorOf');
      expect(Object.keys(database)).toContain('createTenantScopes');
    });
  });

  describe('condition 4: the plugin’s fields map onto our column names without a second membership table', () => {
    it('met: a member is a team_members row (organization_id, account_id, role), made through the field mapping', async () => {
      // The workspace the create test made, with its Owner.
      const [owner] = await rows(
        sql`select organization_id, account_id, role from team_members
            where organization_id = ${CHOSEN_WORKSPACE}`,
      );

      expect(owner).toEqual({
        organization_id: CHOSEN_WORKSPACE,
        account_id: accounts.outsider.id,
        role: 'owner',
      });
      const tables = await publicTables();
      expect(tables).not.toContain('member');
      expect(tables).not.toContain('members');
    });

    it('met, with extras: a column on auth_sessions, an invitation table, and a slug that the caller picks and a rename can change', async () => {
      // The plugin writes the open workspace on the session; F002 adds that column.
      const [column] = await rows(
        sql`select column_name from information_schema.columns
            where table_name = 'auth_sessions' and column_name = 'active_organization_id'`,
      );
      expect(column).toBeDefined();

      // Deleting a workspace and inviting use an `invitation` table that does not exist yet.
      expect(await publicTables()).not.toContain('invitation');

      // The plugin takes the slug from the caller and lets a rename change it; F002 makes the slug
      // from the name and never changes it (AC2, AC6).
      const response = await inTenantContext(
        { accountId: accounts.ownerB.id, workspaceIds: [workspaceB] },
        {},
        (auth) =>
          call(auth, tokens.ownerB, 'POST', '/update', {
            organizationId: workspaceB,
            data: { name: 'Gym B', slug: 'another-slug' },
          }),
      );
      expect(response.status).toBe(200);
      expect(response.json).toMatchObject({ slug: 'another-slug' });
    });
  });
});
