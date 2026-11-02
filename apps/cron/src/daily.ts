import { type Database, pingDatabase } from '@fivvi/database';
import type { ErrorReporter } from '@fivvi/observability';
import { checkLettermintUsage, type LettermintUsageOptions } from './lettermint-usage.ts';

export interface DailyJobContext {
  db: Database;
  log: (message: string) => void;
  errorReporter: Pick<ErrorReporter, 'captureError'>;
  /** `LETTERMINT_TEAM_TOKEN`; the usage check is skipped without it. */
  lettermintTeamToken?: string;
  /** `LETTERMINT_TEAM_API_URL`: only tests set it, to a fake server. */
  lettermintTeamApiUrl?: LettermintUsageOptions['apiUrl'];
}

/**
 * The daily cron run (ADR-010). Every job must be idempotent: safe to run twice or late.
 *
 * Skeleton until E012, which adds hold cleanup, the recurrence horizon and retention, and
 * switches to the privileged database role (ADR-006).
 */
export async function runDailyJobs({
  db,
  log,
  errorReporter,
  lettermintTeamToken,
  lettermintTeamApiUrl,
}: DailyJobContext): Promise<void> {
  await pingDatabase(db);
  log('Database reachable.');
  // Reports its own failures and never throws, so a Team API outage stops no other job.
  await checkLettermintUsage({
    teamToken: lettermintTeamToken,
    apiUrl: lettermintTeamApiUrl || undefined,
    errorReporter,
    log,
  });
}
