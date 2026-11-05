import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { CRON_ROLE_TEST_PASSWORD } from '@fivvi/testing/database/server';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CRON_ROLE, CRON_TABLE_PRIVILEGES } from '../src/cron-role.ts';
import {
  createCronDatabase,
  createDatabase,
  type DatabaseClient,
  jobRuns,
  pingDatabase,
} from '../src/index.ts';
import { release } from '../src/release.ts';

// E012 AC7: the cron's tasks connect as `fivvi_cron`, a login role that owns nothing, cannot
// bypass RLS and can use only the tables a task declares. The test setup gives the role its
// login (once per server); the template database has the migrations and its table privileges.

let database: TestDatabase;
let owner: DatabaseClient;
let cron: DatabaseClient;

beforeAll(async () => {
  database = await cloneTemplateDatabase();
  owner = createDatabase({ url: database.url, maxConnections: 2 });
  cron = createCronDatabase({ CRON_DATABASE_URL: database.cronUrl }, { maxConnections: 2 });
});

afterAll(async () => {
  await cron.close();
  await owner.close();
  await database.drop();
});

/** The permission error of a statement the role may not run (insufficient_privilege). */
const DENIED = { cause: { code: '42501' } };

describe('E012 the cron role', () => {
  it('AC7: connects as fivvi_cron, a role without superuser, BYPASSRLS or any creation right', async () => {
    const { rows } = await cron.db.execute(
      sql`select r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
                 r.rolreplication, r.rolinherit
          from pg_roles r where r.rolname = current_user`,
    );

    expect(rows).toEqual([
      {
        rolname: CRON_ROLE,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolinherit: false,
      },
    ]);
  });

  it('AC7: sets no tenant context, so a business table shows nothing to it', async () => {
    const { rows } = await cron.db.execute(
      sql`select app_workspace_ids() as workspaces, app_account_id() as account, app_client_id() as client`,
    );

    expect(rows).toEqual([{ workspaces: null, account: null, client: null }]);
  });

  it('AC7: the cron role sees only declared tables', async () => {
    const tables = (
      await owner.db.execute(
        sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
      )
    ).rows.map((row) => String(row.tablename));
    expect(tables).toContain('job_runs');

    // Every other table, the business tables and the sign-in tables among them, is refused.
    for (const table of tables.filter((name) => !(name in CRON_TABLE_PRIVILEGES))) {
      await expect(
        cron.db.execute(sql`select 1 from ${sql.identifier(table)} limit 1`),
        table,
      ).rejects.toMatchObject(DENIED);
    }
    await expect(cron.db.execute(sql`select 1 from clients`)).rejects.toMatchObject(DENIED);
    await expect(cron.db.execute(sql`select 1 from auth_users`)).rejects.toMatchObject(DENIED);
  });

  it('AC7: has exactly the privileges of CRON_TABLE_PRIVILEGES, and no privilege on the migration history', async () => {
    const { rows } = await owner.db.execute(
      sql`select c.relname as table_name, array_agg(a.privilege_type order by a.privilege_type) as privileges
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          cross join lateral aclexplode(c.relacl) a
          join pg_roles r on r.oid = a.grantee and r.rolname = ${CRON_ROLE}
          where n.nspname = 'public' and c.relkind in ('r', 'p')
          group by c.relname`,
    );

    expect(Object.fromEntries(rows.map((row) => [row.table_name, row.privileges]))).toEqual(
      Object.fromEntries(
        Object.entries(CRON_TABLE_PRIVILEGES).map(([table, privileges]) => [
          table,
          [...privileges].sort(),
        ]),
      ),
    );
    const { rows: history } = await owner.db.execute(
      sql`select has_schema_privilege(${CRON_ROLE}, 'drizzle', 'USAGE') as schema_usage`,
    );
    expect(history).toEqual([{ schema_usage: false }]);
  });

  it('AC7: reads, writes and prunes the run records, and nothing more', async () => {
    const run = {
      runId: '11111111-1111-4111-8111-111111111111',
      taskName: 'cron-role-probe',
      startedAt: new Date('2026-11-04T03:00:00Z'),
      finishedAt: new Date('2026-11-04T03:00:01Z'),
      outcome: 'succeeded' as const,
    };

    await cron.db.insert(jobRuns).values(run);
    expect(await cron.db.select().from(jobRuns)).toHaveLength(1);
    await expect(cron.db.update(jobRuns).set({ message: 'changed' })).rejects.toMatchObject(DENIED);
    await expect(cron.db.execute(sql`truncate job_runs`)).rejects.toMatchObject(DENIED);
    await expect(cron.db.execute(sql`create table cron_probe (id int)`)).rejects.toMatchObject(
      DENIED,
    );
    await cron.db.delete(jobRuns);
    expect(await cron.db.select().from(jobRuns)).toEqual([]);
  });

  it('AC7: the app role still has no privilege on the run records', async () => {
    const app = createDatabase({ url: database.appUrl, maxConnections: 1 });
    try {
      await expect(app.db.select().from(jobRuns)).rejects.toMatchObject(DENIED);
    } finally {
      await app.close();
    }
  });

  it('AC7: pings the database and takes advisory locks, which the runner needs', async () => {
    await expect(pingDatabase(cron.db)).resolves.not.toThrow();
    const { rows } = await cron.db.execute(
      sql`select pg_try_advisory_xact_lock(hashtext('probe')) as locked`,
    );
    expect(rows).toEqual([{ locked: true }]);
  });
});

describe('E012 the cron role in the release step', () => {
  it('creates the role idempotently, gives it the login with the password and keeps the password out of the log', async () => {
    const fresh = await cloneTemplateDatabase();
    const client = createDatabase({ url: fresh.url, maxConnections: 1 });
    try {
      const logs: string[] = [];
      const options = { seed: false, cronRolePassword: CRON_ROLE_TEST_PASSWORD };

      await release(client.db, options, (message) => logs.push(message));
      await release(client.db, options, (message) => logs.push(message));

      expect(logs).toContain(
        'Cron role fivvi_cron: login enabled, password set from CRON_DATABASE_PASSWORD.',
      );
      expect(logs.join('\n')).not.toContain(CRON_ROLE_TEST_PASSWORD);
      const probe = createCronDatabase({ CRON_DATABASE_URL: fresh.cronUrl }, { maxConnections: 1 });
      try {
        await expect(pingDatabase(probe.db)).resolves.not.toThrow();
      } finally {
        await probe.close();
      }
    } finally {
      await client.close();
      await fresh.drop();
    }
  });

  it('still succeeds when the password is not set yet, and says so', async () => {
    const fresh = await cloneTemplateDatabase();
    const client = createDatabase({ url: fresh.url, maxConnections: 1 });
    try {
      const logs: string[] = [];

      await release(client.db, { seed: false }, (message) => logs.push(message));

      expect(logs).toEqual(
        expect.arrayContaining([expect.stringMatching(/CRON_DATABASE_PASSWORD is not set/)]),
      );
    } finally {
      await client.close();
      await fresh.drop();
    }
  });
});
