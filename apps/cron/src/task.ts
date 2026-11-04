import type { DatabaseExecutor } from '@fivvi/database';
import type { ErrorReporter } from '@fivvi/observability';

/**
 * - `frequent`: runs on every run of the cron (every 5 minutes). Must be idempotent on its own
 *   logic, e.g. "send once" is a column of the thing it sends.
 * - `daily`: runs at most once a day, from 03:00 UTC on, under a lock (see `runCron`).
 */
export type CronTaskKind = 'frequent' | 'daily';

export interface CronTaskContext {
  /**
   * The privileged connection. For a daily task it is a savepoint of the transaction that holds
   * the task's lock: if the task throws, everything it wrote is rolled back.
   */
  db: DatabaseExecutor;
  /** When the task started, from the run's clock. */
  now: Date;
  /** The run (one start of the cron); the same ID is in `job_runs` and the Sentry tag. */
  runId: string;
  log: (message: string) => void;
  errorReporter: Pick<ErrorReporter, 'captureError'>;
}

export interface CronTask {
  /** Lowercase words with hyphens. Unique; the key of the lock and of `job_runs`. */
  name: string;
  kind: CronTaskKind;
  /** Throws to fail the run of this task: the runner reports and records it, the others go on. */
  run(ctx: CronTaskContext): Promise<void>;
}
