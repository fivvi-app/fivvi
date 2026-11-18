import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { CRON_ROLE_TEST_PASSWORD } from '@fivvi/testing/database/server';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CRON_ROLE,
  CRON_SELECT_COLUMNS,
  CRON_TABLE_PRIVILEGES,
  CRON_UPDATE_COLUMNS,
} from '../src/cron-role.ts';
import {
  createCronDatabase,
  createDatabase,
  type DatabaseClient,
  jobRuns,
  pingDatabase,
  trainerInvitations,
} from '../src/index.ts';
import { release } from '../src/release.ts';
import {
  addAccessLogEntry,
  addClassSeries,
  addTeamRole,
  addTrainerInvitation,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

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

    // Every other table, the business tables and the sign-in tables among them, is refused. (A table
    // with a privilege on single columns only can be read as far as those columns, see below.)
    const declared = (name: string) => name in CRON_TABLE_PRIVILEGES || name in CRON_SELECT_COLUMNS;
    for (const table of tables.filter((name) => !declared(name))) {
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

describe('E014 the cron role and the retention tasks (ticket #1181)', () => {
  it('AC16: reads and deletes the rows of the declared tables, sets no workspace and writes none', async () => {
    const gym = await createWorkspace(owner.db, { label: 'johns-gym' });
    const john = await addTeamRole(owner.db, {
      workspaceId: gym.id,
      accountId: (await createAccount(owner.db, { label: 'john', name: 'John' })).id,
      role: 'owner',
    });
    const invitation = await addTrainerInvitation(owner.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: john.id,
      email: 'sarah@example.com',
    });
    const entry = await addAccessLogEntry(owner.db, { workspaceId: gym.id });

    // The policies let the role see a business row without any workspace in its context ...
    expect(await cron.db.select({ id: trainerInvitations.id }).from(trainerInvitations)).toEqual([
      { id: invitation.id },
    ]);
    expect(await cron.db.execute(sql`select id from access_log`)).toMatchObject({
      rows: [{ id: entry.id }],
    });
    // ... but it can change nothing of them, and reads no other business table.
    await expect(cron.db.update(trainerInvitations).set({ name: 'Changed' })).rejects.toMatchObject(
      DENIED,
    );
    await expect(
      cron.db.execute(
        sql`insert into access_log (organization_id, action, subject_client_id, actor_team_member_id) values (${gym.id}, 'client.exported', ${gym.id}, ${john.id})`,
      ),
    ).rejects.toMatchObject(DENIED);
    await expect(cron.db.execute(sql`select 1 from clients`)).rejects.toMatchObject(DENIED);
    await expect(cron.db.execute(sql`select 1 from team_members`)).rejects.toMatchObject(DENIED);

    await cron.db.delete(trainerInvitations);
    await cron.db.execute(sql`delete from access_log`);
    expect(await owner.db.select().from(trainerInvitations)).toEqual([]);
    expect((await owner.db.execute(sql`select 1 from access_log`)).rows).toEqual([]);
  });

  it('AC16: reads only the columns of CRON_SELECT_COLUMNS of the tables that hold tokens, addresses or IP addresses', async () => {
    const { rows } = await owner.db.execute(
      sql`select c.relname as table_name,
                 array_agg(a.attname::text order by a.attname) filter (
                   where has_column_privilege(${CRON_ROLE}, c.oid, a.attnum, 'SELECT')
                 ) as readable
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          where n.nspname = 'public' and c.relname in (${sql.join(
            Object.keys(CRON_SELECT_COLUMNS).map((table) => sql`${table}`),
            sql`, `,
          )})
          group by c.relname`,
    );

    expect(Object.fromEntries(rows.map((row) => [row.table_name, row.readable]))).toEqual(
      Object.fromEntries(
        Object.entries(CRON_SELECT_COLUMNS).map(([table, columns]) => [table, [...columns].sort()]),
      ),
    );
  });

  it('AC16: a SELECT of a token, an address or an IP address by the cron role is refused', async () => {
    for (const [table, column] of [
      ['auth_sessions', 'token'],
      ['auth_sessions', 'ip_address'],
      ['auth_sessions', 'user_agent'],
      ['auth_verifications', 'identifier'],
      ['auth_verifications', 'value'],
      ['trainer_invitations', 'email'],
      ['trainer_invitations', 'token_hash'],
    ] as const) {
      await expect(
        cron.db.execute(sql`select ${sql.identifier(column)} from ${sql.identifier(table)}`),
        `${table}.${column}`,
      ).rejects.toMatchObject(DENIED);
    }
    // `select *` and a delete that reads such a column in its condition are refused too.
    await expect(cron.db.execute(sql`select * from auth_sessions`)).rejects.toMatchObject(DENIED);
    await expect(
      cron.db.execute(sql`delete from trainer_invitations where email = 'sarah@example.com'`),
    ).rejects.toMatchObject(DENIED);
  });

  it('AC16: the platform tables of the retention tasks can be read and deleted from, not written', async () => {
    for (const table of ['auth_verifications', 'auth_sessions', 'auth_rate_limits']) {
      await cron.db.execute(sql`select id from ${sql.identifier(table)} limit 1`);
      await cron.db.execute(sql`delete from ${sql.identifier(table)}`);
    }
    await expect(cron.db.execute(sql`update auth_rate_limits set count = 1`)).rejects.toMatchObject(
      DENIED,
    );
    await expect(
      cron.db.execute(
        sql`insert into auth_rate_limits (key, count, window_ends_at) values ('probe', 1, now())`,
      ),
    ).rejects.toMatchObject(DENIED);
    await expect(cron.db.execute(sql`select 1 from auth_users`)).rejects.toMatchObject(DENIED);
  });
});

describe('F022 the cron role and the class series task (ticket #453)', () => {
  it('AC9: reads every series without a workspace, moves materialized_until and changes nothing else of it', async () => {
    const gym = await createWorkspace(owner.db, { label: 'johns-gym' });
    const fit = await createWorkspace(owner.db, { label: 'fit-studio' });
    const mine = await addClassSeries(owner.db, { workspaceId: gym.id });
    const theirs = await addClassSeries(owner.db, { workspaceId: fit.id });

    const seen = await cron.db.execute(sql`select id from class_series order by id`);
    expect(seen.rows.map((row) => row.id).sort()).toEqual([mine.id, theirs.id].sort());
    await cron.db.execute(
      sql`update class_series set materialized_until = '2027-01-04', updated_at = now() where id = ${mine.id}`,
    );
    expect(
      (
        await owner.db.execute(
          sql`select materialized_until::text as d from class_series where id = ${mine.id}`,
        )
      ).rows,
    ).toEqual([{ d: '2027-01-04' }]);
    for (const statement of [
      sql`update class_series set rrule = 'FREQ=WEEKLY;BYDAY=MO'`,
      sql`update class_series set capacity = 99`,
      sql`update class_series set version = version + 1`,
      sql`insert into class_series (organization_id, group_class_id, rrule, local_start_time, duration_minutes, time_zone, capacity, starts_on, materialized_until) select organization_id, group_class_id, rrule, local_start_time, duration_minutes, time_zone, capacity, starts_on, materialized_until from class_series`,
      sql`delete from class_series`,
    ]) {
      await expect(cron.db.execute(statement)).rejects.toMatchObject(DENIED);
    }
    expect(Object.keys(CRON_UPDATE_COLUMNS)).toEqual(['class_series']);
  });

  it('AC9: inserts class dates in any workspace, reads, changes and deletes none', async () => {
    const gym = await createWorkspace(owner.db, { label: 'johns-gym' });
    const series = await addClassSeries(owner.db, { workspaceId: gym.id });
    const location = (
      await owner.db.execute(
        sql`select id from locations where organization_id = ${gym.id} and is_default`,
      )
    ).rows[0]?.id;
    const insert = (day: string) =>
      cron.db.execute(
        sql`insert into sessions (organization_id, type, group_class_id, series_id, occurrence_date, location_id, starts_at, ends_at, capacity)
            values (${gym.id}, 'group', ${series.groupClassId}, ${series.id}, ${day}, ${location}, '2026-12-29T17:00:00Z', '2026-12-29T18:00:00Z', 8)
            on conflict do nothing`,
      );

    expect((await insert('2026-12-29')).rowCount).toBe(1);
    expect((await insert('2026-12-29')).rowCount).toBe(0);
    for (const statement of [
      sql`select id from sessions`,
      sql`update sessions set capacity = 1`,
      sql`delete from sessions`,
    ]) {
      await expect(cron.db.execute(statement)).rejects.toMatchObject(DENIED);
    }
  });

  it('AC9: refuses every date that is not a class date of a series planned by nobody', async () => {
    const gym = await createWorkspace(owner.db, { label: 'johns-gym' });
    const series = await addClassSeries(owner.db, { workspaceId: gym.id });
    const planner = await addTeamRole(owner.db, {
      workspaceId: gym.id,
      accountId: (await createAccount(owner.db, { label: 'planner', name: 'Planner' })).id,
    });
    const location = (
      await owner.db.execute(
        sql`select id from locations where organization_id = ${gym.id} and is_default`,
      )
    ).rows[0]?.id;
    const times = sql`'2026-12-29T17:00:00Z', '2026-12-29T18:00:00Z'`;

    const refused = [
      // A private session, a class date on its own and a class date planned by a team member.
      sql`insert into sessions (organization_id, type, location_id, starts_at, ends_at, capacity)
          values (${gym.id}, 'private', ${location}, ${times}, 1)`,
      sql`insert into sessions (organization_id, type, group_class_id, location_id, starts_at, ends_at, capacity)
          values (${gym.id}, 'group', ${series.groupClassId}, ${location}, ${times}, 8)`,
      sql`insert into sessions (organization_id, type, group_class_id, series_id, occurrence_date, location_id, starts_at, ends_at, capacity, created_by_team_member_id)
          values (${gym.id}, 'group', ${series.groupClassId}, ${series.id}, '2026-12-29', ${location}, ${times}, 8, ${planner.id})`,
    ];
    for (const statement of refused) {
      await expect(cron.db.execute(statement)).rejects.toMatchObject(DENIED);
    }
    expect(
      (await owner.db.execute(sql`select 1 from sessions where organization_id = ${gym.id}`)).rows,
    ).toHaveLength(0);
  });

  it('AC9: reads the key columns of a location and nothing else of it', async () => {
    const gym = await createWorkspace(owner.db, { label: 'johns-gym' });

    const { rows } = await cron.db.execute(
      sql`select id, organization_id, is_default from locations where organization_id = ${gym.id}`,
    );

    expect(rows).toHaveLength(1);
    await expect(cron.db.execute(sql`select name from locations`)).rejects.toMatchObject(DENIED);
    await expect(cron.db.execute(sql`select * from locations`)).rejects.toMatchObject(DENIED);
    await expect(
      cron.db.execute(sql`update locations set is_default = false`),
    ).rejects.toMatchObject(DENIED);
    await expect(cron.db.execute(sql`delete from locations`)).rejects.toMatchObject(DENIED);
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
