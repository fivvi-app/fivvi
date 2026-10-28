import { randomBytes } from 'node:crypto';
import { createTestDatabase, withRollback } from '@fivvi/testing/database';
import { APP_ROLE_TEST_PASSWORD, appRoleUrl } from '@fivvi/testing/database/server';
import { ensureTestRoles } from '@fivvi/testing/database/setup';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
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

/**
 * What a settled call comes to as text: `fulfilled`, or `rejected: call <n> [<code>]: <message>`
 * (the bracketed code only when the error has one). Safe to print: `ensureAppRole` throws errors
 * of the SQLSTATE only, with no statement, parameter or password.
 */
function describeSettled(result: PromiseSettledResult<unknown>, index: number): string {
  if (result.status === 'fulfilled') return 'fulfilled';
  const error = result.reason as { code?: unknown; message?: unknown } | undefined;
  const code = typeof error?.code === 'string' ? ` [${error.code}]` : '';
  const message = error instanceof Error ? error.message : String(error);
  return `rejected: call ${index}${code}: ${message}`;
}

type Query = ReturnType<typeof sql>;
type Execute = (query: Query) => ReturnType<DatabaseExecutor['execute']>;

/**
 * `db` with every statement passed through `around`, also the ones run in a transaction or a
 * savepoint that `db` opens: `ensureAppRole` runs its statements in a transaction of its own.
 */
