import { cloneTemplateDatabase, type TestDatabase, withRollback } from '@fivvi/testing/database';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  organizations,
} from '../src/index.ts';
import {
  addClient,
  addTeamRole,
  createAccount,
  createWorkspace,
  type IsolationFactory,
  isolationFactories,
} from '../src/testing/index.ts';
import { findTablesWithoutIsolationFactory, listIsolatedTables } from './conventions.ts';
import { RULES } from './tenancy-rules.ts';

// These tests connect as the app role, `fivvi_app`, the role RLS applies to (a login role that
// the test setup creates once per server), and seed through the privileged connection, which
// RLS does not apply to. Reads and writes happen in a transaction with the tenant context set
// the way the API will set it: `set_config(name, value, true)`, transaction-local.

interface Context {
  workspaceIds?: string[];
  accountId?: string;
  clientId?: string;
}

async function setContext(tx: DatabaseExecutor, context: Context): Promise<void> {
  const settings: [string, string | undefined][] = [
    ['app.workspace_ids', context.workspaceIds?.join(',')],
    ['app.account_id', context.accountId],
    ['app.client_id', context.clientId],
  ];
  for (const [name, value] of settings) {
    if (value !== undefined) await tx.execute(sql`select set_config(${name}, ${value}, true)`);
  }
}

async function rows<T>(db: DatabaseExecutor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

function scopeOf(factory: IsolationFactory) {
  return sql.identifier(factory.scopeColumn === 'id' ? 'id' : 'organization_id');
}

/** The ids of a table's rows that the connection can see, with the workspace each belongs to. */
function visible(tx: DatabaseExecutor, table: string, factory: IsolationFactory) {
  return rows<{ id: string; scope: string }>(
    tx,
    sql`select id, ${scopeOf(factory)} as scope from ${sql.identifier(table)} order by id`,
  );
}

/** An RLS violation (insufficient_privilege): a write that RLS refused. */
const REFUSED = { cause: { code: '42501' } };

/** Runs `statement` in a savepoint, so a refusal does not abort the surrounding transaction. */
function refused(tx: DatabaseExecutor, statement: (inner: DatabaseExecutor) => Promise<unknown>) {
  return expect(tx.transaction((inner) => statement(inner))).rejects.toMatchObject(REFUSED);
}

interface Scenario {
  a: string;
  b: string;
  /** Sam: trainer and client in A, owner of B (PRODUCT.md §9). */
  sam: { accountId: string; teamRoleInA: string; clientInA: string; teamRoleInB: string };
  /** Another client of A, with no account. */
  otherClientInA: string;
  /** The ids of every row of each table, per workspace. */
  rows: Record<string, { a: string[]; b: string[] }>;
}

/** Two workspaces with a row of every table in each, plus Sam. Committed through `admin`. */
async function seedScenario(admin: DatabaseExecutor): Promise<Scenario> {
  const [a, b] = [(await createWorkspace(admin)).id, (await createWorkspace(admin)).id];
  const sam = await createAccount(admin, { label: 'sam' });
  const teamRoleInA = (await addTeamRole(admin, { workspaceId: a, accountId: sam.id })).id;
  const clientInA = (await addClient(admin, { workspaceId: a, accountId: sam.id })).id;
  const teamRoleInB = (
    await addTeamRole(admin, { workspaceId: b, accountId: sam.id, role: 'owner' })
  ).id;
  const otherClientInA = (await addClient(admin, { workspaceId: a })).id;

  // A row of every other table in both workspaces, from the registry.
  for (const [table, factory] of Object.entries(isolationFactories)) {
    if (table === 'organizations') continue;
    await factory.create(admin, a);
    await factory.create(admin, b);
  }
  const all: Scenario['rows'] = {};
  for (const [table, factory] of Object.entries(isolationFactories)) {
    const found = await visible(admin, table, factory);
    all[table] = {
      a: found.filter((row) => row.scope === a).map((row) => row.id),
      b: found.filter((row) => row.scope === b).map((row) => row.id),
    };
  }
  return {
    a,
    b,
    sam: { accountId: sam.id, teamRoleInA, clientInA, teamRoleInB },
    otherClientInA,
    rows: all,
  };
}

/** A snapshot of every table, read as the privileged role, to prove nothing changed. */
async function snapshot(admin: DatabaseExecutor): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const table of Object.keys(isolationFactories)) {
    const [row] = await rows<{ digest: string }>(
      admin,
      sql`select coalesce(md5(string_agg(t::text, ',' order by t.id)), '') as digest
          from ${sql.identifier(table)} t`,
    );
    result[table] = row?.digest ?? '';
  }
  return result;
}

