import { createDatabase, jobRuns } from '@fivvi/database';
import { cloneTemplateDatabase } from '@fivvi/testing/database';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { startFakeLettermintTeamApi } from './fake-lettermint-team-api.ts';
import { startFakeSentry } from './fake-sentry.ts';
import { runMain, SPAWN_TEST_TIMEOUT_MS } from './run-main.ts';

// 02:55 UTC: before the first run of the day that may start a daily task.
const NOTHING_DUE = '2026-11-04T02:55:00Z';
// 09:00 UTC: every daily task that never succeeded is due.
const EVERYTHING_DUE = '2026-11-04T09:00:00Z';

describe('E003 cron entrypoint', { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  it('connects to the database, logs and exits 0', async () => {
    const database = await cloneTemplateDatabase();
    try {
      // Before 03:00 UTC no daily task is due, so the run only pings the database.
      const result = await runMain({ DATABASE_URL: database.url }, { now: NOTHING_DUE });

      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      // The privileged connection logs its reason (E011, AC17), and never the connection.
      expect(result.stdout).toMatch(
        /^Cron started: run [0-9a-f-]{36}\.\nPrivileged database access: daily-cron \(.+\)\.\nDatabase reachable\.\nCron finished in \d+ ms\.\n$/,
      );
      expect(result.stdout).not.toContain(database.url);
    } finally {
      await database.drop();
    }
  });
});

describe('E006 cron Lettermint usage alert', { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  const TEAM_TOKEN = 'lm_team_not-a-real-token';

  it('reports usage at 70% to Sentry and still finishes the daily jobs', async () => {
    const database = await cloneTemplateDatabase();
    const sentry = await startFakeSentry();
    const teamApi = await startFakeLettermintTeamApi({ included: 300, used: 250 });
    try {
      const result = await runMain(
        {
          DATABASE_URL: database.url,
          SENTRY_DSN: sentry.dsn,
          LETTERMINT_TEAM_TOKEN: TEAM_TOKEN,
          LETTERMINT_TEAM_API_URL: teamApi.url,
        },
        { now: EVERYTHING_DUE },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Database reachable.');
      expect(sentry.events).toHaveLength(1);
      expect(sentry.events[0]).toMatchObject({ level: 'warning' });
      expect(JSON.stringify(sentry.events)).toContain('250 of 300 emails this month (83%)');
      expect(teamApi.authorizations).toEqual([`Bearer ${TEAM_TOKEN}`, `Bearer ${TEAM_TOKEN}`]);
      expect(JSON.stringify(sentry.events)).not.toContain(TEAM_TOKEN);
    } finally {
      await Promise.all([database.drop(), sentry.close(), teamApi.close()]);
    }
  });

  it('reports a failing Team API once and still exits 0 after the other jobs', async () => {
    const database = await cloneTemplateDatabase();
    const sentry = await startFakeSentry();
    const teamApi = await startFakeLettermintTeamApi({ included: 300, used: 0, status: 503 });
    try {
      const result = await runMain(
        {
          DATABASE_URL: database.url,
          SENTRY_DSN: sentry.dsn,
          LETTERMINT_TEAM_TOKEN: TEAM_TOKEN,
          LETTERMINT_TEAM_API_URL: teamApi.url,
        },
        { now: EVERYTHING_DUE },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Database reachable.');
      expect(sentry.events).toHaveLength(1);
      expect(sentry.events[0]).toMatchObject({ level: 'error' });
      expect(JSON.stringify(sentry.events)).toContain('lettermint: HTTP 503 UNAVAILABLE');
    } finally {
      await Promise.all([database.drop(), sentry.close(), teamApi.close()]);
    }
  });
});

describe('E012 cron entrypoint', { timeout: SPAWN_TEST_TIMEOUT_MS }, () => {
  it('AC9: a run with nothing due ends within 10 seconds', async () => {
    const database = await cloneTemplateDatabase();
    try {
      const started = performance.now();
      const result = await runMain({ DATABASE_URL: database.url }, { now: NOTHING_DUE });
      const seconds = (performance.now() - started) / 1000;

      expect(result.exitCode).toBe(0);
      expect(seconds).toBeLessThan(10);
    } finally {
      await database.drop();
    }
  });

  it('AC6: records the daily tasks of the run and prunes the old rows', async () => {
    const database = await cloneTemplateDatabase();
    const { db, close } = createDatabase({ url: database.url, maxConnections: 1 });
    try {
      const old = new Date('2026-07-01T09:00:00Z');
      await db.insert(jobRuns).values({
        runId: '11111111-1111-4111-8111-111111111111',
        taskName: 'old-task',
        startedAt: old,
        finishedAt: old,
        outcome: 'succeeded',
      });

      const result = await runMain({ DATABASE_URL: database.url }, { now: EVERYTHING_DUE });

      expect(result.exitCode).toBe(0);
      const rows = await db.select().from(jobRuns);
      expect(rows.map((row) => `${row.taskName}:${row.outcome}`).sort()).toEqual([
        'job-runs-retention:succeeded',
        'lettermint-usage:succeeded',
      ]);
      // Both rows are of the run the process printed.
      const [{ runId }] = rows as [(typeof rows)[number]];
      expect(result.stdout).toContain(`Cron started: run ${runId}.`);
    } finally {
      await close();
      await database.drop();
    }
  });

  it('AC5: a failing task is reported with its tags, the others run, the exit code is 1', async () => {
    const database = await cloneTemplateDatabase();
    const sentry = await startFakeSentry();
    const { db, close } = createDatabase({ url: database.url, maxConnections: 1 });
    try {
      // The retention task fails: deleting an old row raises an error.
      const old = new Date('2026-07-01T09:00:00Z');
      await db.insert(jobRuns).values({
        runId: '11111111-1111-4111-8111-111111111111',
        taskName: 'old-task',
        startedAt: old,
        finishedAt: old,
        outcome: 'succeeded',
      });
      await db.execute(sql`
        create function fail_job_run_delete() returns trigger language plpgsql as
          $$ begin raise exception 'cannot delete anna@example.com'; end $$`);
      await db.execute(sql`
        create trigger fail_job_run_delete before delete on job_runs
          for each row execute function fail_job_run_delete()`);

      const result = await runMain(
        { DATABASE_URL: database.url, SENTRY_DSN: sentry.dsn },
        { now: EVERYTHING_DUE },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Task job-runs-retention: failed.');
      expect(result.stdout).toContain('Task lettermint-usage: succeeded.');
      expect(sentry.events).toHaveLength(1);
      expect(sentry.events[0]).toMatchObject({
        level: 'error',
        tags: { 'cron.task': 'job-runs-retention' },
      });
      expect(sentry.events[0]?.tags?.['cron.run_id']).toMatch(/^[0-9a-f-]{36}$/);
      const failed = await db.select().from(jobRuns).where(sql`outcome = 'failed'`);
      expect(failed.map((row) => [row.taskName, row.message])).toEqual([
        ['job-runs-retention', 'failed with Error'],
      ]);
      expect(JSON.stringify(failed)).not.toContain('anna');
    } finally {
      await close();
      await Promise.all([database.drop(), sentry.close()]);
    }
  });
});
