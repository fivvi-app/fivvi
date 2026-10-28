import { describe, expect, it } from 'vitest';
import {
  APP_DATABASE_URL_VARIABLE,
  PRIVILEGED_DATABASE_URL_VARIABLE,
  readDatabaseConfig,
} from './env.ts';

describe('E004 database config', () => {
  it('names the two connection variables: the app role and the privileged role (E011)', () => {
    expect(APP_DATABASE_URL_VARIABLE).toBe('APP_DATABASE_URL');
    expect(PRIVILEGED_DATABASE_URL_VARIABLE).toBe('DATABASE_URL');
  });

  it.each([
    'postgres://app:secret@localhost:5432/trainer_hub',
    'postgresql://app:secret@postgres.railway.internal:5432/railway',
  ])('reads the variable it is asked for: %s', (url) => {
    expect(readDatabaseConfig({ APP_DATABASE_URL: url }, 'APP_DATABASE_URL')).toEqual({ url });
    expect(readDatabaseConfig({ DATABASE_URL: url }, 'DATABASE_URL')).toEqual({ url });
  });

  it('E011: never falls back from one variable to the other', () => {
    const env = { DATABASE_URL: 'postgres://owner:secret@localhost:5432/trainer_hub' };
    expect(() => readDatabaseConfig(env, 'APP_DATABASE_URL')).toThrow(
      /APP_DATABASE_URL is not set/,
    );
  });

  it.each([
    ['missing', {}, /APP_DATABASE_URL is not set/],
    ['empty', { APP_DATABASE_URL: '  ' }, /APP_DATABASE_URL is not set/],
    ['not a URL', { APP_DATABASE_URL: 'localhost:5432' }, /must start with postgres/],
    ['garbage', { APP_DATABASE_URL: 'not a url' }, /not a valid URL/],
    [
      'another database',
      { APP_DATABASE_URL: 'mysql://app:secret@localhost/db' },
      /must start with postgres/,
    ],
  ])('rejects a %s APP_DATABASE_URL', (_case, env, message) => {
    expect(() => readDatabaseConfig(env, 'APP_DATABASE_URL')).toThrow(message);
  });

  it('never puts the password in the error message', () => {
    const env = { APP_DATABASE_URL: 'mysql://app:hunter2@localhost/db' };
    let message = '';
    try {
      readDatabaseConfig(env, 'APP_DATABASE_URL');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/must start with postgres/);
    expect(message).not.toContain('hunter2');
  });
});
