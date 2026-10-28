export interface DatabaseConfig {
  /** A `postgres://` or `postgresql://` connection string. Contains a password: never log it. */
  url: string;
  /** Maximum number of pooled connections. */
  maxConnections?: number;
}

const PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/**
 * The connection of the running app: the web runtime connects as the app role `fivvi_app`, which
 * RLS applies to (E011, ADR-006). Railway builds it from `APP_DATABASE_PASSWORD`
 * (`.railway/railway.ts`); locally it is in `.env`.
 */
export const APP_DATABASE_URL_VARIABLE = 'APP_DATABASE_URL';

/**
 * The privileged connection (the user that owns the tables and runs the migrations). Only
 * `openPrivilegedDatabase` (`privileged.ts`) reads it; a check fails for any other source file
 * that mentions it (AC17).
 */
export const PRIVILEGED_DATABASE_URL_VARIABLE = 'DATABASE_URL';

export type DatabaseUrlVariable =
  | typeof APP_DATABASE_URL_VARIABLE
  | typeof PRIVILEGED_DATABASE_URL_VARIABLE;

/**
 * Reads the connection settings from `variable` of the environment. There is no fallback from
 * one connection to the other: a missing app connection must fail, never quietly use the
 * privileged one. Error messages never include the URL, because it contains the password.
 */
export function readDatabaseConfig(
  env: NodeJS.ProcessEnv,
  variable: DatabaseUrlVariable,
): DatabaseConfig {
  const url = env[variable]?.trim();
  if (!url) {
    throw new Error(
      `${variable} is not set. For local development, copy packages/database/.env.example to .env.`,
    );
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error(`${variable} is not a valid URL.`);
  }
  if (!PROTOCOLS.has(protocol)) {
    throw new Error(`${variable} must start with postgres:// or postgresql://.`);
  }
  return { url };
}

/** The variable that holds the app role's password in each environment (E011, `.railway/railway.ts`). */
export const APP_ROLE_PASSWORD_VARIABLE = 'APP_DATABASE_PASSWORD';

/**
 * The app role's password, or `undefined` when the environment has none yet (unset or blank).
 * The release step then leaves the role as it is. Never log the value.
 */
export function readAppRolePassword(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[APP_ROLE_PASSWORD_VARIABLE]?.trim() || undefined;
}
