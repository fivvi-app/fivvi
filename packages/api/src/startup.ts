import { APP_DATABASE_URL_VARIABLE, type ConnectionRoleReport } from '@fivvi/database';

/** What the API needs to check before it serves a request (E011, AC4). */
export interface StartupChecks {
  /** The login role of the API's database connection and what is wrong with it. */
  inspectDatabaseRole(): Promise<ConnectionRoleReport>;
}

/** The API must not start: the reason is in the message, which never holds the connection string. */
export class StartupError extends Error {
  override readonly name = 'StartupError';
}

const FIX =
  `Connect as the app role (${APP_DATABASE_URL_VARIABLE}): the release step creates it ` +
  'with the password of APP_DATABASE_PASSWORD.';

/** The code of a failed connection or query, nothing else: the error text can quote an address. */
function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[0-9A-Za-z_]{1,16}$/.test(code) ? ` (${code})` : '';
}

/**
 * Refuses to start (throws a `StartupError`) when the API's database connection logs in as a
 * role that breaks the tenant isolation: a superuser, a role with `BYPASSRLS`, a table owner, a
 * member of another role (AC4, ADR-006). RLS is the second barrier of the isolation, and only
 * holds for a role it applies to. It says why and never prints the connection string, and a
 * database that cannot be reached is a refusal too: the API never starts blind.
 */
export async function verifyStartup(checks: StartupChecks): Promise<void> {
  let report: ConnectionRoleReport;
  try {
    report = await checks.inspectDatabaseRole();
  } catch (error) {
    // Not the error itself: a driver error can quote the address or the user.
    throw new StartupError(
      `Refusing to start: the database role of the connection could not be checked${failureCode(error)}. ${FIX}`,
    );
  }
  if (report.problems.length) {
    throw new StartupError(
      `Refusing to start: the database connection logs in as "${report.role}", and ${report.problems.join('; ')}. ${FIX}`,
    );
  }
}
