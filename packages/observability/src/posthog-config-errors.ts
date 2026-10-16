import { type EnvironmentVariables, readPageViewsConfig } from './config.ts';
import type { ErrorReporter } from './reporter.ts';

/** A PostHog setting that turns analytics off (`config.ts`). Names the variable, never its value. */
export class PostHogConfigError extends Error {
  override name = 'PostHogConfigError';
}

/**
 * Reports a PostHog configuration error to the server log and to Sentry, so a production that
 * sends no analytics because of it doesn't go unnoticed. Never throws.
 */
export function reportPostHogConfigError(message: string, errorReporter: ErrorReporter): void {
  console.error(message);
  errorReporter.captureError(new PostHogConfigError(message));
}

/**
 * Checks the page view settings once, when the web server starts (`apps/web/instrumentation.ts`):
 * the layout reads them on every request, and a wrong `POSTHOG_HOST` must be reported only once.
 */
export function checkPageViewsConfig(
  errorReporter: ErrorReporter,
  env: EnvironmentVariables = process.env,
): void {
  const { error } = readPageViewsConfig(env);
  if (error) reportPostHogConfigError(error, errorReporter);
}
