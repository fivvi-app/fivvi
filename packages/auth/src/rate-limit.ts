import {
  consumeRateLimit,
  type Database,
  deleteExpiredRateLimits,
  type RateLimitRule,
} from '@fivvi/database';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, getIP } from 'better-auth/api';
import { hashSecretValue } from './hash.ts';
import { type Clock, emailSchema, REQUEST_PATH, REQUESTED } from './sign-in-plugin.ts';

/**
 * Sign-in requests per email address: 3 in 15 minutes (AC10, spec #128). The request counts
 * whether or not the address has an account, so the limit can't show who has one.
 */
export const ADDRESS_LIMIT: RateLimitRule = { max: 3, windowMinutes: 15 };

/** Sign-in requests per IP address: 20 in an hour (AC10). */
export const IP_LIMIT: RateLimitRule = { max: 20, windowMinutes: 60 };

/**
 * The header that carries the client's IP address. Railway's docs name `X-Real-IP` "for
 * identifying client's remote IP" (https://docs.railway.com/networking/public-networking/specs-and-limits),
 * the only client IP header they list. That the edge overwrites a value the client sent is
 * reported by Railway staff on their forum, not stated in the docs, and has not been checked
 * here: check it on the PR preview (`ENVIRONMENTS.md §7`). `X-Forwarded-For` is not trusted:
 * clients can put anything in it. Outside Railway (local, e2e) the client sends this header
 * itself, which is how a test picks its IP address (`TESTING.md §7.1`).
 */
export const CLIENT_IP_HEADER = 'x-real-ip';

/**
 * The IP bucket of a request that carries no usable client IP address in production, where
 * Railway's proxy always sets the header. Such a request did not come through the proxy (or
 * forged the header), so all of them share one limit instead of none. Real addresses can't
 * collide with it.
 */
const UNKNOWN_IP = 'unknown';

/**
 * Better Auth's option for where it reads the client IP address from, for the sign-in session
 * it records and for its own limits on its other endpoints. IPv6 addresses count as one
 * address per /64 network (Better Auth's default), because one device owns a whole /64.
 */
export const clientIpOptions = {
  ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
} satisfies NonNullable<BetterAuthOptions['advanced']>;

export interface SignInRateLimitOptions {
  db: Database;
  /** `BETTER_AUTH_SECRET`: the key of the hashes in the stored limit keys. */
  secret: string;
  /** Where "now" comes from: it starts and ends the windows. */
  clock: Clock;
  /** Gets one line per limited request. It never holds an email address or an IP address. */
  log: (line: string) => void;
  /** Production: a request without a client IP address counts against one shared bucket. */
  production: boolean;
}

type LimitName = 'address' | 'ip';

/**
 * The IP address to count a request under, or `null` for no per-IP limit. Outside production
 * a request without the header (local, tests) is not limited per IP. The header is checked
 * first because Better Auth's `getIP` answers 127.0.0.1 without it outside production, which
 * would put every local request in one bucket. In production a missing or unusable header
 * means the shared `UNKNOWN_IP` bucket.
 */
function clientIp(headers: Headers | undefined, production: boolean): string | null {
  const ip = headers?.has(CLIENT_IP_HEADER) ? getIP(headers, { advanced: clientIpOptions }) : null;
  return ip ?? (production ? UNKNOWN_IP : null);
}

/**
 * The rate limits of `POST /sign-in/code/request` (AC10), in Postgres so a deploy or restart
 * doesn't reset them. They run before the endpoint, so they hold whatever the endpoint goes on
 * to do (look the address up, send an email, work in the background). A limited request gets
 * the same answer as any other request (`REQUESTED`), sends nothing and replaces nothing. Better
 * Auth's own limiter answers 429, lives in memory and knows no addresses, so it is switched off
 * for this path (`rateLimit.customRules` in `auth.ts`).
 */
export function signInRateLimits({ db, secret, clock, log, production }: SignInRateLimitOptions) {
  /** Counts the request under `<name>:<keyed hash of value>`; true when it is over the rule. */
  async function overLimit(name: LimitName, value: string, rule: RateLimitRule, now: Date) {
    const key = `${name}:${hashSecretValue(secret, `rate-limit-${name}`, value)}`;
    const { allowed } = await consumeRateLimit(db, key, rule, now);
    return !allowed;
  }

  return {
    id: 'sign-in-rate-limits',
    hooks: {
      before: [
        {
          matcher: (context) => context.path === REQUEST_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const now = clock.now();
            const limited: LimitName[] = [];

            const body = ctx.body as { email?: unknown } | undefined;
            const email = emailSchema.safeParse(body?.email);
            if (email.success && (await overLimit('address', email.data, ADDRESS_LIMIT, now))) {
              limited.push('address');
            }

            const ip = clientIp(ctx.headers, production);
            if (ip && (await overLimit('ip', ip, IP_LIMIT, now))) limited.push('ip');

            await deleteExpiredRateLimits(db, now);
            if (limited.length === 0) return;
            log(`Sign-in request rate-limited: ${limited.join(', ')}`);
            return ctx.json(REQUESTED);
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
