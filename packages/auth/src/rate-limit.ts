import { consumeRateLimit, type Database, type RateLimitRule } from '@fivvi/database';
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
 * The header that carries the client's IP address. Railway's edge proxy sets `X-Real-IP` to the
 * address it saw and replaces any value the client sent, so it is the one header that can't be
 * forged on Railway (https://docs.railway.com/networking/public-networking/specs-and-limits
 * names it for "identifying client's remote IP"). `X-Forwarded-For` is not trusted: clients can
 * put anything in it. Outside Railway (local, e2e) the client sends this header itself, which is
 * how a test picks its IP address (`TESTING.md §7.1`; the header choice is in `ENVIRONMENTS.md §7`).
 */
export const CLIENT_IP_HEADER = 'x-real-ip';

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
}

/**
 * The client IP address of a request, or `null` when the trusted header is missing or not an
 * address (no limit per IP then: not locally, and not for a request that did not come through
 * the proxy).
 */
function clientIp(headers: Headers | undefined): string | null {
  if (!headers?.has(CLIENT_IP_HEADER)) return null;
  return getIP(headers, { advanced: clientIpOptions });
}

/**
 * The rate limits of `POST /sign-in/code/request` (AC10), in Postgres so a deploy or restart
 * doesn't reset them. They run before the endpoint, so they hold whatever the endpoint goes on
 * to do (look the address up, send an email, work in the background). A limited request gets
 * the same answer as any other request (`REQUESTED`), sends nothing and replaces nothing. Better
 * Auth's own limiter answers 429, lives in memory and knows no addresses, so it is switched off
 * for this path (`rateLimit.customRules` in `auth.ts`).
 */
export function signInRateLimits({ db, secret, clock, log }: SignInRateLimitOptions) {
  return {
    id: 'sign-in-rate-limits',
    hooks: {
      before: [
        {
          matcher: (context) => context.path === REQUEST_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const now = clock.now();
            const limited: string[] = [];

            const body = ctx.body as { email?: unknown } | undefined;
            const email = emailSchema.safeParse(body?.email);
            if (email.success) {
              const key = `address:${hashSecretValue(secret, 'rate-limit-address', email.data)}`;
              const { allowed } = await consumeRateLimit(db, key, ADDRESS_LIMIT, now);
              if (!allowed) limited.push('address');
            }

            const ip = clientIp(ctx.headers);
            if (ip) {
              const key = `ip:${hashSecretValue(secret, 'rate-limit-ip', ip)}`;
              const { allowed } = await consumeRateLimit(db, key, IP_LIMIT, now);
              if (!allowed) limited.push('ip');
            }

            if (limited.length === 0) return;
            log(`Sign-in request rate-limited: ${limited.join(', ')}`);
            return ctx.json(REQUESTED);
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
