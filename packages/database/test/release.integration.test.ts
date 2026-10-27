import { createTestDatabase, withRollback } from '@fivvi/testing/database';
import { APP_ROLE_TEST_PASSWORD, appRoleUrl } from '@fivvi/testing/database/server';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { APP_TABLE_PRIVILEGES, ensureAppRole } from '../src/app-role.ts';
import { createDatabase, type DatabaseClient, type DatabaseExecutor } from '../src/index.ts';
import { release } from '../src/release.ts';

async function withFreshDatabase(
  test: (client: DatabaseClient, name: string) => Promise<void>,
): Promise<void> {
  const database = await createTestDatabase();
  const client = createDatabase({ url: database.url, maxConnections: 2 });
  try {
    await test(client, database.name);
  } finally {
    await client.close();
    await database.drop();
  }
}

async function rows<T>(db: DatabaseExecutor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

/** Everything about a role that decides what it can do, without its password hash. */
function roleAttributes(db: DatabaseExecutor, role: string) {
  return rows<Record<string, unknown>>(
    db,
    sql`select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
               rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil
        from pg_roles where rolname = ${role}`,
  );
}

/** The table privileges the app role has in `public`, per table. */
async function appGrants(db: DatabaseExecutor): Promise<Record<string, string[]>> {
  const grants = await rows<{ table_name: string; privileges: string[] }>(
    db,
    sql`select c.relname as table_name, array_agg(a.privilege_type order by a.privilege_type) as privileges
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(c.relacl) a
        join pg_roles r on r.oid = a.grantee and r.rolname = 'fivvi_app'
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        group by c.relname`,
  );
  return Object.fromEntries(grants.map((grant) => [grant.table_name, grant.privileges]));
}

async function publicTables(db: DatabaseExecutor): Promise<string[]> {
  const tables = await rows<{ tablename: string }>(
    db,
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return tables.map((table) => table.tablename);
}

describe('E011 app role in the release step', () => {
  it('AC18: the release step creates the app role idempotently', async () => {
    await withFreshDatabase(async (client, name) => {
      const logs: string[] = [];
      const options = { seed: false, appRolePassword: APP_ROLE_TEST_PASSWORD };

      await release(client.db, options, (message) => logs.push(message));
      const attributes = await roleAttributes(client.db, 'fivvi_app');
      const grants = await appGrants(client.db);
      await release(client.db, options, (message) => logs.push(message));

      // One role, the same attributes and the same grants after the second run.
      expect(await roleAttributes(client.db, 'fivvi_app')).toEqual(attributes);
      expect(attributes).toEqual([
        expect.objectContaining({
          rolname: 'fivvi_app',
          rolcanlogin: true,
          rolsuper: false,
          rolbypassrls: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolreplication: false,
        }),
      ]);
      expect(await appGrants(client.db)).toEqual(grants);
      expect(grants).toEqual(
        Object.fromEntries(
          Object.entries(APP_TABLE_PRIVILEGES).map(([table, privileges]) => [
            table,
            [...privileges].sort(),
          ]),
        ),
      );

      // It logs in with the password, and the password is not in the release log.
      const app = new pg.Client({ connectionString: appRoleUrl(name) });
      await app.connect();
      try {
        const { rows: current } = await app.query('select current_user as name');
        expect(current).toEqual([{ name: 'fivvi_app' }]);
      } finally {
        await app.end();
      }
      expect(logs.join('\n')).not.toContain(APP_ROLE_TEST_PASSWORD);
      expect(logs).toContain(
        'App role fivvi_app: login enabled, password set from APP_DATABASE_PASSWORD.',
      );
    });
  });

  it('AC18: every table has an entry in the app role privilege list, and no entry is stale', async () => {
    await withFreshDatabase(async (client) => {
      await release(client.db, { seed: false }, () => {});

      expect(Object.keys(APP_TABLE_PRIVILEGES).sort()).toEqual(await publicTables(client.db));
    });
  });

  it('AC18: gives the app role no privilege on the migration history', async () => {
    await withFreshDatabase(async (client) => {
      await release(client.db, { seed: false }, () => {});

      const [privileges] = await rows<{ schema_usage: boolean; history_select: boolean }>(
        client.db,
        sql`select has_schema_privilege('fivvi_app', 'drizzle', 'USAGE') as schema_usage,
                   has_table_privilege('fivvi_app', 'drizzle.__drizzle_migrations', 'SELECT') as history_select`,
      );
      expect(privileges).toEqual({ schema_usage: false, history_select: false });
    });
  });

  it('AC18: still succeeds when the password is not set yet, and says so', async () => {
    await withFreshDatabase(async (client) => {
      const logs: string[] = [];
      const before = await roleAttributes(client.db, 'fivvi_app');

      await release(client.db, { seed: false }, (message) => logs.push(message));

      // The role exists (the migration made it), keeps what it had, and the log tells the owner.
      expect(await roleAttributes(client.db, 'fivvi_app')).toEqual(before);
      expect(logs).toContain('Migrations applied.');
      expect(logs).toEqual(
        expect.arrayContaining([expect.stringMatching(/APP_DATABASE_PASSWORD is not set/)]),
      );
      expect(await appGrants(client.db)).toMatchObject({ clients: expect.any(Array) });
    });
  });

  describe('ensureAppRole', () => {
    // A probe role stands in for the app role: roles belong to the server, and this test must
    // not change the one that every other test connects as. Role changes roll back with the transaction.
    const probe = 'fivvi_probe_app';

    it('creates a missing role that cannot log in while there is no password', async () => {
      const database = await createTestDatabase();
      const client = createDatabase({ url: database.url, maxConnections: 1 });
      try {
        await withRollback(client.db, async (tx) => {
          expect(await ensureAppRole(tx, { role: probe })).toEqual({
            login: false,
            passwordSet: false,
          });
          expect(await roleAttributes(tx, probe)).toEqual([
            expect.objectContaining({ rolcanlogin: false, rolsuper: false, rolbypassrls: false }),
          ]);
        });
      } finally {
        await client.close();
        await database.drop();
      }
    });

    it('turns a role that cannot log in into one that can, once the password is set', async () => {
      const database = await createTestDatabase();
      const client = createDatabase({ url: database.url, maxConnections: 1 });
      try {
        await withRollback(client.db, async (tx) => {
          await ensureAppRole(tx, { role: probe });

          const result = await ensureAppRole(tx, {
            role: probe,
            password: 'fake-probe-password-for-tests',
          });
          await ensureAppRole(tx, { role: probe, password: 'fake-probe-password-for-tests' });

          expect(result).toEqual({ login: true, passwordSet: true });
          expect(await roleAttributes(tx, probe)).toEqual([
            expect.objectContaining({ rolcanlogin: true, rolsuper: false, rolbypassrls: false }),
          ]);
        });
      } finally {
        await client.close();
        await database.drop();
      }
    });

    it('leaves a role that is already set up alone when there is no password', async () => {
      const database = await createTestDatabase();
      const client = createDatabase({ url: database.url, maxConnections: 1 });
      try {
        await withRollback(client.db, async (tx) => {
          await ensureAppRole(tx, { role: probe, password: 'fake-probe-password-for-tests' });

          expect(await ensureAppRole(tx, { role: probe })).toEqual({
            login: true,
            passwordSet: false,
          });
        });
      } finally {
        await client.close();
        await database.drop();
      }
    });

    it('takes a password with quotes, and rejects a short one without echoing it', async () => {
      const database = await createTestDatabase();
      const client = createDatabase({ url: database.url, maxConnections: 1 });
      try {
        await withRollback(client.db, async (tx) => {
          await expect(
            ensureAppRole(tx, { role: probe, password: 'fake\'password"for;tests-0123' }),
          ).resolves.toEqual({ login: true, passwordSet: true });
        });
        const error = await ensureAppRole(client.db, { role: probe, password: 'fake-short' }).catch(
          (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/at least 16 characters/);
        expect((error as Error).message).not.toContain('fake-short');
      } finally {
        await client.close();
        await database.drop();
      }
    });
  });
});
