/**
 * Inline retry for sends (ADR-010): a few quick attempts inside the request, no queue.
 * The request waits for them, so the total wait stays around a second.
 */
export interface RetryPolicy {
  /** Attempts in total, including the first. */
  maxAttempts: number;
  /** Upper bound of the wait before the second attempt; it doubles for each attempt after. */
  baseDelayMs: number;
  /**
   * Longest single wait. When the provider asks us to wait longer (`Retry-After`), we give up
   * instead: the user can ask for a new email, and the request shouldn't hang.
   */
  maxDelayMs: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};

/**
 * Wait before attempt `attempt + 1`, with "full jitter": a random time between 0 and the
 * exponential bound, so clients that failed together don't retry together.
 * `random` returns a number in [0, 1), like `Math.random`.
 */
export function backoffDelay(attempt: number, policy: RetryPolicy, random: () => number): number {
  const bound = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * bound);
}

/**
 * The wait before the next attempt, or `undefined` when there shouldn't be one. A provider's
 * `Retry-After` is a minimum: we wait at least that long, and give up if it's over the cap.
 */
export function nextDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number,
  retryAfterMs?: number,
): number | undefined {
  if (attempt >= policy.maxAttempts) return undefined;
  const backoff = backoffDelay(attempt, policy, random);
  if (retryAfterMs === undefined) return backoff;
  if (retryAfterMs > policy.maxDelayMs) return undefined;
  return Math.max(retryAfterMs, backoff);
}
