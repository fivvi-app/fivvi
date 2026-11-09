import { createCronDatabase, createDatabase, type Database, jobRuns } from '@fivvi/database';
import { manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase } from '@fivvi/testing/database';
import { asc, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry } from '../src/registry.ts';
import { runCron } from '../src/runner.ts';
import type { CronTask, CronTaskContext } from '../src/task.ts';
import { startFakeLettermintTeamApi } from './fake-lettermint-team-api.ts';

type TestDatabase = Awaited<ReturnType<typeof cloneTemplateDatabase>>;

let database: TestDatabase;
let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  database = await cloneTemplateDatabase();
  // Five connections: a run that holds a daily task's transaction, a second run, a read, and room
  // for the pool's own overhead.
  ({ db, close } = createCronDatabase(
    { CRON_DATABASE_URL: database.cronUrl },
    { maxConnections: 5 },
  ));
});

afterEach(async () => {
  await close();
  await database.drop();
});

const RUN_A = '11111111-1111-4111-8111-111111111111';
const RUN_B = '22222222-2222-4222-8222-222222222222';

function setup(start: string) {
  const clock = manualClock(start);
  const errorReporter = { captureError: vi.fn() };
  const logs: string[] = [];
  const cron = (tasks: readonly CronTask[], runId = RUN_A) =>
    runCron({ db, tasks, clock, runId, log: (message) => logs.push(message), errorReporter });
  return { clock, errorReporter, logs, cron };
}

/** A task that records that it ran (and when, by the order of `calls`). */
function task(
  name: string,
  kind: CronTask['kind'],
  calls: string[],
  run: (ctx: CronTaskContext) => Promise<void> = async () => {},
): CronTask {
  return {
    name,
    kind,
    run: async (ctx) => {
      calls.push(name);
      await run(ctx);
    },
  };
}

const runs = () => db.select().from(jobRuns).orderBy(asc(jobRuns.startedAt), asc(jobRuns.taskName));

