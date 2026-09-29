import { describe, expect, it } from 'vitest';
import { identifier, serverUrl } from './database-server.ts';

describe('E010 test database server', () => {
  it.each([
    'postgres://u:p@localhost:5432/db',
    'postgres://u:p@127.0.0.1:5432/db',
    'postgresql://u:p@[::1]:5432/db',
  ])('accepts the local server %s', (url) => {
    expect(serverUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it('prefers TEST_DATABASE_URL over DATABASE_URL', () => {
    const env = {
      TEST_DATABASE_URL: 'postgres://u:p@localhost/test',
      DATABASE_URL: 'postgres://u:p@localhost/dev',
    };
    expect(serverUrl(env)).toBe(env.TEST_DATABASE_URL);
    expect(serverUrl({ DATABASE_URL: env.DATABASE_URL })).toBe(env.DATABASE_URL);
  });

  it.each([
    'postgres://u:secret@db.railway.internal:5432/railway',
    'postgres://u:secret@example.com/db',
  ])('refuses a server that is not on localhost: %s', (url) => {
    expect(() => serverUrl({ TEST_DATABASE_URL: url })).toThrow('only run against a Postgres');
  });

  it('explains how to configure a missing server', () => {
    expect(() => serverUrl({})).toThrow('Set TEST_DATABASE_URL');
  });

  it('never echoes an invalid URL, which may contain a password', () => {
    expect(() => serverUrl({ TEST_DATABASE_URL: 'not a url secret' })).toThrow(
      /^TEST_DATABASE_URL is not a valid URL\.$/,
    );
  });

  it('only quotes names it generated', () => {
    expect(identifier('trainer_hub_test_ab12_cd34')).toBe('"trainer_hub_test_ab12_cd34"');
    expect(() => identifier('x"; drop database prod; --')).toThrow('Unexpected database name');
  });
});
