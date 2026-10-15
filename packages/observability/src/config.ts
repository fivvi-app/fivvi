/**
 * Environment variables, e.g. `process.env`. Not `NodeJS.ProcessEnv`, which Next.js extends
 * with a required `NODE_ENV`.
 */
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

/**
 * PostHog EU Cloud (Frankfurt), the region in the sub-processor list. Hard-coded for product
 * events and page views alike, so neither can ever go to another region.
 */
export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

/** Sentry's `environment` tag. Previews report separately, so their noise never mixes with production. */
export type ReportingEnvironment = 'production' | 'preview' | 'development';

export interface ErrorReportingConfig {
  /** Sentry DSN. Without one, error reporting is off and nothing leaves the process. */
  dsn?: string;
  environment: ReportingEnvironment;
  /** The deployed commit SHA, so an error points at the deploy that introduced it. */
  release?: string;
}

/**
 * Reads the error reporting settings from the environment (ENVIRONMENTS.md §7). Railway sets
 * `RAILWAY_ENVIRONMENT_NAME` and `RAILWAY_GIT_COMMIT_SHA`; locally, in tests and in CI there
 * is no `SENTRY_DSN`, so reporting stays off.
 */
export function readErrorReportingConfig(
  env: EnvironmentVariables = process.env,
): ErrorReportingConfig {
  return configWithDsn(env.SENTRY_DSN, env);
}

/**
 * The browser's settings: `NEXT_PUBLIC_SENTRY_DSN` and the same `RAILWAY_*` variables, which
 * Next.js inlines into the browser bundle at build time (`apps/web/instrumentation-client.ts`).
 */
export function readBrowserErrorReportingConfig(env: EnvironmentVariables): ErrorReportingConfig {
  return configWithDsn(env.NEXT_PUBLIC_SENTRY_DSN, env);
}

/** The whole config: the given DSN variable, plus the environment and release from Railway. */
function configWithDsn(
  dsnVariable: string | undefined,
  env: EnvironmentVariables,
): ErrorReportingConfig {
  const dsn = dsnVariable?.trim() || undefined;
  const release = env.RAILWAY_GIT_COMMIT_SHA?.trim() || undefined;
  return {
    dsn,
    environment: toReportingEnvironment(env.RAILWAY_ENVIRONMENT_NAME?.trim()),
    ...(release && { release }),
  };
}

function toReportingEnvironment(railwayEnvironment: string | undefined): ReportingEnvironment {
  if (railwayEnvironment === 'production') return 'production';
  // Not on Railway (local), or Railway's shared `development` environment.
  if (!railwayEnvironment || railwayEnvironment === 'development') return 'development';
  // Every other Railway environment is a PR environment (`pr-<number>`).
  return 'preview';
}

export interface PageViewsConfig {
  /** The PostHog project key. Without one, page views are off and nothing is loaded or sent. */
  key?: string;
}

/**
 * The browser's page view settings: `NEXT_PUBLIC_POSTHOG_KEY`, set for production only
 * (ENVIRONMENTS.md §7). The web server reads it at request time and hands it to the browser
 * (`apps/web/app/layout.tsx`), so pass `process.env` itself: Next.js would inline a literal
 * `process.env.NEXT_PUBLIC_POSTHOG_KEY` at build time.
 */
export function readPageViewsConfig(env: EnvironmentVariables): PageViewsConfig {
  return { key: env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || undefined };
}
