import type { CronMonitor } from '@fivvi/observability';

/**
 * The Sentry cron monitor of the cron service (E012, AC10). Every run checks in; Sentry alerts
 * when a run fails, when none arrives within the margin, or when one runs longer than the maximum.
 * One monitor is included in every Sentry plan, the free one too. The schedule is the one of
 * `.railway/railway.ts` (a test keeps them equal); Railway starts a run only 5 minutes after the
 * previous one at the earliest and skips it while the previous is still running, so a run that
 * lasts 4 minutes is already too long.
 */
export const CRON_MONITOR: CronMonitor = {
  slug: 'cron',
  crontab: '*/5 * * * *',
  checkinMargin: 5,
  maxRuntime: 4,
  timezone: 'UTC',
};

/**
 * Whether this is a PR environment (`pr-<number>`, Railway's `RAILWAY_ENVIRONMENT_NAME`). Railway
 * copies a PR environment from `development` with the cron schedule on it, and the file
 * `.railway/railway.ts` is never applied to a PR environment, so the job itself stays out of the
 * way there: it exits before it connects or checks in (ENVIRONMENTS.md §2).
 */
export function isPreviewEnvironment(env: NodeJS.ProcessEnv): boolean {
  return /^pr-\d+$/.test(env.RAILWAY_ENVIRONMENT_NAME ?? '');
}
