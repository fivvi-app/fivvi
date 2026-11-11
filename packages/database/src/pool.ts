import pg from 'pg';
import type { DatabaseConfig } from './env.ts';

/**
 * The connection pool of every database handle. It imports `pg` only, so code that needs a
 * connection and not the ORM or the schema (the restore drill's helper, #1309) can start without
 * loading them.
 */
export function createPool(config: DatabaseConfig): pg.Pool {
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
  return pool;
}
