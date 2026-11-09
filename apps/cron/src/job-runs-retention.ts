import { type DatabaseExecutor, jobRuns } from '@fivvi/database';
import { lt } from 'drizzle-orm';

/** How long `job_runs` keeps a row (E012, AC6). */
export const JOB_RUNS_RETENTION_DAYS = 90;

/** Deletes the run records that started more than 90 days before `now`. Idempotent. */
export async function pruneJobRuns(db: DatabaseExecutor, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - JOB_RUNS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(jobRuns).where(lt(jobRuns.startedAt, cutoff));
}
