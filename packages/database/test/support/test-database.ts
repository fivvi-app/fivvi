import { randomUUID } from 'node:crypto';
import pg from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface TestDatabase {
  /** Connection string for the new, empty database. */
  url: string;
  drop(): Promise<void>;
}

/**
 * The Postgres server tests create their databases on: `TEST_DATABASE_URL`, else
 * `DATABASE_URL`. Only local servers (Docker locally, a service container in CI)
 * are accepted, so a test can never touch a Railway database (TESTING.md §5.3).
 */
function serverUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Set TEST_DATABASE_URL or DATABASE_URL to a local Postgres (see packages/database/README.md).',
    );
  }
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error('Integration tests only run against a Postgres server on localhost.');
  }
  return url;
}

async function onServer(url: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/** Creates a uniquely named, empty database, so test runs never share data. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const server = serverUrl();
  const name = `trainer_hub_test_${randomUUID().replaceAll('-', '')}`;
  await onServer(server, `CREATE DATABASE "${name}"`);
  const url = new URL(server);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () => onServer(server, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
  };
}
