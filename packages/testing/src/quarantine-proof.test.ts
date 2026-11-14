import { describe, expect, it } from 'vitest';

// PROOF ONLY (#1361): a deliberately failing test on the quarantine list; reverted by the next commit.
describe('quarantine proof (CI)', () => {
  it('a deliberately failing test', () => {
    expect(1).toBe(2);
  });
});
