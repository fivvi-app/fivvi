import {
  type CronCheckIn,
  type CronMonitor,
  type EnvironmentVariables,
  readReportingEnvironment,
  type ServerErrorReporter,
} from '@fivvi/observability';

/**
 * The Sentry cron monitor of the cron service (E012, AC10). Every run checks in; Sentry alerts
 * when a run fails, when none arrives within the margin, or when one runs longer than the maximum.
 * One monitor is included in every Sentry plan, the free one too. The schedule is the one of
 * `.railway/railway.ts` (a test keeps them equal); Railway starts a run only 5 minutes after the
 * previous one at the earliest and skips it while the previous is still running, so a run that
 * lasts 4 minutes is already too long.
 *
 * Only production checks in (`startMonitorCheckIn`): the plan includes one monitor, and nothing
 * promises that the development environment of the same monitor stays free of charge.
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
 * way there: it exits before it connects or checks in (ENVIRONMENTS.md §2). The environment is
 * decided in `@fivvi/observability`, as for error reporting.
 */
export function isPreviewEnvironment(env: EnvironmentVariables): boolean {
  return readReportingEnvironment(env) === 'preview';
}

/**
 * Starts the run's check-in to the Sentry monitor, in production only. Elsewhere the check-in is
 * a no-op: `development` runs the same schedule, but the monitor is the one the plan includes.
 */
export function startMonitorCheckIn(
  reporter: ServerErrorReporter,
  env: EnvironmentVariables,
): CronCheckIn {
  if (readReportingEnvironment(env) !== 'production') return { finish: () => {} };
  return reporter.startCheckIn(CRON_MONITOR);
}
