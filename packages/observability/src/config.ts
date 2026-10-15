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
  const dsn = env.SENTRY_DSN?.trim() || undefined;
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
