import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, instant } from './columns.ts';

export const jobRunOutcome = pgEnum('job_run_outcome', ['succeeded', 'failed', 'skipped']);

/** The longest `job_runs.message`. */
export const JOB_RUN_MESSAGE_MAX_LENGTH = 200;

/**
 * One run of one cron task (E012, ADR-027): when it started and finished and how it ended, so a
 * missed day shows and a daily task's last success is read from here. Platform data, not
 * business data: no `organization_id`, no RLS, and the app role has no privilege on it; only
 * the cron's privileged connection reads and writes it.
 *
 * `message` is a short note without personal data (never an error message, which could hold
 * some): why a task was skipped, or the type of error that failed it. A row is written when the
 * run ends, so there is no "running" outcome. `runId` is the start of the cron that
 * `cron.run_id` names in Sentry. Rows older than 90 days are deleted by a daily task.
 */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: id(),
    runId: uuid('run_id').notNull(),
    taskName: text('task_name').notNull(),
    startedAt: instant('started_at').notNull(),
    finishedAt: instant('finished_at').notNull(),
    outcome: jobRunOutcome('outcome').notNull(),
    message: text('message'),
  },
  (table) => [
    index('job_runs_task_name_started_at_idx').on(table.taskName, table.startedAt),
    index('job_runs_started_at_idx').on(table.startedAt),
    check(
      'job_runs_message_length',
      sql`${table.message} is null or char_length(${table.message}) <= ${sql.raw(String(JOB_RUN_MESSAGE_MAX_LENGTH))}`,
    ),
  ],
);

export type JobRun = typeof jobRuns.$inferSelect;
export type JobRunOutcome = JobRun['outcome'];
