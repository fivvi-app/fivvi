import { isIP } from 'node:net';
import {
  consumeRateLimit,
  type Database,
  deleteExpiredRateLimits,
  type RateLimitRule,
} from '@fivvi/database';
import { anonymousDistinctId, type ProductEvents } from '@fivvi/observability';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getIP } from 'better-auth/api';
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
 * Code exchanges of the apps (`POST /v1/sign-in/token`) per IP address. The web's
 * code step has Better Auth's own per-IP limiter, which only the HTTP router runs; the apps call
 * the endpoint through `auth.api`, which skips it, so this is the app's per-IP limit. It is
 * above what typing a code wrong a few times needs, and an address already dies after 5 wrong
 * codes (AC6); it stops one network from guessing at many addresses.
 */
export const TOKEN_IP_LIMIT: RateLimitRule = { max: 30, windowMinutes: 15 };

/** Where the client's IP address comes from, and why only this header: `ENVIRONMENTS.md §7`. */
export const CLIENT_IP_HEADER = 'x-real-ip';

/**
 * The IP bucket of a request that carries no usable client IP address when `requireClientIp`
 * is set, because the proxy always sets the header. Such a request did not come through the
 * proxy (or forged the header), so all of them share one limit instead of none. Real addresses
 * can't collide with it.
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

/**
 * The default of `requireClientIp`: `NODE_ENV=production`. That is every Railway environment
 * and e2e, not only the production environment (`ENVIRONMENTS.md §7`).
 */
export function defaultRequireClientIp(env: { NODE_ENV?: string } = process.env): boolean {
  return env.NODE_ENV === 'production';
}

export interface SignInRateLimitOptions {
  db: Database;
  /** `BETTER_AUTH_SECRET`: the key of the hashes in the stored limit keys. */
  secret: string;
  /** Where "now" comes from: it starts and ends the windows. */
  clock: Clock;
  /** Gets one line per limited request. It never holds an email address or an IP address. */
  log: (line: string) => void;
  /**
   * True when a proxy always sets the client IP header: a request without a usable one then
   * counts against one shared bucket. `ENVIRONMENTS.md §7` says where that holds.
   */
  requireClientIp: boolean;
}

export type LimitName =
  | 'join-ip'
  | 'join-account'
  | 'booking-account'
  | 'address'
  | 'ip'
  | 'token-ip'
  | 'change-account'
  | 'change-address'
  | 'change-ip'
  | 'change-confirm-ip';

/** Counts the request under `<name>:<keyed hash of value>`; true when it is over the rule. */
export async function isOverLimit(
  { db, secret }: Pick<SignInRateLimitOptions, 'db' | 'secret'>,
  name: LimitName,
  value: string,
  rule: RateLimitRule,
  now: Date,
) {
  const key = `${name}:${hashSecretValue(secret, `rate-limit-${name}`, value)}`;
  const { allowed } = await consumeRateLimit(db, key, rule, now);
  return !allowed;
}

/**
 * The IP address to count a request under, or `null` for no per-IP limit. A missing or invalid
 * header (not an IP address, or several) is "no usable client IP": with `requireClientIp` it
 * means the shared `UNKNOWN_IP` bucket, otherwise (local, tests) no per-IP limit. The header is
 * checked first because Better Auth's `getIP` answers 127.0.0.1 for a missing or invalid one
 * outside production, which would put every such request in one bucket.
 */
export function clientIp(headers: Headers | undefined, requireClientIp: boolean): string | null {
  const value = headers?.get(CLIENT_IP_HEADER)?.trim();
  const ip =
    headers && value && isIP(value) !== 0 ? getIP(headers, { advanced: clientIpOptions }) : null;
  return ip ?? (requireClientIp ? UNKNOWN_IP : null);
}

/**
 * The client's IP address exactly as the proxy sent it, or `null` when the request has no usable
 * one (no proxy header, not an IP address, several): for Cloudflare's `remoteip`, which is
 * optional. Unlike the rate-limit keys it is not grouped: an IPv6 address stays the client's own,
 * not the /64 network address that sign-in counts it under.
 */
export function usableClientIp(headers: Headers): string | null {
  const value = headers.get(CLIENT_IP_HEADER)?.trim();
  return value && isIP(value) !== 0 ? value : null;
}

/**
 * The key of the client's IP address for the rate limit of another public route (the demo form,
 * F064): a keyed hash (the address cannot be read back from the counter table, nor tried without
 * the secret), IPv6 grouped by /64 like the sign-in limits, with its own purpose. `null` for no
 * usable address when no proxy is in front (`requireClientIp` false): no per-address limit.
 */
export function clientAddressKey(
  secret: string,
  headers: Headers,
  requireClientIp: boolean,
): string | null {
  const ip = clientIp(headers, requireClientIp);
  return ip === null ? null : hashSecretValue(secret, 'rate-limit-demo-ip', ip);
}

/**
 * The platform a sign-in request came from, for `public_request_refused`. A request that came
 * through Better Auth's HTTP router is the web's; the apps' routes call `auth.api` directly, with
 * no `Request` behind the call (`ctx.request`), and name themselves by their user agent only: the
 * Android app's HTTP stack (okhttp) or Android itself, else the iOS app. It labels an event and
 * nothing else, so a client that lies about it gains nothing.
 */
