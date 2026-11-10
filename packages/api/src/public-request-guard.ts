import { anonymousDistinctId, type ProductEvents } from '@fivvi/observability';
import { z } from '@hono/zod-openapi';

// The public request guard (E013, spec #467): the one call that the public routes of M5 make, so
// F029 (join requests), F030 (open sign-up) and F031 (booking) need no rules of their own. It has
// no route and no screen. It checks the Turnstile token, counts the limits (Postgres, the
// existing rate-limit table, keyed hashes: `@fivvi/auth`), applies the caps on pending join
// requests, and answers a refusal a route returns as it is, or `null`. Every refusal records the
// product event `public_request_refused` with the rule and the platform and nothing else.
//
// A refusal is a machine-readable code, never text (a client picks its own words), and never says
// whether an account or a workspace exists: the join-request rules only know the caller's own
// requests. A code enters the OpenAPI contract with the first route that documents it.

/** Pending join requests of one account at one workspace (AC5): a second one waits. */
export const MAX_PENDING_JOIN_REQUESTS_PER_WORKSPACE = 1;

/** Pending join requests of one account in all workspaces (AC5). A decided request no longer counts. */
export const MAX_PENDING_JOIN_REQUESTS = 5;

// The refusal schemas, for routes to document next to `validationErrorResponse` and the like.

export const RateLimitedSchema = z
  .object({ code: z.enum(['rate_limited']) })
  // Not 'RateLimited': the address lookup registers that name with its own description, and
  // zod-openapi keeps the first one registered, so the contract would depend on the route order.
  .openapi('PublicRequestRateLimited', {
    description:
      'Too many requests from this network or this account in the last minutes or hour. Nothing ' +
      'was stored or sent. Contains no user-facing text.',
  });

export const TurnstileFailedSchema = z
  .object({ code: z.enum(['turnstile_failed']) })
  .openapi('TurnstileFailed', {
    description:
      'The bot check failed, or Cloudflare did not answer on a route that fails closed. Answered ' +
      'with `422`: the request is well formed, its Turnstile token is not acceptable (not `403`, ' +
      'which `forbidden` uses for a missing role). Nothing was stored or sent. Contains no ' +
      'user-facing text.',
  });

export const JoinRequestPendingSchema = z
  .object({ code: z.enum(['join_request_pending']) })
  .openapi('JoinRequestPending', {
    description:
      'The account already has a pending join request at this workspace; nothing changed. ' +
      'Contains no user-facing text.',
  });

export const JoinRequestsCappedSchema = z
  .object({ code: z.enum(['join_requests_capped']) })
  .openapi('JoinRequestsCapped', {
    description:
      'The account already has the most pending join requests it may have in all; nothing ' +
      'changed. Contains no user-facing text.',
  });

/** The status of each refusal. */
export const REFUSAL_STATUS = {
  rate_limited: 429,
  turnstile_failed: 422,
  join_request_pending: 409,
  join_requests_capped: 429,
} as const;

export type RefusalCode = keyof typeof REFUSAL_STATUS;

/** What a route returns for a refusal: `c.json(refusal.body, refusal.status)`. */
export type Refusal<Code extends RefusalCode = RefusalCode> = {
  [C in Code]: { status: (typeof REFUSAL_STATUS)[C]; body: { code: C } };
}[Code];

function refusal<Code extends RefusalCode>(code: Code): Refusal<Code> {
  return { status: REFUSAL_STATUS[code], body: { code } } as Refusal<Code>;
}

/** Where the request came from: the web, or one of the apps (named by the app in its request). */
export type Platform = 'web' | 'ios' | 'android';

/** Which rule refused: the `rule` of the event. Several rules answer with the same code. */
type Rule =
  | 'turnstile_failed'
  | 'turnstile_no_answer'
  | 'join_request_ip'
  | 'join_request_account'
  | 'join_request_pending'
  | 'join_requests_capped'
  | 'booking_churn';