describe('E011 RLS as the app role', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;
  let scenario: Scenario;
  let privilegedRole: string;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 2 });
    scenario = await seedScenario(admin.db);
    privilegedRole =
      (await rows<{ name: string }>(admin.db, sql`select current_user as name`))[0]?.name ?? '';
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  it('AC15: every business table has an isolation factory', async () => {
    await withRollback(admin.db, async (tx) => {
      // The real schema: every table of the suite has one.
      expect(await findTablesWithoutIsolationFactory(tx, RULES, isolationFactories)).toEqual([]);
      expect(await listIsolatedTables(tx, RULES)).toEqual(
        expect.arrayContaining(['organizations', 'team_members', 'clients']),
      );

      // A business table without one fails, naming the table.
      await tx.execute(sql`create table probe (id uuid primary key default gen_random_uuid())`);
      expect(await findTablesWithoutIsolationFactory(tx, RULES, isolationFactories)).toEqual([
        'probe: no isolation factory (add it to isolationFactories)',
      ]);
    });
  });

  describe('AC4: the app role cannot bypass RLS or change policies', () => {
    it('logs in as fivvi_app with no privilege beyond the tables it was granted', async () => {
      const [role] = await rows<Record<string, unknown>>(
        app.db,
        sql`select current_user as name, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole,
                   rolcreatedb, rolreplication
            from pg_roles where rolname = current_user`,
      );
      expect(role).toEqual({
        name: 'fivvi_app',
        rolcanlogin: true,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
      });
    });

    it('owns no table, schema, function or type', async () => {
      const [owned] = await rows<{ count: number }>(
        app.db,
        sql`select (
              (select count(*) from pg_class where relowner = (select oid from pg_roles where rolname = current_user))
            + (select count(*) from pg_namespace where nspowner = (select oid from pg_roles where rolname = current_user))
            + (select count(*) from pg_proc where proowner = (select oid from pg_roles where rolname = current_user))
            + (select count(*) from pg_type where typowner = (select oid from pg_roles where rolname = current_user))
            )::int as count`,
      );
      expect(owned?.count).toBe(0);
    });

    it('is not a member of the privileged role and cannot SET ROLE to it', async () => {
      expect(privilegedRole).not.toBe('');
      const [membership] = await rows<{ member: boolean }>(
        app.db,
        sql`select pg_has_role(current_user, ${privilegedRole}, 'member') as member`,
      );
      expect(membership?.member).toBe(false);
      await withRollback(app.db, (tx) =>
        refused(tx, (inner) => inner.execute(sql`set role ${sql.identifier(privilegedRole)}`)),
      );
    });

    it('cannot alter or drop a policy, or disable, unforce or bypass RLS', async () => {
      await withRollback(app.db, async (tx) => {
        const attempts = [
          sql`alter policy clients_workspace on clients using (true)`,
          sql`drop policy clients_workspace on clients`,
          sql`alter table clients disable row level security`,
          sql`alter table clients no force row level security`,
          sql`alter table clients owner to fivvi_app`,
          sql`create policy clients_open on clients using (true)`,
          sql`alter role fivvi_app bypassrls`,
          sql`alter role fivvi_app superuser`,
          sql`create role fivvi_other`,
          sql`truncate clients`,
          sql`create table escape (id int)`,
          sql`drop table clients`,
        ];
        for (const attempt of attempts) await refused(tx, (inner) => inner.execute(attempt));
      });
    });

    it('cannot turn row_security off to read around the policies', async () => {
      await withRollback(app.db, async (tx) => {
        await tx.execute(sql`set local row_security = off`);
        // Postgres refuses the query rather than skip the policies for a role without BYPASSRLS.
        await expect(tx.execute(sql`select id from clients`)).rejects.toMatchObject({
          cause: { code: '42501' },
        });
      });
    });

    it('has no privilege beyond select, insert, update and delete, and none on the migration history', async () => {
      const [odd] = await rows<{ count: number }>(
        app.db,
        sql`select count(*)::int as count
            from pg_tables t
            cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p
            where t.schemaname = 'public'
              and has_table_privilege(current_user, format('public.%I', t.tablename), p)`,
      );
      expect(odd?.count).toBe(0);
      await withRollback(app.db, (tx) =>
        refused(tx, (inner) => inner.execute(sql`select * from drizzle.__drizzle_migrations`)),
      );
      const [create] = await rows<{ schema_create: boolean; database_create: boolean }>(
        app.db,
        sql`select has_schema_privilege('public', 'CREATE') as schema_create,
                   has_database_privilege(current_database(), 'CREATE') as database_create`,
      );
      expect(create).toEqual({ schema_create: false, database_create: false });
    });
  });

  describe('AC5: RLS alone blocks cross-workspace reads and writes on every business table', () => {
    it('AC5: as the app role with the context of B, no row of A is returned or changed', async () => {
      const before = await snapshot(admin.db);
      const tables = await listIsolatedTables(admin.db, RULES);
      expect(tables.length).toBeGreaterThan(0);

      for (const table of tables) {
        const factory = isolationFactories[table];
        // Not a skip: a table without a factory fails the suite, naming the table.
        if (!factory) throw new Error(`${table}: no isolation factory`);
        await withRollback(app.db, async (tx) => {
          await setContext(tx, { workspaceIds: [scenario.b] });
          const scope = scopeOf(factory);
          const name = sql.identifier(table);

          // Reads: exactly B's rows, none of A's.
          const found = await visible(tx, table, factory);
          expect(
            found.map((row) => row.id),
            `${table} read`,
          ).toEqual([...(scenario.rows[table]?.b ?? [])].sort());
          expect(found.length, `${table} has rows of B to see`).toBeGreaterThan(0);
          expect(found.every((row) => row.scope === scenario.b)).toBe(true);

          // Inserting a row of A fails with an RLS error.
          await refused(tx, (inner) => factory.create(inner, scenario.a));
          // Moving a row of B to A fails with an RLS error.
          await refused(tx, (inner) =>
            inner.execute(
              sql`update ${name} set ${scope} = ${scenario.a} where ${scope} = ${scenario.b}`,
            ),
          );
          // An update or delete aimed at A's rows changes nothing.
          const updated = await rows(
            tx,
            sql`update ${name} set updated_at = now() where ${scope} = ${scenario.a} returning id`,
          );
          const deleted = await rows(
            tx,
            sql`delete from ${name} where ${scope} = ${scenario.a} returning id`,
          );
          expect(updated, `${table} update of A`).toEqual([]);
          expect(deleted, `${table} delete of A`).toEqual([]);
        });
      }

      expect(await snapshot(admin.db)).toEqual(before);
    });

    it("AC5: the only rows of A that B can see are the account's own, and only to read", async () => {
      const before = await snapshot(admin.db);
      const ownAccountTables = ['team_members', 'clients'];
      const context = { workspaceIds: [scenario.b], accountId: scenario.sam.accountId };

      await withRollback(app.db, async (tx) => {
        await setContext(tx, context);
        for (const [table, factory] of Object.entries(isolationFactories)) {
          const found = await visible(tx, table, factory);
          const inA = found.filter((row) => row.scope === scenario.a).map((row) => row.id);
          const expectedInA =
            table === 'team_members'
              ? [scenario.sam.teamRoleInA]
              : table === 'clients'
                ? [scenario.sam.clientInA]
                : [];
          // Sam's own rows in A and nothing else of A: not the other trainers or clients.
          expect(inA, `${table} rows of A`).toEqual(expectedInA);
          expect(
            found.filter((row) => row.scope === scenario.b).map((row) => row.id),
            `${table} rows of B`,
          ).toEqual([...(scenario.rows[table]?.b ?? [])].sort());
        }

        // Read-only: Sam's own rows in A cannot be changed or removed, nor can rows be added.
        for (const table of ownAccountTables) {
          const factory = isolationFactories[table];
          if (!factory) throw new Error(`${table}: no isolation factory`);
          const name = sql.identifier(table);
          expect(
            await rows(
              tx,
              sql`update ${name} set updated_at = now() where organization_id = ${scenario.a} returning id`,
            ),
            `${table} update in A`,
          ).toEqual([]);
          expect(
            await rows(
              tx,
              sql`delete from ${name} where organization_id = ${scenario.a} returning id`,
            ),
            `${table} delete in A`,
          ).toEqual([]);
          await refused(tx, (inner) => factory.create(inner, scenario.a));
        }
      });

      expect(await snapshot(admin.db)).toEqual(before);
    });

    it('AC5: an account with no workspace in the context reads only its own rows of the core tables', async () => {
      await withRollback(app.db, async (tx) => {
        await setContext(tx, { accountId: scenario.sam.accountId });
        for (const [table, factory] of Object.entries(isolationFactories)) {
          const found = (await visible(tx, table, factory)).map((row) => row.id);
          const own =
            table === 'team_members'
              ? [scenario.sam.teamRoleInA, scenario.sam.teamRoleInB]
              : table === 'clients'
                ? [scenario.sam.clientInA]
                : [];
          expect(found, table).toEqual([...own].sort());
        }
      });
    });

    it('AC5: an account that is nobody in the workspace sees nothing of it', async () => {
      const stranger = await createAccount(admin.db, { label: 'stranger' });
      await withRollback(app.db, async (tx) => {
        await setContext(tx, { workspaceIds: [], accountId: stranger.id });
        for (const [table, factory] of Object.entries(isolationFactories)) {
          expect(await visible(tx, table, factory), table).toEqual([]);
        }
      });
    });
  });

  it("AC6: no context or a previous transaction's context sees nothing", async () => {
    // Commits, so it gets a database of its own (TESTING.md §5.3).
    const own = await cloneTemplateDatabase();
    const owner = createDatabase({ url: own.url, maxConnections: 1 });
    // One connection, so the second transaction reuses the first one's session.
    const pooled = createDatabase({ url: own.appUrl, maxConnections: 1 });
    try {
      const seeded = await seedScenario(owner.db);
      const committed = await snapshot(owner.db);
      const tables = Object.entries(isolationFactories);
      const pid = async (tx: DatabaseExecutor) =>
        (await rows<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`))[0]?.pid;

      const noContext = async (tx: DatabaseExecutor) => {
        for (const [table, factory] of tables) {
          expect(await visible(tx, table, factory), `${table} read`).toEqual([]);
          const name = sql.identifier(table);
          const scope = scopeOf(factory);
          await refused(tx, (inner) => factory.create(inner, seeded.a));
          await refused(tx, (inner) => factory.create(inner, seeded.b));
          expect(
            await rows(
              tx,
              sql`update ${name} set updated_at = now() where ${scope} in (${seeded.a}, ${seeded.b}) returning id`,
            ),
            `${table} update`,
          ).toEqual([]);
          expect(
            await rows(
              tx,
              sql`delete from ${name} where ${scope} in (${seeded.a}, ${seeded.b}) returning id`,
            ),
            `${table} delete`,
          ).toEqual([]);
        }
      };

      // A fresh connection has no context.
      let first: number | undefined;
      await pooled.db.transaction(async (tx) => {
        first = await pid(tx);
        await noContext(tx);
      });

      // A transaction with A's context sees A's rows, and commits.
      let second: number | undefined;
      await pooled.db.transaction(async (tx) => {
        second = await pid(tx);
        await setContext(tx, {
          workspaceIds: [seeded.a],
          accountId: seeded.sam.accountId,
          clientId: seeded.sam.clientInA,
        });
        for (const [table, factory] of tables) {
          expect(
            (await visible(tx, table, factory)).length,
            `${table} with A's context`,
          ).toBeGreaterThan(0);
        }
      });

      // The next transaction on the same connection sees nothing and may write nothing.
      let third: number | undefined;
      await pooled.db.transaction(async (tx) => {
        third = await pid(tx);
        const setting = await rows<{ value: string | null }>(
          tx,
          sql`select current_setting('app.workspace_ids', true) as value`,
        );
        expect(setting[0]?.value ?? '').toBe('');
        await noContext(tx);
      });
      expect([first, second, third].every((value) => value === first)).toBe(true);

      // The same after a rollback instead of a commit.
      await expect(
        pooled.db.transaction(async (tx) => {
          await setContext(tx, { workspaceIds: [seeded.a, seeded.b] });
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      await pooled.db.transaction(noContext);

      // Nothing changed in the committed data.
      expect(await owner.db.$count(organizations)).toBe(2);
      expect(await snapshot(owner.db)).toEqual(committed);
    } finally {
      await pooled.close();
      await owner.close();
      await own.drop();
    }
  });

  it("AC20: a client context sees and writes only its own client's rows", async () => {
    const before = await snapshot(admin.db);
    const x = scenario.sam.clientInA;
    const y = scenario.otherClientInA;

    await withRollback(app.db, async (tx) => {
      await setContext(tx, {
        workspaceIds: [scenario.a],
        accountId: scenario.sam.accountId,
        clientId: x,
      });
      // Only X's row of `clients`, though the workspace holds more.
      expect(await rows<{ id: string }>(tx, sql`select id from clients order by id`)).toEqual([
        { id: x },
      ]);
      // Writes for another client of A fail or change nothing.
      await refused(tx, (inner) => addClient(inner, { workspaceId: scenario.a }));
      await refused(tx, (inner) =>
        inner.execute(sql`insert into clients (organization_id) values (${scenario.a})`),
      );
      expect(
        await rows(tx, sql`update clients set updated_at = now() where id = ${y} returning id`),
      ).toEqual([]);
      expect(await rows(tx, sql`delete from clients where id = ${y} returning id`)).toEqual([]);
      // Moving X's own row to another client fails.
      await refused(tx, (inner) =>
        inner.execute(sql`update clients set id = ${y} where id = ${x}`),
      );
      await refused(tx, (inner) =>
        inner.execute(sql`update clients set id = gen_random_uuid() where id = ${x}`),
      );
      // Its own row it may change.
      expect(
        await rows(tx, sql`update clients set updated_at = now() where id = ${x} returning id`),
      ).toHaveLength(1);
    });

    // A team context for A sees all of A's clients and may write for any of them.
    await withRollback(app.db, async (tx) => {
      await setContext(tx, { workspaceIds: [scenario.a], accountId: scenario.sam.accountId });
      const found = (await rows<{ id: string }>(tx, sql`select id from clients`)).map(
        (row) => row.id,
      );
      expect(found.sort()).toEqual([...(scenario.rows.clients?.a ?? [])].sort());
      expect(found).toEqual(expect.arrayContaining([x, y]));
      expect(
        await rows(tx, sql`update clients set updated_at = now() where id = ${y} returning id`),
      ).toHaveLength(1);
      await expect(
        tx.execute(sql`insert into clients (organization_id) values (${scenario.a})`),
      ).resolves.toBeDefined();
    });

    expect(await snapshot(admin.db)).toEqual(before);
  });
});