describe('E012 cron runner', () => {
  it('AC2: frequent tasks run every run, due daily tasks after them, each at most once', async () => {
    const { cron, clock } = setup('2026-11-04T09:00:00Z');
    const calls: string[] = [];
    const tasks = [
      task('daily-one', 'daily', calls),
      task('frequent-one', 'frequent', calls),
      task('daily-two', 'daily', calls),
      task('frequent-two', 'frequent', calls),
    ];

    await cron(tasks);
    expect(calls).toEqual(['frequent-one', 'frequent-two', 'daily-one', 'daily-two']);

    // Five minutes later the frequent tasks run again; the daily ones ran today.
    calls.length = 0;
    clock.advance({ minutes: 5 });
    await cron(tasks);
    expect(calls).toEqual(['frequent-one', 'frequent-two']);
  });

  it('AC2: a daily task is not run before 03:00 UTC', async () => {
    const { cron } = setup('2026-11-04T02:55:00Z');
    const calls: string[] = [];

    const result = await cron([task('daily-one', 'daily', calls)]);

    expect(calls).toEqual([]);
    expect(result.results).toEqual([]);
    expect(await runs()).toEqual([]);
  });

  it('AC8: the database ping is the first thing a run does, before any task', async () => {
    const calls: string[] = [];
    const { logs } = setup('2026-11-04T09:00:00Z');
    const unreachable = createDatabase({ url: 'postgres://app:x@127.0.0.1:1/none' });
    try {
      await expect(
        runCron({
          db: unreachable.db,
          tasks: [task('frequent-one', 'frequent', calls)],
          clock: manualClock('2026-11-04T09:00:00Z'),
          runId: RUN_A,
          log: (message) => logs.push(message),
          errorReporter: { captureError: vi.fn() },
        }),
      ).rejects.toThrow();
    } finally {
      await unreachable.close();
    }

    expect(calls).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('AC8: logs that the database is reachable first, then each task that ran', async () => {
    const { cron, logs } = setup('2026-11-04T09:00:00Z');

    await cron([task('frequent-one', 'frequent', []), task('daily-one', 'daily', [])]);

    expect(logs).toEqual([
      'Database reachable.',
      'Task frequent-one: succeeded.',
      'Task daily-one: succeeded.',
    ]);
  });

  it('AC3: a daily task that succeeded at 03:05 runs again at the first run from 03:00 UTC the next day, once', async () => {
    const { cron, clock } = setup('2026-11-04T03:05:00Z');
    const calls: string[] = [];
    const tasks = [task('daily-one', 'daily', calls)];

    await cron(tasks);
    for (const time of ['03:10', '09:00', '23:55']) {
      clock.set(`2026-11-04T${time}:00Z`);
      await cron(tasks);
    }
    expect(calls).toEqual(['daily-one']);

    clock.set('2026-11-05T02:55:00Z');
    await cron(tasks);
    expect(calls).toEqual(['daily-one']);

    clock.set('2026-11-05T03:00:30Z');
    await cron(tasks);
    await cron(tasks);
    expect(calls).toEqual(['daily-one', 'daily-one']);
  });

  it('AC3: after a day of downtime a daily task runs once, not once per missed day', async () => {
    const { cron, clock } = setup('2026-11-02T03:05:00Z');
    const calls: string[] = [];
    const tasks = [task('daily-one', 'daily', calls)];
    await cron(tasks);

    clock.set('2026-11-04T03:00:00Z');
    await cron(tasks);
    clock.set('2026-11-04T03:05:00Z');
    await cron(tasks);

    expect(calls).toEqual(['daily-one', 'daily-one']);
  });

  it('AC4: two overlapping runs run a daily task once; the second one records a skip', async () => {
    const { clock } = setup('2026-11-04T09:00:00Z');
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const taskStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const slow = task('daily-one', 'daily', calls, async () => {
      started();
      await gate;
    });
    const input = {
      db,
      tasks: [slow],
      clock,
      log: () => {},
      errorReporter: { captureError: vi.fn() },
    };

    const first = runCron({ ...input, runId: RUN_A });
    await taskStarted;
    const second = await runCron({ ...input, runId: RUN_B });
    release();
    const firstResult = await first;

    expect(calls).toEqual(['daily-one']);
    expect(second.results).toEqual([{ name: 'daily-one', outcome: 'skipped' }]);
    expect(firstResult.results).toEqual([{ name: 'daily-one', outcome: 'succeeded' }]);
    expect(
      (await runs())
        .map(({ runId, outcome }) => ({ runId, outcome }))
        .sort((a, b) => a.outcome.localeCompare(b.outcome)),
    ).toEqual([
      { runId: RUN_B, outcome: 'skipped' },
      { runId: RUN_A, outcome: 'succeeded' },
    ]);
  });

  it('AC5: a failing task is reported and recorded, the others run, and the run is failed', async () => {
    const { cron, errorReporter } = setup('2026-11-04T09:00:00Z');
    const calls: string[] = [];
    const boom = () => {
      throw new TypeError('could not email anna@example.com');
    };
    const tasks = [
      task('daily-bad', 'daily', calls, boom),
      task('frequent-bad', 'frequent', calls, boom),
      task('frequent-good', 'frequent', calls),
      task('daily-good', 'daily', calls),
    ];

    const result = await cron(tasks);

    expect(calls).toEqual(['frequent-bad', 'frequent-good', 'daily-bad', 'daily-good']);
    expect(result.failed).toBe(true);
    expect(result.results).toEqual([
      { name: 'frequent-bad', outcome: 'failed' },
      { name: 'frequent-good', outcome: 'succeeded' },
      { name: 'daily-bad', outcome: 'failed' },
      { name: 'daily-good', outcome: 'succeeded' },
    ]);
    expect(errorReporter.captureError).toHaveBeenCalledTimes(2);
    expect(errorReporter.captureError).toHaveBeenCalledWith(expect.any(TypeError), {
      tags: { 'cron.task': 'frequent-bad', 'cron.run_id': RUN_A },
    });
    expect(errorReporter.captureError).toHaveBeenCalledWith(expect.any(TypeError), {
      tags: { 'cron.task': 'daily-bad', 'cron.run_id': RUN_A },
    });
    const failed = (await runs()).filter((row) => row.outcome === 'failed');
    expect(failed.map((row) => row.taskName).sort()).toEqual(['daily-bad', 'frequent-bad']);
    // The note names the kind of error, never its message, which could hold personal data.
    expect(failed.map((row) => row.message)).toEqual([
      'failed with TypeError',
      'failed with TypeError',
    ]);
  });

  it('AC5: a run in which every task succeeds is not failed', async () => {
    const { cron } = setup('2026-11-04T09:00:00Z');

    const result = await cron([task('daily-one', 'daily', [])]);

    expect(result.failed).toBe(false);
  });

  it('AC5: a failed daily task is retried on the next run, and its writes are rolled back', async () => {
    const { cron, clock } = setup('2026-11-04T09:00:00Z');
    const calls: string[] = [];
    let attempt = 0;
    const flaky = task('daily-one', 'daily', calls, async (ctx) => {
      const executor = ctx.db;
      attempt += 1;
      await executor.insert(jobRuns).values({
        runId: RUN_A,
        taskName: `try-${attempt}`,
        startedAt: ctx.now,
        finishedAt: ctx.now,
        outcome: 'succeeded',
      });
      if (attempt === 1) throw new Error('first try fails');
    });

    const tries = async () =>
      (await db.select().from(jobRuns))
        .map((row) => row.taskName)
        .filter((name) => name.startsWith('try-'));

    await cron([flaky]);
    expect(await tries()).toEqual([]);

    clock.advance({ minutes: 5 });
    await cron([flaky]);
    clock.advance({ minutes: 5 });
    await cron([flaky]);

    expect(calls).toEqual(['daily-one', 'daily-one']);
    expect(await tries()).toEqual(['try-2']);
  });

  it('AC6: every task run is recorded with its start, end, outcome and a short note', async () => {
    const { cron, clock } = setup('2026-11-04T09:00:00Z');
    const slow = task('frequent-one', 'frequent', [], () => {
      clock.advance({ seconds: 30 });
      return Promise.resolve();
    });

    await cron([slow, task('daily-one', 'daily', [])]);
    clock.advance({ minutes: 5 });
    await cron([slow]);

    expect(await runs()).toEqual([
      expect.objectContaining({
        runId: RUN_A,
        taskName: 'frequent-one',
        startedAt: new Date('2026-11-04T09:00:00Z'),
        finishedAt: new Date('2026-11-04T09:00:30Z'),
        outcome: 'succeeded',
        message: null,
      }),
      expect.objectContaining({
        runId: RUN_A,
        taskName: 'daily-one',
        startedAt: new Date('2026-11-04T09:00:30Z'),
        finishedAt: new Date('2026-11-04T09:00:30Z'),
        outcome: 'succeeded',
      }),
      expect.objectContaining({
        taskName: 'frequent-one',
        startedAt: new Date('2026-11-04T09:05:30Z'),
        finishedAt: new Date('2026-11-04T09:06:00Z'),
      }),
    ]);
  });

  it('AC6: the retention task removes rows older than 90 days and keeps the rest', async () => {
    const { cron } = setup('2026-11-04T09:00:00Z');
    const row = (taskName: string, startedAt: string) => ({
      runId: RUN_B,
      taskName,
      startedAt: new Date(startedAt),
      finishedAt: new Date(startedAt),
      outcome: 'succeeded' as const,
    });
    await db.insert(jobRuns).values([
      // The cutoff is 2026-08-06T09:00:00Z (90 days before now): just past it goes, just inside stays.
      row('old', '2026-08-06T08:59:59Z'),
      row('edge', '2026-08-06T09:00:00Z'),
      row('inside', '2026-08-06T09:00:01Z'),
      row('recent', '2026-11-03T09:00:00Z'),
    ]);

    const registry = createRegistry({});
    expect(registry.map(({ name, kind }) => ({ name, kind }))).toContainEqual({
      name: 'job-runs-retention',
      kind: 'daily',
    });
    await cron(registry);

    const names = (await runs()).map((run) => run.taskName);
    expect(names).not.toContain('old');
    expect(names).toEqual(
      expect.arrayContaining(['edge', 'inside', 'recent', 'job-runs-retention']),
    );
  });

  it('AC8: the Lettermint usage check runs as a daily task through the registry', async () => {
    const { cron, clock, errorReporter } = setup('2026-11-04T09:00:00Z');
    const teamApi = await startFakeLettermintTeamApi({ included: 300, used: 250 });
    try {
      const registry = createRegistry({
        LETTERMINT_TEAM_TOKEN: 'lm_team_not-a-real-token',
        LETTERMINT_TEAM_API_URL: teamApi.url,
      });
      expect(registry.find(({ name }) => name === 'lettermint-usage')?.kind).toBe('daily');

      await cron(registry);
      clock.advance({ hours: 1 });
      await cron(registry);

      expect(errorReporter.captureError).toHaveBeenCalledTimes(1);
      expect(errorReporter.captureError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('250 of 300 emails') }),
        { level: 'warning' },
      );
      const [row] = await db.select().from(jobRuns).where(eq(jobRuns.taskName, 'lettermint-usage'));
      expect(row?.outcome).toBe('succeeded');
    } finally {
      await teamApi.close();
    }
  });

  it('AC4: the lock key of a daily task is its name (a different task is not blocked)', async () => {
    const { cron } = setup('2026-11-04T09:00:00Z');
    const calls: string[] = [];
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('daily-held'))`);
      const held = await cron([task('daily-held', 'daily', calls)], RUN_B);
      expect(held.results).toEqual([{ name: 'daily-held', outcome: 'skipped' }]);
      await cron([task('daily-free', 'daily', calls)]);
    });

    expect(calls).toEqual(['daily-free']);
  });
});