/** What the guard needs from the outside world; `ApiDependencies` has all of it. */
export interface PublicRequestGuardDependencies {
  /**
   * Asks Cloudflare whether the Turnstile token is good, with the client IP address of the request
   * (`@fivvi/auth`'s `createTurnstileVerifier`). `no_answer`: Cloudflare did not answer in 3 s.
   */
  verifyTurnstile(
    token: string | undefined,
    headers: Headers,
  ): Promise<'pass' | 'fail' | 'no_answer'>;
  /**
   * The counters (`@fivvi/auth`'s `createPublicRequestLimits`): each counts one request and says
   * whether it is over its limit.
   */
  publicRequestLimits: {
    joinRequestFromIp(headers: Headers): Promise<boolean>;
    joinRequestFromAccount(accountId: string): Promise<boolean>;
    bookingAction(accountId: string): Promise<boolean>;
  };
  productEvents: ProductEvents;
}

export interface PublicRequestGuard {
  /**
   * The bot check of a web form. `onNoAnswer`: what to do when Cloudflare does not answer: `open`
   * lets the request through (the sign-in request: the rate limits still hold), `closed` refuses
   * it with `turnstile_failed` (the join request). Call it before anything else of the request.
   */
  checkTurnstile(input: {
    token: string | undefined;
    headers: Headers;
    platform: Platform;
    onNoAnswer: 'open' | 'closed';
  }): Promise<Refusal<'turnstile_failed'> | null>;
  /**
   * The rules of one join request, in order: the limits per IP address and per account (both
   * count the request, whatever the other answers), then the caps on pending requests. `pending`
   * is what the caller counts in its own records, pending requests only: those of this account at
   * the workspace asked for, and in all. A decided request no longer counts. Nothing here looks
   * at the workspace, so the answer never says whether one exists.
   */
  checkJoinRequest(input: {
    headers: Headers;
    accountId: string;
    platform: Platform;
    pending: { inWorkspace: number; inAll: number };
  }): Promise<Refusal<'rate_limited' | 'join_request_pending' | 'join_requests_capped'> | null>;
  /** One book or cancel action of an account, across any classes (the churn limit, AC7). */
  checkBookingAction(input: {
    accountId: string;
    platform: Platform;
  }): Promise<Refusal<'rate_limited'> | null>;
}

export function createPublicRequestGuard({
  verifyTurnstile,
  publicRequestLimits,
  productEvents,
}: PublicRequestGuardDependencies): PublicRequestGuard {
  /** Records the refusal: the rule and the platform, under a random ID that leads to nobody. */
  function refused<Code extends RefusalCode>(rule: Rule, platform: Platform, code: Code) {
    productEvents.track({
      event: 'public_request_refused',
      distinctId: anonymousDistinctId(),
      properties: { rule, platform },
    });
    return refusal(code);
  }

  return {
    async checkTurnstile({ token, headers, platform, onNoAnswer }) {
      const result = await verifyTurnstile(token, headers);
      if (result === 'pass') return null;
      if (result === 'no_answer') {
        if (onNoAnswer === 'open') return null;
        return refused('turnstile_no_answer', platform, 'turnstile_failed');
      }
      return refused('turnstile_failed', platform, 'turnstile_failed');
    },

    async checkJoinRequest({ headers, accountId, platform, pending }) {
      // Both counters count the request, so a flood from one network also uses up its accounts.
      const overIp = await publicRequestLimits.joinRequestFromIp(headers);
      const overAccount = await publicRequestLimits.joinRequestFromAccount(accountId);
      if (overIp) return refused('join_request_ip', platform, 'rate_limited');
      if (overAccount) return refused('join_request_account', platform, 'rate_limited');
      if (pending.inWorkspace >= MAX_PENDING_JOIN_REQUESTS_PER_WORKSPACE) {
        return refused('join_request_pending', platform, 'join_request_pending');
      }
      if (pending.inAll >= MAX_PENDING_JOIN_REQUESTS) {
        return refused('join_requests_capped', platform, 'join_requests_capped');
      }
      return null;
    },

    async checkBookingAction({ accountId, platform }) {
      if (await publicRequestLimits.bookingAction(accountId)) {
        return refused('booking_churn', platform, 'rate_limited');
      }
      return null;
    },
  };
}
