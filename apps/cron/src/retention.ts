import {
  appendDeletionLog,
  type DatabaseExecutor,
  type DeletedRow,
  deleteClosedInvitations,
  deleteExpiredSessions,
  deleteOldAccessLogEntries,
  deleteOldDeletionLogEntries,
  deleteOldRateLimits,
  deleteSignInTokens,
} from '@fivvi/database';
import {
  createDeletionLog,
  type DeletionLogEntryInput,
  RETENTION,
  retentionCutoff,
} from '@fivvi/domain';
import type { CronTask, CronTaskContext, CronTaskReport } from './task.ts';

// The daily retention tasks of the platform data (E014, ticket #1181; `retention-policy.md` §2).
// One task per rule, each registered as a daily task of E012 and run through the cron role, which
// has privileges on these tables only (`CRON_TABLE_PRIVILEGES`). A period is a constant of the
// domain (`RETENTION`), the cutoff of a run comes from it and from the run's clock, and a task
// deletes the rows at or before the cutoff in one statement, so a second run finds nothing.
// A task reports how many rows it deleted and nothing else: `job_runs` holds counts, no content.
//
// Every deletion of a row of a workspace goes to the deletion log (table and ID, no content), so
// a restore of a backup re-applies it. The sign-in codes, the sessions and the rate-limit rows
// belong to no workspace, and the log is kept per workspace, so they are not in it: a restored
// backup brings back only rows that this task deletes again on its first run.

const LOG_CHUNK = 1000;

/** Writes the deletion log for rows of one table the task has just deleted, in the same transaction. */
async function logDeletions(
  ctx: CronTaskContext,
  table: string,
  rows: readonly DeletedRow[],
): Promise<void> {
  const log = createDeletionLog(
    { append: (entries) => appendDeletionLog(ctx.db, entries) },
    { now: () => ctx.now },
  );
  for (let start = 0; start < rows.length; start += LOG_CHUNK) {
    const chunk: DeletionLogEntryInput[] = rows
      .slice(start, start + LOG_CHUNK)
      .map(({ id, workspaceId }) => ({ table, recordId: id, workspaceId }));
    await log.record(chunk);
  }
}

const deleted = (count: number): CronTaskReport => ({ counts: { deleted: count } });

function daily(
  name: string,
  run: (ctx: CronTaskContext, db: DatabaseExecutor) => Promise<CronTaskReport>,
): CronTask {
  return { name, kind: 'daily', run: (ctx) => run(ctx, ctx.db) };
}

/** The retention tasks of E014 that need nothing but what exists today. */
export function createRetentionTasks(): CronTask[] {
  return [
    // R2: sign-in codes and links, 24 hours after they expired (use deletes the row at once).
    daily('retention.sign-in-tokens', async ({ now }, db) =>
      deleted(
        await deleteSignInTokens(db, retentionCutoff(now, RETENTION.SIGN_IN_TOKEN_AFTER_EXPIRY)),
      ),
    ),
    // R3: trainer invitations, 30 days after they expired, were withdrawn, declined or accepted.
    daily('retention.invitations', async (ctx, db) => {
      const rows = await deleteClosedInvitations(
        db,
        retentionCutoff(ctx.now, RETENTION.TRAINER_INVITATION_AFTER_CLOSING),
      );
      await logDeletions(ctx, 'trainer_invitations', rows);
      return deleted(rows.length);
    }),
    // R14: rate-limit rows, 24 hours after they were last written.
    daily('retention.rate-limits', async ({ now }, db) =>
      deleted(await deleteOldRateLimits(db, retentionCutoff(now, RETENTION.RATE_LIMIT))),
    ),
    // R12: access-log entries, 12 months after they were written.
    daily('retention.access-log', async (ctx, db) => {
      const rows = await deleteOldAccessLogEntries(
        db,
        retentionCutoff(ctx.now, RETENTION.ACCESS_LOG),
      );
      await logDeletions(ctx, 'access_log', rows);
      return deleted(rows.length);
    }),
    // §3.5: deletion-log entries, 30 days after they were written. Its own deletions are not logged.
    daily('retention.deletion-log', async ({ now }, db) =>
      deleted(await deleteOldDeletionLogEntries(db, retentionCutoff(now, RETENTION.DELETION_LOG))),
    ),
    // R10 (Q26): sign-in sessions that expired, 30 days after their last use.
    daily('retention.sessions', async ({ now }, db) =>
      deleted(
        await deleteExpiredSessions(
          db,
          now,
          retentionCutoff(now, RETENTION.SIGN_IN_SESSION_AFTER_LAST_USE),
        ),
      ),
    ),
  ];
}
