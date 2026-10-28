import type { TestProject } from 'vitest/node';
import {
  APP_ROLE_NAME,
  APP_ROLE_TEST_PASSWORD,
  databaseUrl,
  identifier,
  newRunId,
  onServer,
  runPrefix,
  serverUrl,
} from './database-server.ts';

/**
 * Builds a Vitest global setup that creates this run's template database, lets
 * `migrate` bring it to the latest schema once, and drops every database of the run
 * afterwards. Test files then clone it with `cloneTemplateDatabase()`.
 *
 * It also makes sure the roles exist before it migrates the template: roles belong to the server,
 * not to a database, so a clone does not copy them (`ensureTestRoles`).
 *
 * `migrate` must close all of its connections before it returns: Postgres can only
 * copy a database nobody is connected to.
 *
 * ```ts
 * // test/global-setup.ts
 * export default setupTemplateDatabase(async (url) => { ... run the migrations ... });
 * ```
 */
export function setupTemplateDatabase(migrate: (url: string) => Promise<void>) {
  return async function globalSetup(project: TestProject): Promise<() => Promise<void>> {
    serverUrl(); // Fail early, with a clear message, when no test database is configured.
    const runId = newRunId();
    const templateName = `${runPrefix(runId)}template`;
    const teardown = () => dropRunDatabases(runId);

    await ensureTestRoles();
    await onServer(`CREATE DATABASE ${identifier(templateName)}`);
    try {
      await migrate(databaseUrl(templateName));
      // Nobody may connect to the template any more, so every clone copies the same state.
      await onServer(
        `ALTER DATABASE ${identifier(templateName)} WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`,
      );
    } catch (error) {
      await teardown();
      throw error;
    }

    project.provide('fivviTestRun', { runId, templateName });
    return teardown;
  };
}

/**
 * Serialises role changes among the sessions of one database: several packages' global setups
 * (they all run on the maintenance database) and `ensureAppRole` (the release step under test)
 * may change the roles of one server at once. It is the key of `APP_ROLE_LOCK_KEY` in
 * `@fivvi/database` (that package depends on this one, so it cannot be imported here); a test in
 * the database package asserts they are equal.
 *
 * An advisory lock belongs to its database, so it does not hold back a release step that runs in
 * a test database (#274); `ensureTestRoles` retries that race (`isRoleRace`).
 */
export const ROLE_LOCK = 7_011_253;

/** How often `ensureTestRoles` tries when it loses a race with a writer in another database. */
const ROLE_RACE_ATTEMPTS = 20;

/**
 * Whether a failed statement lost a race on the server's role catalog with a session that does
 * not share the advisory lock (it runs in another database): "tuple concurrently updated" (XX000,
 * two `ALTER ROLE` of one role) or a duplicate role (23505, 42710). The other change commits a
 * moment later, so trying again succeeds. The same rule as `isRoleRace` in `@fivvi/database`.
 */
export function isRoleRace(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    const { code, message, severity } = current as {
      code?: unknown;
      message?: unknown;
      severity?: unknown;
    };
    if (typeof severity === 'string') {
      // A Postgres error (the driver's `DatabaseError` has a severity): decide on it.
      if (code === '23505' || code === '42710') return true;
      return code === 'XX000' && /tuple concurrently updated/.test(String(message));
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Makes sure the two roles of E011 exist on the test server, idempotently (`TESTING.md §5.3`):
 *
 * - the **privileged role** is the user of the test server's URL. It creates the databases, owns
 *   the tables and runs the migrations, like the release step's user in a real environment;
 * - the **app role** `fivvi_app` logs in with a fake password, is no superuser and cannot bypass
 *   RLS. The migration creates it without a login (so a migrated database always has it); this
 *   gives it the login. Its table privileges come from `runMigrations`, per database.
 *
 * Parallel global setups (one per package) may call this at the same moment, so it holds an
 * advisory lock for the length of one transaction. A release step in a test database has its own
 * lock space and may change the role at the same moment; that race is retried.
 */
export async function ensureTestRoles(): Promise<void> {
  const role = identifier(APP_ROLE_NAME);
  const password = APP_ROLE_TEST_PASSWORD.replaceAll("'", "''");
  for (let attempt = 1; ; attempt += 1) {
    try {
      await onServer(
        'BEGIN',
        { text: 'select pg_advisory_xact_lock($1)', values: [ROLE_LOCK] },
        `DO $$ BEGIN
           IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE_NAME}') THEN
             CREATE ROLE ${role};
           END IF;
         END $$`,
        `ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '${password}'`,
        'COMMIT',
      );
      return;
    } catch (error) {
      if (!isRoleRace(error) || attempt >= ROLE_RACE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10 + Math.random() * 30));
    }
  }
}

/** Drops the template and every database created in this run, even ones a test forgot. */
async function dropRunDatabases(runId: string): Promise<void> {
  const databases = await onServer<{ datname: string; datistemplate: boolean }>({
    text: 'select datname, datistemplate from pg_database where starts_with(datname, $1)',
    values: [runPrefix(runId)],
  });
  for (const { datname, datistemplate } of databases) {
    const name = identifier(datname);
    await onServer(
      ...(datistemplate ? [`ALTER DATABASE ${name} WITH IS_TEMPLATE false`] : []),
      `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`,
    );
  }
}