export function platformOf(request: Request | undefined, headers: Headers | undefined) {
  if (request) return 'web';
  return /android|okhttp/i.test(headers?.get('user-agent') ?? '') ? 'android' : 'ios';
}

/** The body a request over the IP limit answers with: `RateLimited` of the OpenAPI contract. */
export const RATE_LIMITED_BODY = { code: 'rate_limited' } as const;

/**
 * The rate limits of `POST /sign-in/code/request` (AC10, E013 AC4), in Postgres so a deploy or
 * restart doesn't reset them. They run before the endpoint, so they hold whatever the endpoint
 * goes on to do (look the address up, send an email, work in the background), for an address with
 * an account and one without alike. An address over its limit gets the same answer as any other
 * request (`REQUESTED`: no enumeration), sends nothing and replaces nothing. A client IP address
 * over its limit gets 429 `rate_limited`, also nothing sent or replaced: that answer is about the
 * caller's own network, so it tells nothing about any address. Every refusal records
 * `public_request_refused` with the rule and the platform. Better Auth's own limiter answers 429,
 * lives in memory and knows no addresses, so it is switched off for this path
 * (`rateLimit.customRules` in `auth.ts`).
 */
export function signInRateLimits({
  db,
  secret,
  clock,
  log,
  requireClientIp,
  productEvents,
}: SignInRateLimitOptions & { productEvents?: ProductEvents }) {
  const store = { db, secret };

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
            if (
              email.success &&
              (await isOverLimit(store, 'address', email.data, ADDRESS_LIMIT, now))
            ) {
              limited.push('address');
            }

            const ip = clientIp(ctx.headers, requireClientIp);
            if (ip && (await isOverLimit(store, 'ip', ip, IP_LIMIT, now))) limited.push('ip');

            await deleteExpiredRateLimits(db, now);
            if (limited.length === 0) return;
            log(`Sign-in request rate-limited: ${limited.join(', ')}`);
            // One refusal, one event: the IP limit, which answers, outranks the address limit.
            const overIp = limited.includes('ip');
            productEvents?.track({
              event: 'public_request_refused',
              distinctId: anonymousDistinctId(),
              properties: {
                rule: overIp ? 'sign_in_ip' : 'sign_in_address',
                platform: platformOf(ctx.request, ctx.headers),
              },
            });
            if (overIp) throw new APIError('TOO_MANY_REQUESTS', RATE_LIMITED_BODY);
            return ctx.json(REQUESTED);
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

/**
 * The IP limit of the apps' code exchange (`TOKEN_IP_LIMIT`): counts one attempt and answers
 * whether the client IP address is over it. It counts before the code is looked at, so a
 * limited attempt never uses up or counts against a verification. Same IP rules as the request
 * limits (`clientIp`).
 */
export function signInTokenRateLimit({
  db,
  secret,
  clock,
  log,
  requireClientIp,
}: SignInRateLimitOptions): (headers: Headers) => Promise<boolean> {
  return async (headers) => {
    const now = clock.now();
    const ip = clientIp(headers, requireClientIp);
    const limited =
      ip !== null && (await isOverLimit({ db, secret }, 'token-ip', ip, TOKEN_IP_LIMIT, now));
    await deleteExpiredRateLimits(db, now);
    if (limited) log('Sign-in token exchange rate-limited: ip');
    return limited;
  };
}

/**
 * The limits of the email change (F005, spec #610), "as for sign-in": a request counts 3 in 15
 * minutes per account and per new address, and 20 an hour per IP address (the sign-in's numbers);
 * the code step counts per IP address like the apps' code exchange. A wrong code is limited by the
 * verification itself, which dies after `MAX_WRONG_CODES`.
 */
export interface EmailChangeRateLimits {
  /** Counts a request for a code and says whether it is over a limit: then nothing is sent. */
  requestLimited(input: {
    accountId: string;
    newEmail: string;
    headers: Headers;
  }): Promise<boolean>;
  /** Counts a try at a code and says whether this client IP address is over its limit. */
  confirmLimited(headers: Headers): Promise<boolean>;
}

export function emailChangeRateLimits({
  db,
  secret,
  clock,
  log,
  requireClientIp,
}: SignInRateLimitOptions): EmailChangeRateLimits {
  const store = { db, secret };
  return {
    async requestLimited({ accountId, newEmail, headers }) {
      const now = clock.now();
      const limited: LimitName[] = [];
      if (await isOverLimit(store, 'change-account', accountId, ADDRESS_LIMIT, now)) {
        limited.push('change-account');
      }
      if (await isOverLimit(store, 'change-address', newEmail, ADDRESS_LIMIT, now)) {
        limited.push('change-address');
      }
      const ip = clientIp(headers, requireClientIp);
      if (ip && (await isOverLimit(store, 'change-ip', ip, IP_LIMIT, now))) {
        limited.push('change-ip');
      }
      await deleteExpiredRateLimits(db, now);
      if (limited.length > 0) log(`Email change request rate-limited: ${limited.join(', ')}`);
      return limited.length > 0;
    },
    async confirmLimited(headers) {
      const now = clock.now();
      const ip = clientIp(headers, requireClientIp);
      const limited =
        ip !== null && (await isOverLimit(store, 'change-confirm-ip', ip, TOKEN_IP_LIMIT, now));
      await deleteExpiredRateLimits(db, now);
      if (limited) log('Email change code rate-limited: ip');
      return limited;
    },
  };
}
