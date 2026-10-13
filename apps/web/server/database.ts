import { createDatabaseFromEnv, type Database, type DatabaseClient } from '@trainer-hub/database';

let client: DatabaseClient | undefined;

/**
 * The process-wide database client, created on first use from `DATABASE_URL`. Lazy, so
 * `next build` runs without a database. Throws when `DATABASE_URL` is missing or invalid.
 */
export function database(): Database {
  client ??= createDatabaseFromEnv();
  return client.db;
}
