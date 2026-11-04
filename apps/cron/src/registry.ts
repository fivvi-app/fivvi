import { pruneJobRuns } from './job-runs-retention.ts';
import { checkLettermintUsage } from './lettermint-usage.ts';
import type { CronTask } from './task.ts';

/**
 * The tasks of the cron, in the order they run within their kind. A feature registers its task
 * here and nowhere else (E012): the recurrence horizon (F022), the waitlist closing-time email
 * (F062, frequent), retention (E014). Read from `env` only what a task needs, never print it.
 */
export function createRegistry(env: NodeJS.ProcessEnv): CronTask[] {
  return [
    {
      name: 'lettermint-usage',
      kind: 'daily',
      // Reports its own failures and never throws, so a Team API outage fails no task.
      // Production only: a read-only Lettermint Team API token (ADR-028, R14).
      run: ({ errorReporter, log }) =>
        checkLettermintUsage({
          teamToken: env.LETTERMINT_TEAM_TOKEN,
          // Only tests set the URL, to a fake server; empty means the real one.
          apiUrl: env.LETTERMINT_TEAM_API_URL || undefined,
          errorReporter,
          log,
        }),
    },
    {
      name: 'job-runs-retention',
      kind: 'daily',
      run: ({ db, now }) => pruneJobRuns(db, now),
    },
  ];
}
