import { describe, expect, it } from 'vitest';
import { readLocalDatabaseUrl } from './reset-rate-limits.ts';

describe('F001 clearing the sign-in rate limits (local databases only, TESTING.md §5.3)', () => {
  it.each([
    'postgres://u:p@localhost:5432/db',
    'postgres://u:p@127.0.0.1:5432/db',
    'postgresql://u:p@[::1]:5432/db',
  ])('accepts the local database %s', (url) => {
    expect(readLocalDatabaseUrl({ APP_DATABASE_URL: url })).toBe(url);
  });

  it.each([
    'postgres://u:secret@db.railway.internal:5432/railway',
    'postgres://u:secret@example.com/db',
  ])('refuses a database that is not on localhost: %s', (url) => {
    expect(() => readLocalDatabaseUrl({ APP_DATABASE_URL: url })).toThrow(
      'only runs against a Postgres server on localhost',
    );
  });

  it('checks APP_DATABASE_URL, the database the script clears, never TEST_DATABASE_URL or the privileged DATABASE_URL', () => {
    expect(() =>
      readLocalDatabaseUrl({
        TEST_DATABASE_URL: 'postgres://u:p@localhost/test',
        DATABASE_URL: 'postgres://u:p@localhost/privileged',
        APP_DATABASE_URL: 'postgres://u:p@db.railway.internal/railway',
      }),
    ).toThrow('only runs against a Postgres server on localhost');
  });

  it('never echoes the URL, which holds the password', () => {
    for (const url of ['postgres://u:hunter2@db.railway.internal/railway', 'not a url hunter2']) {
      let message = '';
      try {
        readLocalDatabaseUrl({ APP_DATABASE_URL: url });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain('hunter2');
    }
  });

  it('needs APP_DATABASE_URL', () => {
    expect(() => readLocalDatabaseUrl({})).toThrow('APP_DATABASE_URL is not set');
  });
});
