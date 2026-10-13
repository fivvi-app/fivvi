import type { TestProject } from 'vitest/node';
import {
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

    project.provide('trainerHubTestRun', { runId, templateName });
    return teardown;
  };
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
