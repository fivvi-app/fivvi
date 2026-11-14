import { expect, test } from '@playwright/test';

// PROOF ONLY (#1361): a deliberately failing spec on the quarantine list; reverted by the next commit.
test.describe('quarantine proof (CI)', () => {
  test('a deliberately failing test', () => {
    expect(1).toBe(2);
  });
});
