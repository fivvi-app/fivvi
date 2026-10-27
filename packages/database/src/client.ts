import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { APP_DATABASE_URL_VARIABLE, type DatabaseConfig, readDatabaseConfig } from './env.ts';
import * as schema from './schema/index.ts';

export type Database = NodePgDatabase<typeof schema>;

/**
 * The database or a transaction on it. Queries and seeds take this, so they also run
 * inside a transaction: a request's RLS context (E011) or a `withRollback` test.
 */
export type DatabaseExecutor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export interface DatabaseClient {
  db: Database;
  /** Closes every pooled connection. Call once when the process shuts down. */
  close(): Promise<void>;
}

export function createDatabase(config: DatabaseConfig): DatabaseClient {
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.maxConnections ?? 10,
    // Every session runs in UTC whatever the server default is, so `now()` and
    // timestamptz text output never depend on where Postgres runs (ADR-012).
    options: '-c TimeZone=UTC',
  });
  // Without a listener, an idle connection dropped by the server (e.g. a restart)
  // crashes the process. The pool replaces the connection on the next query.
  pool.on('error', (error) => {
    console.error('Idle database connection failed:', error.message);
  });
  const db = drizzle({ client: pool, schema });
  return { db, close: () => pool.end() };
}

/**
 * The database as the app role `fivvi_app`, from `APP_DATABASE_URL` (E011): what the web runtime
 * uses, so RLS alone keeps workspaces apart. Never falls back to `DATABASE_URL`; the privileged
 * connection only comes from `openPrivilegedDatabase`.
 */
export function createAppDatabaseFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { maxConnections?: number } = {},
): DatabaseClient {
  return createDatabase({
    ...readDatabaseConfig(env, APP_DATABASE_URL_VARIABLE),
    maxConnections: options.maxConnections,
  });
}
