import { lte, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { authRateLimits } from '../schema/index.ts';

export interface RateLimitRule {
  /** How many requests one key may make per window. */
  max: number;
  windowMinutes: number;
}

/**
 * Counts one request of `key` in its current fixed window and says whether it is within the
 * rule. The first request starts the window, which ends `windowMinutes` later; the next one
 * after that starts a new window. Requests over the limit are counted too but never move the
 * end of the window. The count goes up in one statement, so parallel requests are all counted
 * and a restart loses nothing.
 *
 * `now` is passed in (an injected clock), never read from the server. Expired rows of every
 * key are deleted on the way.
 */
export async function consumeRateLimit(
  db: DatabaseExecutor,
  key: string,
  rule: RateLimitRule,
  now: Date,
): Promise<{ allowed: boolean }> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const windowEnd = sql`${new Date(now.getTime() + rule.windowMinutes * 60_000).toISOString()}::timestamptz`;
  const expired = sql`${authRateLimits.windowEndsAt} <= ${at}`;
  const [row] = await db
    .insert(authRateLimits)
    .values({ key, count: 1, windowEndsAt: sql`${windowEnd}` })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
        windowEndsAt: sql`CASE WHEN ${expired} THEN ${windowEnd} ELSE ${authRateLimits.windowEndsAt} END`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ count: authRateLimits.count });
  await db.delete(authRateLimits).where(lte(authRateLimits.windowEndsAt, now));
  return { allowed: (row?.count ?? 1) <= rule.max };
}
