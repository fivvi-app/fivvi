import { describe, expect, it } from 'vitest';
import { readDatabaseConfig } from './env.ts';

describe('E004 database config', () => {
  it.each([
    'postgres://app:secret@localhost:5432/trainer_hub',
    'postgresql://app:secret@postgres.railway.internal:5432/railway',
  ])('reads DATABASE_URL %s', (url) => {
    expect(readDatabaseConfig({ DATABASE_URL: url })).toEqual({ url });
  });

  it.each([
    ['missing', {}, /DATABASE_URL is not set/],
    ['empty', { DATABASE_URL: '  ' }, /DATABASE_URL is not set/],
    ['not a URL', { DATABASE_URL: 'localhost:5432' }, /must start with postgres/],
    ['garbage', { DATABASE_URL: 'not a url' }, /not a valid URL/],
    [
      'another database',
      { DATABASE_URL: 'mysql://app:secret@localhost/db' },
      /must start with postgres/,
    ],
  ])('rejects a %s DATABASE_URL', (_case, env, message) => {
    expect(() => readDatabaseConfig(env)).toThrow(message);
  });

  it('never puts the password in the error message', () => {
    const env = { DATABASE_URL: 'mysql://app:hunter2@localhost/db' };
    let message = '';
    try {
      readDatabaseConfig(env);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/must start with postgres/);
    expect(message).not.toContain('hunter2');
  });
});
