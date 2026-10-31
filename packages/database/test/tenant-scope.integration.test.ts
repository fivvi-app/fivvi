import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createClient,
  createDatabase,
  createTenantScopes,
  type Database,
  type DatabaseClient,
  findClient,
  listClients,
  listMyWorkspaces,
  type Place,
  type WorkspaceScope,
} from '../src/index.ts';
import * as schema from '../src/schema/index.ts';
import {
  addClient,
  addTeamRole,
  createAccount,
  createWorkspace,
  readTenantContext,
} from '../src/testing/index.ts';

// The request transaction and its tenant scope (E011, #254): what the scope holds, when it is
// opened and when it is not. Everything connects as the app role, so RLS applies as well as the
// repositories' own filters; the data is seeded through the privileged connection.

const teamOnly = (place: Place) => (place.teamRole ? ('team' as const) : undefined);
const clientOnly = (place: Place) => (place.clientId ? ('client' as const) : undefined);
const teamOrClient = (place: Place) => teamOnly(place) ?? clientOnly(place);

describe('E011 the tenant scope of a request transaction', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;
  /** Every statement the logging connection ran, with its parameters. */
  const statements: { query: string; params: unknown[] }[] = [];
  let logging: { db: Database; close(): Promise<void> };

  // The workspaces and the people in them.
  let a: string;
  let b: string;
  let c: string;
  const people = {} as Record<
    'ownerA' | 'trainerA' | 'clientA' | 'sam' | 'outsider',
    { id: string }
  >;
  const records = {} as Record<
    'clientOfClientA' | 'clientOfSam' | 'otherClientA' | 'clientB',
    string
  >;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 4 });
    const pool = new pg.Pool({ connectionString: database.appUrl, max: 1 });
    logging = {
      db: drizzle({
        client: pool,
        schema,
        logger: { logQuery: (query, params) => statements.push({ query, params }) },
      }),
      close: () => pool.end(),
    };

    [a, b, c] = [
      (await createWorkspace(admin.db)).id,
      (await createWorkspace(admin.db)).id,
      (await createWorkspace(admin.db)).id,
    ];
    for (const name of ['ownerA', 'trainerA', 'clientA', 'sam', 'outsider'] as const) {
      people[name] = await createAccount(admin.db, { label: name.toLowerCase() });
    }
    await addTeamRole(admin.db, { workspaceId: a, accountId: people.ownerA.id, role: 'owner' });
    await addTeamRole(admin.db, { workspaceId: a, accountId: people.trainerA.id });
    records.clientOfClientA = (
      await addClient(admin.db, { workspaceId: a, accountId: people.clientA.id })
    ).id;
    // Sam: trainer and client in A, owner of B.
    await addTeamRole(admin.db, { workspaceId: a, accountId: people.sam.id });
    records.clientOfSam = (
      await addClient(admin.db, { workspaceId: a, accountId: people.sam.id })
    ).id;
    await addTeamRole(admin.db, { workspaceId: b, accountId: people.sam.id, role: 'owner' });
    records.otherClientA = (await addClient(admin.db, { workspaceId: a })).id;
    records.clientB = (await addClient(admin.db, { workspaceId: b })).id;
  });

  afterAll(async () => {
    await logging?.close();
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const scopes = () => createTenantScopes(() => app.db);

  const enter = <T>(
    accountId: string,
    workspaceId: string,
    admit: (place: Place) => 'team' | 'client' | undefined,
    run: (scope: WorkspaceScope) => Promise<T>,
  ) => scopes().inWorkspaceScope({ accountId, workspaceId, admit }, run);

  describe('a workspace scope', () => {
    it('AC9: holds exactly the workspace, the account, its team role and its client id', async () => {
      const entry = await enter(people.sam.id, a, teamOrClient, async (scope) => ({
        context: scope.context,
        stored: await readTenantContext(scope),
      }));

      expect(entry).toEqual({
        status: 'entered',
        value: {
          context: {
            accountId: people.sam.id,
            workspaceIds: [a],
            teamRole: 'trainer',
            clientId: records.clientOfSam,
            actingAs: 'team',
          },
          // Sam acts as a trainer here: the database context names no client, so Sam sees
          // what any trainer of A sees (PRODUCT.md §9).
          stored: { accountId: people.sam.id, workspaceIds: [a], clientId: null },
        },
      });
    });

    it('AC9: Sam in B is only an owner, and never sees A in the context', async () => {
      const entry = await enter(people.sam.id, b, teamOrClient, async (scope) => ({
        context: scope.context,
        stored: await readTenantContext(scope),
      }));

      expect(entry).toMatchObject({
        status: 'entered',
        value: {
          context: { workspaceIds: [b], teamRole: 'owner', actingAs: 'team' },
          stored: { workspaceIds: [b], clientId: null },
        },
      });
      expect((entry as { value: { context: object } }).value.context).not.toHaveProperty(
        'clientId',
      );
    });

    it('names the client in the database context when it acts as a client (Q2)', async () => {
      const entry = await enter(people.sam.id, a, clientOnly, async (scope) => ({
        context: scope.context,
        stored: await readTenantContext(scope),
      }));

      expect(entry).toMatchObject({
        status: 'entered',
        value: {
          context: { actingAs: 'client', clientId: records.clientOfSam, teamRole: 'trainer' },
          stored: { workspaceIds: [a], clientId: records.clientOfSam },
        },
      });
    });

    it('AC8: no place gives no scope: the run does not happen and A is never set', async () => {
      statements.length = 0;
      let ran = false;

      for (const workspaceId of [a, c, 'not-a-uuid', '00000000-0000-4000-8000-000000000000']) {
        const entry = await createTenantScopes(() => logging.db).inWorkspaceScope(
          { accountId: people.outsider.id, workspaceId, admit: () => 'team' },
          () => {
            ran = true;
            return Promise.resolve();
          },
        );
        expect(entry).toEqual({ status: 'no-place' });
      }

      expect(ran).toBe(false);
      // The context was set (the account, to look for a place) but never with a workspace.
      const contextSettings = statements.filter(({ query }) => query.includes('set_config'));
      expect(contextSettings.length).toBeGreaterThan(0);
      for (const { params } of contextSettings) {
        expect(params).not.toContain(a);
        expect(params).not.toContain(c);
      }
    });

    it('AC10: a place the access does not allow gives no scope and no workspace context', async () => {
      statements.length = 0;
      let ran = false;

      const entry = await createTenantScopes(() => logging.db).inWorkspaceScope(
        { accountId: people.trainerA.id, workspaceId: a, admit: () => undefined },
        () => {
          ran = true;
          return Promise.resolve();
        },
      );

      expect(entry).toEqual({ status: 'refused' });
      expect(ran).toBe(false);
      for (const { query, params } of statements) {
        if (query.includes('set_config')) expect(params).not.toContain(a);
      }
    });

    it('the place is the account’s own: a trainer is not let in as a client', async () => {
      // The trainer is a team member of A but not a client.
      const entry = await enter(people.trainerA.id, a, clientOnly, async () => 'ran');
      expect(entry).toEqual({ status: 'refused' });
    });

    it('commits with the request and the context never outlives it', async () => {
      // One connection: the next transaction reuses the one the scope ran on.
      const single = createDatabase({ url: database.appUrl, maxConnections: 1 });
      try {
        const scopesOnOne = createTenantScopes(() => single.db);
        const entry = await scopesOnOne.inWorkspaceScope(
          { accountId: people.ownerA.id, workspaceId: a, admit: teamOnly },
          async (scope) => createClient(scope, { name: 'Synthetic client' }),
        );
        expect(entry.status).toBe('entered');

        const [{ stored }] = [{ stored: await readUnscoped(single.db) }];
        expect(stored).toEqual({ accountId: null, workspaceIds: null, clientId: null });
        // The created client was committed.
        const created = (entry as { value: { id: string } }).value.id;
        expect(
          await admin.db.query.clients.findFirst({ where: (t, { eq }) => eq(t.id, created) }),
        ).toMatchObject({ organizationId: a });
      } finally {
        await single.close();
      }
    });

    it('rolls back when the run throws', async () => {
      const before = await admin.db.query.clients.findMany();

      await expect(
        enter(people.ownerA.id, a, teamOnly, async (scope) => {
          await createClient(scope, { name: 'Synthetic client' });
          throw new Error('the handler failed');
        }),
      ).rejects.toThrow('the handler failed');

      expect(await admin.db.query.clients.findMany()).toHaveLength(before.length);
    });
  });

  describe('repositories take a scope and filter by workspace themselves', () => {
    it('lists the clients of the scope’s workspace only', async () => {
      const entry = await enter(people.ownerA.id, a, teamOnly, (scope) => listClients(scope));

      const ids = (entry as { value: { id: string }[] }).value.map((client) => client.id).sort();
      const inA = await admin.db.query.clients.findMany({
        where: (t, { eq }) => eq(t.organizationId, a),
      });
      expect(ids).toEqual(inA.map((client) => client.id).sort());
      expect(ids).toEqual(
        expect.arrayContaining([
          records.clientOfClientA,
          records.clientOfSam,
          records.otherClientA,
        ]),
      );
      expect(ids).not.toContain(records.clientB);
    });

    it('does not widen on a connection that RLS does not apply to', async () => {
      // The privileged connection bypasses RLS: only the repository’s own filter keeps B out.
      const scopesAsAdmin = createTenantScopes(() => admin.db);
      const entry = await scopesAsAdmin.inWorkspaceScope(
        { accountId: people.ownerA.id, workspaceId: a, admit: teamOnly },
        async (scope) => ({
          list: await listClients(scope),
          other: await findClient(scope, records.clientB),
        }),
      );

      expect(entry).toMatchObject({ status: 'entered', value: { other: undefined } });
      const list = (entry as { value: { list: { workspaceId: string }[] } }).value.list;
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((client) => client.workspaceId === a)).toBe(true);
    });

    it('a client sees only their own client record, the repository and RLS agreeing', async () => {
      const entry = await enter(people.clientA.id, a, clientOnly, async (scope) => ({
        list: await listClients(scope),
        own: await findClient(scope, records.clientOfClientA),
        other: await findClient(scope, records.otherClientA),
        sams: await findClient(scope, records.clientOfSam),
      }));

      expect(entry).toMatchObject({
        status: 'entered',
        value: {
          list: [{ id: records.clientOfClientA }],
          own: { id: records.clientOfClientA, workspaceId: a },
          other: undefined,
          sams: undefined,
        },
      });
    });

    it('a team member sees every client of the workspace, Sam’s client side adding nothing', async () => {
      const asTrainer = await enter(people.trainerA.id, a, teamOnly, (scope) => listClients(scope));
      const asSam = await enter(people.sam.id, a, teamOrClient, (scope) => listClients(scope));

      const idsOf = (entry: unknown) =>
        (entry as { value: { id: string }[] }).value.map((client) => client.id).sort();
      expect(idsOf(asSam)).toEqual(idsOf(asTrainer));
      expect(idsOf(asSam)).toEqual(
        expect.arrayContaining([
          records.clientOfClientA,
          records.clientOfSam,
          records.otherClientA,
        ]),
      );
    });

    it('a record id of another workspace is not found', async () => {
      const entry = await enter(people.ownerA.id, a, teamOnly, (scope) =>
        findClient(scope, records.clientB),
      );

      expect(entry).toEqual({ status: 'entered', value: undefined });
    });

    it('writes into the scope’s workspace, whatever the caller asks', async () => {
      const entry = await enter(people.ownerA.id, a, teamOnly, async (scope) => {
        const created = await createClient(scope, { name: 'Synthetic client' });
        throw Object.assign(new Error('rollback'), { created });
      }).catch((error: { created: { workspaceId: string } }) => error);

      expect((entry as { created: { workspaceId: string } }).created.workspaceId).toBe(a);
    });
  });

  describe('the repositories do not take a raw executor', () => {
    // The `@ts-expect-error` lines are the test: `pnpm typecheck` fails when one of them
    // type-checks. At run time the call must fail too.
    it('a database, or a hand-built object, is no tenant scope', async () => {
      const id = records.clientB;
      const handBuilt = {
        context: { accountId: people.ownerA.id, workspaceIds: [b] },
      };

      // @ts-expect-error a raw executor is not a TenantScope
      await expect(async () => listClients(app.db)).rejects.toThrow('Not a tenant scope');
      // @ts-expect-error a raw executor is not a TenantScope
      await expect(async () => findClient(app.db, id)).rejects.toThrow('Not a tenant scope');
      // @ts-expect-error a raw executor is not a TenantScope
      await expect(async () => listMyWorkspaces(app.db)).rejects.toThrow('Not a tenant scope');
      // @ts-expect-error a hand-built object is not a TenantScope
      await expect(async () => listClients(handBuilt)).rejects.toThrow('Not a tenant scope');
    });
  });

  describe('an account scope', () => {
    const workspacesOf = async (
      accountId: string,
      workspaces: 'team' | 'client' | 'any',
    ): Promise<{ stored: string[] | null; listed: { workspaceId: string }[] }> =>
      scopes().inAccountScope({ accountId, workspaces }, async (scope) => ({
        stored: (await readTenantContext(scope)).workspaceIds,
        listed: await listMyWorkspaces(scope),
      }));

    it('AC13: holds only the workspaces where the account has the relationship asked for', async () => {
      const team = await workspacesOf(people.sam.id, 'team');
      const client = await workspacesOf(people.sam.id, 'client');
      const any = await workspacesOf(people.sam.id, 'any');

      expect(team.stored?.sort()).toEqual([a, b].sort());
      expect(client.stored).toEqual([a]);
      expect(any.stored?.sort()).toEqual([a, b].sort());
      expect(team.listed.map((place) => place.workspaceId).sort()).toEqual([a, b].sort());
      expect(client.listed.map((place) => place.workspaceId)).toEqual([a]);
    });

    it('AC13: an account without a place anywhere has an empty context and sees nothing', async () => {
      const result = await workspacesOf(people.outsider.id, 'any');

      expect(result).toEqual({ stored: null, listed: [] });
    });

    it('AC13: another account’s workspaces are not in it', async () => {
      const result = await workspacesOf(people.clientA.id, 'any');

      expect(result.stored).toEqual([a]);
      expect(result.listed).toHaveLength(1);
    });
  });
});

/** The context a fresh transaction on the connection starts with. */
function readUnscoped(db: Database) {
  return db.transaction(async (tx) => {
    const { sql } = await import('drizzle-orm');
    const [row] = (
      await tx.execute(
        sql`select app_account_id() as account, app_workspace_ids() as workspaces, app_client_id() as client`,
      )
    ).rows;
    return {
      accountId: row?.account ?? null,
      workspaceIds: row?.workspaces ?? null,
      clientId: row?.client ?? null,
    };
  });
}
