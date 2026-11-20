import pg from 'pg';
import { inject } from 'vitest';
import {
  appRoleUrl,
  cronRoleUrl,
  databaseUrl,
  dropDatabase,
  identifier,
  newDatabaseName,
  newRunId,
  onServer,
} from './database-server.ts';

/**
 * Database isolation for integration tests (TESTING.md §5.3):
 *
 * 1. Per run: the package's global setup migrates one **template database**
 *    (`setupTemplateDatabase` from `@fivvi/testing/database/setup`).
 * 2. Per test file: `cloneTemplateDatabase()` in `beforeAll` gives the file its own
 *    migrated database in milliseconds, so files run in parallel without sharing data.
 * 3. Per test: `withRollback()` runs the test in a transaction that is always rolled
 *    back. This is the default for API and isolation tests.
 * 4. Tests that must commit (concurrency, several connections, migrations) create their
 *    own database per test instead: `cloneTemplateDatabase()` or `createTestDatabase()`.
 */

export interface TestDatabase {
  /** Database name, unique per test run. */
  name: string;
  /** Connection string. Contains the password: never log it. */
  url: string;
  /** Connection string as the app role (`fivvi_app`): the role RLS applies to (E011). */
  appUrl: string;
  /** Connection string as the cron role (`fivvi_cron`): the role the cron's tasks use (E012). */
  cronUrl: string;
  /** Drops the database, closing any connection that is still open. */
  drop(): Promise<void>;
}

function testDatabase(name: string): TestDatabase {
  return {
    name,
    url: databaseUrl(name),
    appUrl: appRoleUrl(name),
    cronUrl: cronRoleUrl(name),
    drop: () => dropDatabase(name),
  };
}

function testRun() {
  return inject('fivviTestRun');
}

/** Creates an empty database. Use it for migration tests; everything else clones the template. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = newDatabaseName(testRun()?.runId ?? newRunId());
  await onServer(`CREATE DATABASE ${identifier(name)}`);
  return testDatabase(name);
}

/**
 * Creates a database from the migrated template. Needs the package's global setup to
 * call `setupTemplateDatabase` (see `vitest.integration.config.ts`).
 */
export async function cloneTemplateDatabase(): Promise<TestDatabase> {
  const run = testRun();
  if (!run) {
    throw new Error(
      'No template database. Add a global setup that calls setupTemplateDatabase() to vitest.integration.config.ts.',
    );
  }
  const name = newDatabaseName(run.runId);
  await onServer(
    `CREATE DATABASE ${identifier(name)} TEMPLATE ${identifier(run.templateName)} STRATEGY FILE_COPY`,
  );
  return testDatabase(name);
}

export interface TestPool extends pg.Pool {
  /** Ends the pool and waits until every connection is closed, then it is safe to drop the database. */
  close(): Promise<void>;
}

/**
 * A pool for a test file's own connections (the logging pool of a query test, a pool as another
 * role). Use it instead of a bare `new pg.Pool(...)`, which breaks the run when its database is
 * dropped (#1443): `pool.end()` resolves before the sockets are closed, and the pool of an idle
 * client re-emits a backend ended by `DROP DATABASE ... WITH (FORCE)` or `pg_terminate_backend`
 * (`57P01`) as an `error` event with no listener, which Vitest reports as an unhandled error
 * while every test passes. This pool ignores that one error (the pool replaces the connection on
 * the next query) and rethrows any other, and `close()` resolves only after every connection has ended.
 */
export function createTestPool(
  connectionString: string,
  options: Omit<pg.PoolConfig, 'connectionString'> = {},
): TestPool {
  const pool = new pg.Pool({ ...options, connectionString }) as TestPool;
  const ended: Promise<void>[] = [];
  pool.on('error', (error: Error & { code?: string }) => {
    // Only the end of a backend is expected; any other idle-client error must still surface.
    if (error.code !== '57P01') throw error;
  });
  pool.on('connect', (client) => {
    ended.push(new Promise((resolve) => client.once('end', () => resolve())));
  });
  pool.close = async () => {
    await pool.end();
    await Promise.all(ended);
  };
  return pool;
}

/** Anything with a Drizzle-style `transaction(callback)`. */
interface Transactional {
  // biome-ignore lint/suspicious/noExplicitAny: matches any transaction callback signature.
  transaction(callback: (tx: any) => Promise<unknown>): Promise<unknown>;
}

type TransactionOf<D extends Transactional> = Parameters<Parameters<D['transaction']>[0]>[0];

class Rollback extends Error {}

/**
 * Runs `test` inside a transaction that is always rolled back, even when it passes, so
 * the database is unchanged afterwards. Everything inside sees its own writes.
 *
 * Inside the transaction: `now()` is the transaction's start time, sequences don't roll
 * back, and deferred constraints are never checked (they run at commit). Tests that
 * depend on any of these, or need a second connection, must commit in their own
 * database instead.
 */
export async function withRollback<D extends Transactional, T>(
  db: D,
  test: (tx: TransactionOf<D>) => Promise<T>,
): Promise<T> {
  let result: { value: T } | undefined;
  try {
    await db.transaction(async (tx) => {
      result = { value: await test(tx) };
      throw new Rollback('rolled back by withRollback');
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  if (!result) throw new Error('withRollback: the transaction ended without running the test.');
  return result.value;
}
