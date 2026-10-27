import { ROLE_LOCK } from '@fivvi/testing/database/setup';
import { describe, expect, it } from 'vitest';
import { APP_ROLE_LOCK_KEY } from './app-role.ts';

describe('the lock that serialises changes to the app role', () => {
  it('is the same key in ensureAppRole and in the test setup (ensureTestRoles)', () => {
    // @fivvi/testing cannot import this package, so each keeps the number; they must stay equal
    // or the release step and the global setups can run ALTER ROLE at the same moment.
    expect(ROLE_LOCK).toBe(APP_ROLE_LOCK_KEY);
  });
});
