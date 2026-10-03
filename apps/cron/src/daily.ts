import { type Database, pingDatabase } from '@trainer-hub/database';

export interface DailyJobContext {
  db: Database;
  log: (message: string) => void;
}

/**
 * The daily cron run (ADR-010). Every job must be idempotent: safe to run twice or late.
 *
 * Skeleton until E012, which adds hold cleanup, the recurrence horizon and retention, and
 * switches to the privileged database role (ADR-006).
 */
export async function runDailyJobs({ db, log }: DailyJobContext): Promise<void> {
  await pingDatabase(db);
  log('Database reachable.');
}
