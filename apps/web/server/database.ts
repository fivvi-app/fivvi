import { createAppDatabaseFromEnv, type Database, type DatabaseClient } from '@fivvi/database';

let client: DatabaseClient | undefined;

/**
 * The process-wide database client, created on first use from `APP_DATABASE_URL`: the web
 * connects as the app role `fivvi_app`, which RLS applies to (E011, ADR-006). Never
 * `DATABASE_URL`, the privileged connection of the release step. Lazy, so `next build` runs
 * without a database. Throws when `APP_DATABASE_URL` is missing or invalid.
 */
export function database(): Database {
  client ??= createAppDatabaseFromEnv();
  return client.db;
}
