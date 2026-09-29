import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { type DatabaseConfig, readDatabaseConfig } from './env.ts';
import * as schema from './schema/index.ts';

export type Database = NodePgDatabase<typeof schema>;

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

export function createDatabaseFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseClient {
  return createDatabase(readDatabaseConfig(env));
}