function intercept<D extends DatabaseExecutor>(
  db: D,
  around: (query: Query, execute: () => ReturnType<Execute>) => unknown,
): D {
  const wrapped = Object.create(db) as D;
  wrapped.execute = ((query: Query) =>
    around(query, () => db.execute(query))) as unknown as D['execute'];
  wrapped.transaction = ((run: (tx: D) => Promise<unknown>) =>
    db.transaction((tx) =>
      run(intercept(tx as unknown as D, around)),
    )) as unknown as D['transaction'];
  return wrapped;
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

    it('revokes every role membership the role has, so it cannot inherit a privileged role', async () => {
      const database = await createTestDatabase();
      const client = createDatabase({ url: database.url, maxConnections: 1 });
      try {
        await withRollback(client.db, async (tx) => {
          await tx.execute(sql`create role fivvi_probe_parent nologin createrole`);
          await tx.execute(sql`create role ${sql.identifier(probe)} nologin inherit`);
          await tx.execute(sql`grant fivvi_probe_parent to ${sql.identifier(probe)}`);
          const memberships = () =>
            rows<{ parent: string }>(
              tx,
              sql`select p.rolname as parent from pg_auth_members m
                  join pg_roles p on p.oid = m.roleid
                  join pg_roles c on c.oid = m.member
                  where c.rolname = ${probe}`,
            );
          expect(await memberships()).toEqual([{ parent: 'fivvi_probe_parent' }]);

          await ensureAppRole(tx, { role: probe });

          expect(await memberships()).toEqual([]);
        });
      } finally {
        await client.close();
        await database.drop();
      }
    });

    it('refuses to finish while a membership granted by another role remains, naming no role', async () => {
      const database = await createTestDatabase();
      const client = createDatabase({ url: database.url, maxConnections: 1 });
      try {
        await withRollback(client.db, async (tx) => {
          await tx.execute(sql`create role fivvi_probe_parent nologin`);
          await tx.execute(sql`create role fivvi_probe_grantor nologin`);
          await tx.execute(sql`create role ${sql.identifier(probe)} nologin`);
          await tx.execute(sql`grant fivvi_probe_parent to fivvi_probe_grantor with admin option`);
          // From PG16 a revoke only removes the grants of the current grantor.
          await tx.execute(
            sql`grant fivvi_probe_parent to ${sql.identifier(probe)} granted by fivvi_probe_grantor`,
          );

          const error = await ensureAppRole(tx, { role: probe }).catch((caught: unknown) => caught);

          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toMatch(/still a member of another role/);
          expect((error as Error).message).not.toContain('fivvi_probe_parent');
          expect((error as Error).message).not.toContain('fivvi_probe_grantor');
        });
      } finally {
        await client.close();
        await database.drop();
      }
    });

    it('reports a failure that is not a Postgres error without its code', async () => {
      const failing = {
        execute: () => Promise.reject(Object.assign(new Error('socket closed'), { code: 'EPIPE' })),
        transaction: (run: (tx: unknown) => Promise<unknown>) => run(failing),
      } as unknown as DatabaseExecutor;

      const error = await ensureAppRole(failing, { role: probe }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/could not be set up/);
      expect((error as Error).message).not.toContain('EPIPE');
      expect((error as Error).message).not.toContain('SQLSTATE');
    });

    it('logs in with the password once it is set, and sends no cleartext password to the server', async () => {
      const password = 'fake\'login"password;for-tests-0123';
      const role = `fivvi_probe_login_${randomBytes(4).toString('hex')}`;
      const database = await createTestDatabase();
      const client = createDatabase({ url: database.url, maxConnections: 1 });
      const dialect = new PgDialect();
      const sent: string[] = [];
      try {
        // Roles belong to the server and a login needs a committed role: drop it afterwards.
        const recording = intercept(client.db, (query, execute) => {
          const compiled = dialect.sqlToQuery(query);
          sent.push(compiled.sql, ...compiled.params.map(String));
          return execute();
        });
        await ensureAppRole(recording, { role, password });

        const login = new URL(database.url);
        login.username = role;
        login.password = password;
        const app = new pg.Client({ connectionString: login.toString() });
        await app.connect();
        try {
          const { rows: current } = await app.query('select current_user as name');
          expect(current).toEqual([{ name: role }]);
        } finally {
          await app.end();
        }
        const wrong = new URL(login);
        wrong.password = 'fake-wrong-password-for-tests';
        const refused = new pg.Client({ connectionString: wrong.toString() });
        await expect(refused.connect()).rejects.toThrow(/password authentication failed/);
        await refused.end().catch(() => {});
        expect(sent.join('\n')).not.toContain(password);
      } finally {
        await client.db.execute(sql`drop role if exists ${sql.identifier(role)}`);
        await client.close();
        await database.drop();
      }
    });

    it('a failing password statement throws an error with the SQLSTATE only', async () => {
      const password = 'fake-failing-password-for-tests';
      const database = await createTestDatabase();
      const client = createDatabase({ url: database.url, maxConnections: 1 });
      const dialect = new PgDialect();
      try {
        await withRollback(client.db, async (tx) => {
          // The password statement fails for real: the role is gone when it runs.
          const failing = intercept(tx, async (query, execute) => {
            if (/password/.test(dialect.sqlToQuery(query).sql)) {
              await tx.execute(sql`drop role ${sql.identifier(probe)}`);
            }
            return execute();
          });

          const error = await ensureAppRole(failing, { role: probe, password }).catch(
            (caught: unknown) => caught,
          );

          expect(error).toBeInstanceOf(Error);
          const { message, cause } = error as Error;
          expect(message).toMatch(/SQLSTATE 42704/);
          expect(message).not.toContain(password);
          expect(message).not.toContain('SCRAM-SHA-256');
          expect(message).not.toContain('alter role');
          expect(cause).toBeUndefined();
        });
      } finally {
        await client.close();
        await database.drop();
      }
    });

    it('serialises concurrent changes to the role, from the release step and the test setup', async () => {
      // Two ALTER ROLE on one role at once fail with "tuple concurrently updated"; a CI run does
      // that when parallel workers release databases while a package's global setup runs.
      // Own name per run: runs on one server (worktrees share a container) must not drop it.
      const role = `fivvi_probe_parallel_${randomBytes(4).toString('hex')}`;
      const password = 'fake-parallel-password-for-tests';
      const database = await createTestDatabase();
      const first = createDatabase({ url: database.url, maxConnections: 1 });
      const second = createDatabase({ url: database.url, maxConnections: 1 });
      try {
        for (let round = 0; round < 8; round += 1) {
          await first.db.execute(sql`drop role if exists ${sql.identifier(role)}`);
          const results = await Promise.allSettled([
            ensureAppRole(first.db, { role, password }),
            ensureAppRole(second.db, { role, password }),
            ensureAppRole(first.db, { role }),
            ensureAppRole(second.db, { role }),
            ensureTestRoles(),
            ensureTestRoles(),
          ]);
          // A rejection names its call and its reason, so a failure in CI can be diagnosed.
          expect(results.map(describeSettled)).toEqual(Array(6).fill('fulfilled'));
        }
      } finally {
        await first.db.execute(sql`drop role if exists ${sql.identifier(role)}`);
        await Promise.all([first.close(), second.close()]);
        await database.drop();
      }
    });

    it('survives concurrent changes to the one app role from different databases of one server', async () => {
      // A role belongs to the server, an advisory lock to the database it is taken in: the release
      // step of one database and the test setup (on the maintenance database) do not wait for each
      // other, both ALTER ROLE the same row of `pg_authid`, and one fails with "tuple concurrently
      // updated" (#274). Other test files log in as this role, so its password stays the test one.
      const password = APP_ROLE_TEST_PASSWORD;
      const [one, two] = await Promise.all([createTestDatabase(), createTestDatabase()]);
      const first = createDatabase({ url: one.url, maxConnections: 1 });
      const second = createDatabase({ url: two.url, maxConnections: 1 });
      try {
        for (let round = 0; round < 40; round += 1) {
          const results = await Promise.allSettled([
            ensureAppRole(first.db, { password }),
            ensureAppRole(second.db, { password }),
            ensureAppRole(first.db),
            ensureAppRole(second.db),
            ensureTestRoles(),
            ensureTestRoles(),
          ]);
          expect(results.map(describeSettled), `round ${round}`).toEqual(
            Array(6).fill('fulfilled'),
          );
        }
      } finally {
        await Promise.all([first.close(), second.close()]);
        await Promise.all([one.drop(), two.drop()]);
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
        const nonAscii = 'fake-password-with-\u00e9-0123456';
        const refused = await ensureAppRole(client.db, { role: probe, password: nonAscii }).catch(
          (caught: unknown) => caught,
        );
        expect(refused).toBeInstanceOf(Error);
        expect((refused as Error).message).toMatch(/printable ASCII/);
        expect((refused as Error).message).not.toContain(nonAscii);
        expect((refused as Error).message).not.toContain('\u00e9');
      } finally {
        await client.close();
        await database.drop();
      }
    });
  });
});
