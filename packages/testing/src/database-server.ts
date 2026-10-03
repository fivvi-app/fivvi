import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Internal helpers shared by `database.ts` (test files) and `database-setup.ts` (global setup).

declare module 'vitest' {
  export interface ProvidedContext {
    /** Set by `setupTemplateDatabase` in a package's Vitest global setup. */
    trainerHubTestRun?: { runId: string; templateName: string };
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PREFIX = 'trainer_hub_test_';

/**
 * The Postgres server tests create their databases on: `TEST_DATABASE_URL`, else
 * `DATABASE_URL`. Only local servers (Docker locally, a service container in CI)
 * are accepted, so a test can never touch a Railway database (TESTING.md §5.3).
 */
export function serverUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.TEST_DATABASE_URL || env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Set TEST_DATABASE_URL to a local Postgres, e.g. the one from `pnpm db:up` (see docs/engineering/TESTING.md §7.1).',
    );
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Never echo the URL: it contains the password.
    throw new Error('TEST_DATABASE_URL is not a valid URL.');
  }
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error('Integration tests only run against a Postgres server on localhost.');
  }
  return url;
}

/** A new id for one test run; every database the run creates starts with its prefix. */
export function newRunId(): string {
  return randomBytes(4).toString('hex');
}

export function runPrefix(runId: string): string {
  return `${PREFIX}${runId}_`;
}

export function newDatabaseName(runId: string): string {
  return `${runPrefix(runId)}${randomBytes(8).toString('hex')}`;
}

/** The connection string for `name` on the test server. */
export function databaseUrl(name: string): string {
  const url = new URL(serverUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

/** Quotes an identifier we generated ourselves (letters, digits, underscores only). */
export function identifier(name: string): string {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Unexpected database name: ${name}`);
  }
  return `"${name}"`;
}

/** Runs statements one by one on the server's maintenance database. */
export async function onServer<Row extends pg.QueryResultRow = pg.QueryResultRow>(
  ...statements: (string | { text: string; values: unknown[] })[]
): Promise<Row[]> {
  const client = new pg.Client({ connectionString: serverUrl() });
  await client.connect();
  try {
    let rows: Row[] = [];
    for (const statement of statements) {
      rows = (await client.query<Row>(statement)).rows;
    }
    return rows;
  } finally {
    await client.end();
  }
}

export async function dropDatabase(name: string): Promise<void> {
  await onServer(`DROP DATABASE IF EXISTS ${identifier(name)} WITH (FORCE)`);
}
