import {
  type Database,
  type DatabaseExecutor,
  JOB_RUN_MESSAGE_MAX_LENGTH,
  type JobRunOutcome,
  jobRuns,
  pingDatabase,
} from '@fivvi/database';
import type { ErrorReporter } from '@fivvi/observability';
import { and, eq, max, sql } from 'drizzle-orm';
import { isDailyTaskDue } from './due.ts';
import type { CronTask, CronTaskContext } from './task.ts';

export interface RunCronOptions {
  /** The privileged connection (ADR-006); daily tasks open a transaction on it. */
  db: Database;
  tasks: readonly CronTask[];
  /** "Now" for the due rule and the records. Default: the system clock. */
  clock?: { now(): Date };
  /** Default: a new UUID. */
  runId?: string;
  log: (message: string) => void;
  errorReporter: Pick<ErrorReporter, 'captureError'>;
}

export interface TaskResult {
  name: string;
  outcome: JobRunOutcome;
}

export interface CronRunResult {
  runId: string;
  /** The tasks that ran or were skipped, in order. A daily task that was not due is not here. */
  results: TaskResult[];
  /** True when a task failed: the process exits non-zero, after every task had its turn. */
  failed: boolean;
}

interface Settled {
  outcome: JobRunOutcome;
  message?: string;
}

/**
 * One run of the cron (ADR-027). It pings the database first, then runs every frequent task,
 * then every daily task that is due, each at most once. Every task that ran, or was skipped
 * because another run held its lock, is recorded in `job_runs`.
 *
 * A daily task runs in a transaction that holds `pg_try_advisory_xact_lock(hashtext(name))`: a
 * second, overlapping run does not wait, it records `skipped`. Whether the task is due is read
 * again once the lock is held, so a run that started just after another one finished does not
 * run it a second time. The task's own writes sit in a savepoint of that transaction: a
 * throwing task leaves nothing behind, and the record of its failure is kept.
 *
 * A failing task is reported to Sentry (tags `cron.task` and `cron.run_id`) and recorded as
 * `failed`; the other tasks still run. It is retried by the next run, since only a success
 * counts for the due rule.
 */
export async function runCron({
  db,
  tasks,
  clock = { now: () => new Date() },
  runId = crypto.randomUUID(),
  log,
  errorReporter,
}: RunCronOptions): Promise<CronRunResult> {
  assertUniqueNames(tasks);
  await pingDatabase(db);
  log('Database reachable.');

  const results: TaskResult[] = [];
  const context = (executor: DatabaseExecutor, now: Date): CronTaskContext => ({
    db: executor,
    now,
    runId,
    log,
    errorReporter,
  });
  const record = (name: string, settled: Settled | undefined) => {
    if (!settled) return;
    results.push({ name, outcome: settled.outcome });
    log(`Task ${name}: ${settled.outcome}.`);
  };

  for (const task of tasks.filter(({ kind }) => kind === 'frequent')) {
    record(task.name, await runFrequent(task));
  }
  for (const task of tasks.filter(({ kind }) => kind === 'daily')) {
    record(task.name, await runDaily(task));
  }
  return { runId, results, failed: results.some(({ outcome }) => outcome === 'failed') };

  async function runFrequent(task: CronTask): Promise<Settled> {
    const startedAt = clock.now();
    const settled = await attempt(task, () => task.run(context(db, startedAt)));
    return recordRun(db, task, startedAt, settled);
  }

  async function runDaily(task: CronTask): Promise<Settled | undefined> {
    // Cheap read first: most runs find nothing due and take no lock.
    if (!isDailyTaskDue(await lastSuccess(db, task.name), clock.now())) return undefined;
    return db.transaction(async (tx) => {
      if (!(await tryLock(tx, task.name))) {
        const now = clock.now();
        return recordRun(tx, task, now, {
          outcome: 'skipped',
          message: 'another run holds the lock',
        });
      }
      // Under the lock the answer is final: a run that finished meanwhile has committed.
      const startedAt = clock.now();
      if (!isDailyTaskDue(await lastSuccess(tx, task.name), startedAt)) return undefined;
      const settled = await attempt(task, () =>
        tx.transaction((savepoint) => task.run(context(savepoint, startedAt))),
      );
      return recordRun(tx, task, startedAt, settled);
    });
  }

  /** Runs the task body; a throw is reported and becomes a `failed` outcome. */
  async function attempt(task: CronTask, body: () => Promise<void>): Promise<Settled> {
    try {
      await body();
      return { outcome: 'succeeded' };
    } catch (error) {
      errorReporter.captureError(error, {
        tags: { 'cron.task': task.name, 'cron.run_id': runId },
      });
      // The type of the error only: its message could hold personal data.
      const type = error instanceof Error ? error.name : 'a non-error value';
      return { outcome: 'failed', message: `failed with ${type}` };
    }
  }

  async function recordRun(
    executor: DatabaseExecutor,
    task: CronTask,
    startedAt: Date,
    settled: Settled,
  ): Promise<Settled> {
    await executor.insert(jobRuns).values({
      runId,
      taskName: task.name,
      startedAt,
      finishedAt: clock.now(),
      outcome: settled.outcome,
      message: settled.message?.slice(0, JOB_RUN_MESSAGE_MAX_LENGTH),
    });
    return settled;
  }
}

async function lastSuccess(db: DatabaseExecutor, taskName: string): Promise<Date | undefined> {
  const [row] = await db
    .select({ startedAt: max(jobRuns.startedAt) })
    .from(jobRuns)
    .where(and(eq(jobRuns.taskName, taskName), eq(jobRuns.outcome, 'succeeded')));
  return row?.startedAt ?? undefined;
}

/** Takes the task's lock until the end of the transaction, or says that another run holds it. */
async function tryLock(tx: DatabaseExecutor, taskName: string): Promise<boolean> {
  const result = await tx.execute(
    sql`select pg_try_advisory_xact_lock(hashtext(${taskName})) as locked`,
  );
  return result.rows[0]?.locked === true;
}

function assertUniqueNames(tasks: readonly CronTask[]): void {
  const seen = new Set<string>();
  for (const { name } of tasks) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid cron task name: ${name}`);
    if (seen.has(name)) throw new Error(`Duplicate cron task: ${name}`);
    seen.add(name);
  }
}
