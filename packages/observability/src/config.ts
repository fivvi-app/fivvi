/**
 * Environment variables, e.g. `process.env`. Not `NodeJS.ProcessEnv`, which Next.js extends
 * with a required `NODE_ENV`.
 */
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

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

/**
 * Where PostHog analytics goes: on with a project key and a host, off otherwise. Off with an
 * `error` when the key is set but `POSTHOG_HOST` is missing or not an `https://` URL: then
 * nothing is sent, and there is no built-in host to fall back on.
 */
export type PostHogConfig =
  | (PostHogTarget & { error?: undefined })
  | { key?: undefined; host?: undefined; error?: string };

/** Where analytics goes: the PostHog project key and the host from `POSTHOG_HOST`. */
export interface PostHogTarget {
  key: string;
  host: string;
}

/** Page views' settings (ENVIRONMENTS.md §7). */
export type PageViewsConfig = PostHogConfig;

/**
 * The browser's page view settings: `NEXT_PUBLIC_POSTHOG_KEY`, set for production only, and
 * `POSTHOG_HOST` (ENVIRONMENTS.md §7). The web server reads them at request time and hands them
 * to the browser (`apps/web/app/layout.tsx`), so pass `process.env` itself: Next.js would inline
 * a literal `process.env.NEXT_PUBLIC_POSTHOG_KEY` at build time.
 */
export function readPageViewsConfig(env: EnvironmentVariables): PageViewsConfig {
  return readPostHogConfig(env, 'NEXT_PUBLIC_POSTHOG_KEY', 'page views');
}

/** Server product events' settings: `POSTHOG_KEY`, set for production only, and `POSTHOG_HOST`. */
export function readProductEventsConfig(env: EnvironmentVariables): PostHogConfig {
  return readPostHogConfig(env, 'POSTHOG_KEY', 'product events');
}

function readPostHogConfig(
  env: EnvironmentVariables,
  keyVariable: 'POSTHOG_KEY' | 'NEXT_PUBLIC_POSTHOG_KEY',
  what: string,
): PostHogConfig {
  const key = env[keyVariable]?.trim();
  if (!key) return {};
  const host = env.POSTHOG_HOST?.trim();
  const fix = 'Set POSTHOG_HOST to the PostHog host (ENVIRONMENTS.md §7).';
  if (!host)
    return { error: `${keyVariable} is set, but POSTHOG_HOST is not: ${what} are off. ${fix}` };
  if (!isHttpsUrl(host))
    return { error: `POSTHOG_HOST is not an https:// URL: ${what} are off. ${fix}` };
  return { key, host: host.replace(/\/+$/, '') };
}

function isHttpsUrl(value: string): boolean {
  return URL.canParse(value) && new URL(value).protocol === 'https:';
}
