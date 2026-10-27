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
 * Serialises role changes: several packages' global setups, and `ensureAppRole` (the release step
 * under test), may change the roles of one server at once. It is the key of `APP_ROLE_LOCK_KEY` in
 * `@fivvi/database` (that package depends on this one, so it cannot be imported here); a test in
 * the database package asserts they are equal.
 */
export const ROLE_LOCK = 7_011_253;

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
 * advisory lock for the length of one transaction.
 */
export async function ensureTestRoles(): Promise<void> {
  const role = identifier(APP_ROLE_NAME);
  const password = APP_ROLE_TEST_PASSWORD.replaceAll("'", "''");
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
