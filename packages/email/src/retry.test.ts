import { describe, expect, it } from 'vitest';
import { backoffDelay, defaultRetryPolicy, nextDelay } from './retry.ts';

const policy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 300 };

describe('E006 retry backoff', () => {
  it('doubles the bound per attempt, up to the cap', () => {
    const almostOne = () => 0.999_999;
    expect([1, 2, 3, 4].map((a) => backoffDelay(a, policy, almostOne))).toEqual([
      99, 199, 299, 299,
    ]);
  });

  it('picks a random wait below the bound (full jitter)', () => {
    expect(backoffDelay(2, policy, () => 0)).toBe(0);
    expect(backoffDelay(2, policy, () => 0.5)).toBe(100);
  });

  it('stops after the last attempt', () => {
    expect(nextDelay(3, policy, () => 0.5)).toBe(150);
    expect(nextDelay(4, policy, () => 0.5)).toBeUndefined();
  });

  it('waits at least as long as the provider asks, and gives up past the cap', () => {
    expect(nextDelay(1, policy, () => 0.5, 250)).toBe(250);
    expect(nextDelay(1, policy, () => 0.99, 10)).toBe(99);
    expect(nextDelay(1, policy, () => 0.5, 301)).toBeUndefined();
  });

  it('keeps the default inline retry short (ADR-010)', () => {
    const worst = [1, 2].reduce((sum, a) => sum + backoffDelay(a, defaultRetryPolicy, () => 1), 0);
    expect(defaultRetryPolicy.maxAttempts).toBe(3);
    expect(worst).toBeLessThanOrEqual(1_000);
  });
});
