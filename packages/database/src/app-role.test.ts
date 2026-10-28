import { isRoleRace as isTestRoleRace, ROLE_LOCK } from '@fivvi/testing/database/setup';
import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROLE_LOCK_KEY, ensureAppRole, isRoleRace, ROLE_RACE_ATTEMPTS } from './app-role.ts';
import type { DatabaseExecutor } from './client.ts';

describe('the lock that serialises changes to the app role', () => {
  it('is the same key in ensureAppRole and in the test setup (ensureTestRoles)', () => {
    // @fivvi/testing cannot import this package, so each keeps the number; they must stay equal
    // or the release step and the global setups can run ALTER ROLE at the same moment.
    expect(ROLE_LOCK).toBe(APP_ROLE_LOCK_KEY);
  });
});

/** A Postgres error as the driver throws it, optionally wrapped as Drizzle wraps it. */
function postgresError(code: string, message: string, wrapped = false): Error {
  const error = new pg.DatabaseError(message, 0, 'error');
  error.code = code;
  error.severity = 'ERROR';
  return wrapped ? new Error('Failed query', { cause: error }) : error;
}

describe('the race with a change to the role in another database (#274)', () => {
  // An advisory lock belongs to its database, a role to the server: two writers in two databases
  // do not wait for each other, and the loser fails on the shared role catalog.
  const races: [string, Error][] = [
    ['tuple concurrently updated', postgresError('XX000', 'tuple concurrently updated')],
    ['the same, wrapped by Drizzle', postgresError('XX000', 'tuple concurrently updated', true)],
    ['a duplicate role name index', postgresError('23505', 'duplicate key value violates unique')],
    ['a role that exists', postgresError('42710', 'role "fivvi_app" already exists')],
    [
      'a race under a wrapper that is no Postgres error',
      Object.assign(
        new Error('Failed query', { cause: postgresError('XX000', 'tuple concurrently updated') }),
        {
          severity: 'ERROR',
          code: 'not-a-sqlstate',
        },
      ),
    ],
  ];
  const others: [string, unknown][] = [
    ['another internal error', postgresError('XX000', 'cache lookup failed for role 1')],
    ['a missing role', postgresError('42704', 'role "fivvi_app" does not exist')],
    ['a permission error', postgresError('42501', 'permission denied to alter role')],
    ['a connection error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })],
    ['not an error', undefined],
  ];

  it.each(races)('is retried: %s', (_name, error) => {
    expect(isRoleRace(error)).toBe(true);
    expect(isTestRoleRace(error)).toBe(true);
  });

  it.each(others)('is not retried: %s', (_name, error) => {
    expect(isRoleRace(error)).toBe(false);
    expect(isTestRoleRace(error)).toBe(false);
  });
});

describe('the retry of a change that lost the race', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** An executor whose every statement fails with `error`; `calls` counts the tries (statements). */
  function failingWith(error: unknown) {
    const calls = { count: 0 };
    const db = {
      execute: () => {
        calls.count += 1;
        return Promise.reject(error);
      },
      transaction: (run: (tx: unknown) => Promise<unknown>) => run(db),
    } as unknown as DatabaseExecutor;
    return { db, calls };
  }

  it('gives up after ROLE_RACE_ATTEMPTS tries with an error of the SQLSTATE only', async () => {
    vi.useFakeTimers();
    const { db, calls } = failingWith(
      postgresError('XX000', 'tuple concurrently updated: ALTER ROLE secret-statement', true),
    );

    const outcome = ensureAppRole(db, { role: 'fivvi_probe_retry' }).catch(
      (caught: unknown) => caught,
    );
    await vi.runAllTimersAsync();
    const error = await outcome;

    // The first statement of a try fails, so one statement is one try.
    expect(calls.count).toBe(ROLE_RACE_ATTEMPTS);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('The app role could not be set up (SQLSTATE XX000).');
  });

  it('tries a change that fails with anything else exactly once', async () => {
    vi.useFakeTimers();
    const { db, calls } = failingWith(postgresError('42501', 'permission denied to alter role'));

    const error = await ensureAppRole(db, { role: 'fivvi_probe_retry' }).catch(
      (caught: unknown) => caught,
    );

    expect(calls.count).toBe(1);
    expect((error as Error).message).toBe('The app role could not be set up (SQLSTATE 42501).');
  });
});
