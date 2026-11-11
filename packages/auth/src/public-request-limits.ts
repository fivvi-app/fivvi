import { deleteExpiredRateLimits, type RateLimitRule } from '@fivvi/database';
import { clientIp, isOverLimit, type SignInRateLimitOptions } from './rate-limit.ts';

// The counters of the public request guard (E013, spec #467): join requests per IP address and
// per account, and booking churn per account. Same store and key pattern as the sign-in limits:
// the existing rate-limit table (`auth_rate_limits`), keyed hashes only (no raw IP address, account
// ID or email address is stored), expired rows cleared as they are. The pending caps of join
// requests are not counters; they are in `packages/api` (`public-request-guard.ts`), because the
// records they count are F029's.

/** Join requests per client IP address per hour, from any accounts (AC6). */
export const JOIN_REQUEST_IP_LIMIT: RateLimitRule = { max: 10, windowMinutes: 60 };

/** Join requests per account per hour (AC6). */
export const JOIN_REQUEST_ACCOUNT_LIMIT: RateLimitRule = { max: 5, windowMinutes: 60 };

/**
 * Book or cancel actions per account per 10 minutes, across any classes (AC7). It counts actions,
 * not classes: it caps the emails a book–cancel loop sends to a trainer.
 */
export const BOOKING_CHURN_LIMIT: RateLimitRule = { max: 20, windowMinutes: 10 };

/**
 * Each method counts one request and answers whether it is over its limit (`true`: refuse it).
 * A request over a limit is counted too, and never moves the end of its window.
 */
export interface PublicRequestLimits {
  /** A join request from the client IP address of `headers`. */
  joinRequestFromIp(headers: Headers): Promise<boolean>;
  /** A join request of this account. */
  joinRequestFromAccount(accountId: string): Promise<boolean>;
  /** A book or cancel action of this account. */
  bookingAction(accountId: string): Promise<boolean>;
}

export function createPublicRequestLimits({
  db,
  secret,
  clock,
  log,
  requireClientIp,
}: Pick<
  SignInRateLimitOptions,
  'db' | 'secret' | 'clock' | 'log' | 'requireClientIp'
>): PublicRequestLimits {
  const store = { db, secret };

  /** Counts, clears the windows that have ended, and logs the rule (never a value) when over. */
  async function count(
    name: 'join-ip' | 'join-account' | 'booking-account',
    value: string,
    rule: RateLimitRule,
    line: string,
  ) {
    const now = clock.now();
    const limited = await isOverLimit(store, name, value, rule, now);
    await deleteExpiredRateLimits(db, now);
    if (limited) log(line);
    return limited;
  }

  return {
    joinRequestFromIp(headers) {
      // No usable address and no proxy in front (local, tests): no per-address limit.
      const ip = clientIp(headers, requireClientIp);
      if (ip === null) return Promise.resolve(false);
      return count('join-ip', ip, JOIN_REQUEST_IP_LIMIT, 'Join request rate-limited: ip');
    },
    joinRequestFromAccount: (accountId) =>
      count(
        'join-account',
        accountId,
        JOIN_REQUEST_ACCOUNT_LIMIT,
        'Join request rate-limited: account',
      ),
    bookingAction: (accountId) =>
      count(
        'booking-account',
        accountId,
        BOOKING_CHURN_LIMIT,
        'Booking action rate-limited: account',
      ),
  };
}
