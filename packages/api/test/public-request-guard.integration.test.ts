import {
  createPublicRequestLimits,
  createTurnstileVerifier,
  TURNSTILE_TEST_SECRET_FAIL,
  TURNSTILE_TEST_SECRET_PASS,
} from '@fivvi/auth';
import { authRateLimits, createDatabase, type DatabaseClient } from '@fivvi/database';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPublicRequestGuard,
  JoinRequestPendingSchema,
  JoinRequestsCappedSchema,
  MAX_PENDING_JOIN_REQUESTS,
  MAX_PENDING_JOIN_REQUESTS_PER_WORKSPACE,
  RateLimitedSchema,
  TurnstileFailedSchema,
} from '../src/public-request-guard.ts';

// E013 (spec #467, ticket #711): the public request guard F029, F030 and F031 call. Real Postgres
// for the counters, a fake Cloudflare for the check, a PostHog capture transport for the events.
// Synthetic data only: Mark Jansen (mark@example.com), the workspaces "John's Gym" and "Fit
// Studio", IP 192.0.2.10.

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const MARK = '0197c0de-0000-7000-8000-00000000a001';
const IP = '192.0.2.10';
const TOKEN = 'fake-turnstile-token-0001';
const headers = (ip = IP) => new Headers({ 'x-real-ip': ip });

describe('E013 the public request guard', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  const clock = manualClock('2026-11-10T10:00:00Z');
  let secretKey: string;
  let cloudflareAnswers: 'normal' | 'silent';
  let logged: string[];
  let reported: unknown[];

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    client = createDatabase({ url: database.url, maxConnections: 2 });
  });
  afterAll(async () => {
    await client?.close();
    await database?.drop();
  });
  beforeEach(async () => {
    await client.db.delete(authRateLimits);
    clock.set('2026-11-10T10:00:00Z');
    secretKey = TURNSTILE_TEST_SECRET_PASS;
    cloudflareAnswers = 'normal';
    logged = [];
    reported = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => {
        logged.push(args.map(String).join(' '));
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());

  const fakeCloudflare: typeof globalThis.fetch = (_input, init) => {
    if (cloudflareAnswers === 'silent') {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')));
      });
    }
    const success =
      new URLSearchParams(String(init?.body)).get('secret') === TURNSTILE_TEST_SECRET_PASS;
    return Promise.resolve(Response.json({ success, 'error-codes': [] }));
  };

  function setup() {
    const transport = createProductEventCaptureTransport();
    const errorReporter = createErrorReporter({ env: {} });
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport,
      errorReporter,
    });
    const guard = createPublicRequestGuard({
      verifyTurnstile: (token, requestHeaders) =>
        createTurnstileVerifier({
          secret: secretKey,
          fetch: fakeCloudflare,
          reportNoAnswer: (error) => reported.push(error),
          clock,
        }).verify(token, requestHeaders),
      publicRequestLimits: createPublicRequestLimits({
        db: client.db,
        secret: SECRET,
        clock,
        log: (line) => console.warn(line),
        requireClientIp: true,
      }),
      productEvents,
    });
    return { guard, productEvents, transport };
  }

  /** The properties PostHog got, without the SDK's own bookkeeping (`$lib`, `$geoip_disable`, …). */
  const own = (properties: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(properties).filter(([name]) => !name.startsWith('$')));

  const refusedEvents = async (setupResult: ReturnType<typeof setup>) => {
    await setupResult.productEvents.flush();
    return setupResult.transport.events.map((event) => ({
      event: event.event,
      properties: own(event.properties),
    }));
  };

  describe('the Turnstile check', () => {
    it('AC1: lets a good token through and refuses a failing one with turnstile_failed', async () => {
      const s = setup();
      expect(
        await s.guard.checkTurnstile({
          token: TOKEN,
          headers: headers(),
          platform: 'web',
          onNoAnswer: 'closed',
        }),
      ).toBeNull();

      secretKey = TURNSTILE_TEST_SECRET_FAIL;
      const refusal = await s.guard.checkTurnstile({
        token: TOKEN,
        headers: headers(),
        platform: 'web',
        onNoAnswer: 'closed',
      });
      expect(refusal).toEqual({ status: 422, body: { code: 'turnstile_failed' } });
    });

    it('AC10: with no answer within 3 seconds, sign-in is let through and a join request refused', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      cloudflareAnswers = 'silent';
      const s = setup();

      const open = s.guard.checkTurnstile({
        token: TOKEN,
        headers: headers(),
        platform: 'web',
        onNoAnswer: 'open',
      });
      await vi.advanceTimersByTimeAsync(3000);
      expect(await open).toBeNull();

      const closed = s.guard.checkTurnstile({
        token: TOKEN,
        headers: headers(),
        platform: 'web',
        onNoAnswer: 'closed',
      });
      await vi.advanceTimersByTimeAsync(3000);
      expect(await closed).toEqual({ status: 422, body: { code: 'turnstile_failed' } });
      vi.useRealTimers();

      expect(await refusedEvents(s)).toEqual([
        {
          event: 'public_request_refused',
          properties: { rule: 'turnstile_no_answer', platform: 'web' },
        },
      ]);
    });
  });

  describe('join requests', () => {
    const joinRequest = (
      s: ReturnType<typeof setup>,
      ip: string,
      account = MARK,
      pending = { inWorkspace: 0, inAll: 0 },
    ) =>
      s.guard.checkJoinRequest({
        headers: headers(ip),
        accountId: account,
        platform: 'web',
        pending,
      });

    it('AC6: the 11th join request from one IP within an hour is refused with rate_limited, from any accounts', async () => {
      const s = setup();
      for (let request = 1; request <= 10; request++) {
        const account = `0197c0de-0000-7000-8000-0000000b${String(request).padStart(4, '0')}`;
        expect(await joinRequest(s, IP, account)).toBeNull();
      }

      expect(await joinRequest(s, IP, '0197c0de-0000-7000-8000-0000000b9999')).toEqual({
        status: 429,
        body: { code: 'rate_limited' },
      });
      expect((await refusedEvents(s)).at(-1)).toEqual({
        event: 'public_request_refused',
        properties: { rule: 'join_request_ip', platform: 'web' },
      });
    });

    it('AC6: the 6th join request from Mark’s account within an hour is refused with rate_limited', async () => {
      const s = setup();
      for (let request = 1; request <= 5; request++) {
        expect(await joinRequest(s, `192.0.2.${request + 20}`)).toBeNull();
      }

      expect(await joinRequest(s, '192.0.2.99')).toEqual({
        status: 429,
        body: { code: 'rate_limited' },
      });
      expect((await refusedEvents(s)).at(-1)?.properties).toMatchObject({
        rule: 'join_request_account',
      });
    });

    it('AC5: with one pending request at John’s Gym, a second to John’s Gym is refused with join_request_pending', async () => {
      const s = setup();

      expect(await joinRequest(s, IP, MARK, { inWorkspace: 1, inAll: 1 })).toEqual({
        status: 409,
        body: { code: 'join_request_pending' },
      });
      // A request to another workspace is fine.
      expect(await joinRequest(s, IP, MARK, { inWorkspace: 0, inAll: 1 })).toBeNull();
    });

    it('AC5: with 5 pending requests in all, a sixth to another workspace is refused with join_requests_capped', async () => {
      const s = setup();

      expect(await joinRequest(s, IP, MARK, { inWorkspace: 0, inAll: 4 })).toBeNull();
      expect(await joinRequest(s, IP, MARK, { inWorkspace: 0, inAll: 5 })).toEqual({
        status: 429,
        body: { code: 'join_requests_capped' },
      });
    });

    it('AC5: a decided request no longer counts: the caller passes only the pending ones', async () => {
      const s = setup();
      // Mark had 5 pending; John’s Gym decided one, so 4 are pending and one more is allowed.
      expect(await joinRequest(s, IP, MARK, { inWorkspace: 0, inAll: 4 })).toBeNull();
    });

    it('AC5: the workspace rule wins when both hold', async () => {
      const s = setup();

      expect(await joinRequest(s, IP, MARK, { inWorkspace: 1, inAll: 5 })).toEqual({
        status: 409,
        body: { code: 'join_request_pending' },
      });
    });

    it('AC12: the caps are named constants', () => {
      expect(MAX_PENDING_JOIN_REQUESTS_PER_WORKSPACE).toBe(1);
      expect(MAX_PENDING_JOIN_REQUESTS).toBe(5);
    });
  });

  describe('booking churn', () => {
    it('AC7: Mark’s 21st book or cancel action within 10 minutes is refused with rate_limited; after the window it is allowed again', async () => {
      const s = setup();
      for (let action = 1; action <= 20; action++) {
        expect(await s.guard.checkBookingAction({ accountId: MARK, platform: 'ios' })).toBeNull();
      }

      expect(await s.guard.checkBookingAction({ accountId: MARK, platform: 'ios' })).toEqual({
        status: 429,
        body: { code: 'rate_limited' },
      });
      expect((await refusedEvents(s)).at(-1)).toEqual({
        event: 'public_request_refused',
        properties: { rule: 'booking_churn', platform: 'ios' },
      });

      clock.advance({ minutes: 10 });
      expect(await s.guard.checkBookingAction({ accountId: MARK, platform: 'ios' })).toBeNull();
    });
  });

  describe('the refusal event', () => {
    it('AC11: every refusal records public_request_refused with the rule and the platform only', async () => {
      const s = setup();
      secretKey = TURNSTILE_TEST_SECRET_FAIL;
      await s.guard.checkTurnstile({
        token: TOKEN,
        headers: headers(),
        platform: 'android',
        onNoAnswer: 'closed',
      });
      secretKey = TURNSTILE_TEST_SECRET_PASS;
      await s.guard.checkJoinRequest({
        headers: headers(),
        accountId: MARK,
        platform: 'web',
        pending: { inWorkspace: 1, inAll: 1 },
      });
      await s.guard.checkJoinRequest({
        headers: headers(),
        accountId: MARK,
        platform: 'ios',
        pending: { inWorkspace: 0, inAll: 5 },
      });

      await s.productEvents.flush();
      const events = s.transport.events;
      expect(events.map((event) => event.event)).toEqual([
        'public_request_refused',
        'public_request_refused',
        'public_request_refused',
      ]);
      expect(events.map((event) => own(event.properties))).toEqual([
        { rule: 'turnstile_failed', platform: 'android' },
        { rule: 'join_request_pending', platform: 'web' },
        { rule: 'join_requests_capped', platform: 'ios' },
      ]);
    });

    it('AC11: nothing sent to PostHog or written to a log holds the IP, the account ID, a token or a key', async () => {
      const s = setup();
      for (let request = 1; request <= 6; request++) {
        await s.guard.checkJoinRequest({
          headers: headers(),
          accountId: MARK,
          platform: 'web',
          pending: { inWorkspace: 0, inAll: 0 },
        });
      }
      secretKey = TURNSTILE_TEST_SECRET_FAIL;
      await s.guard.checkTurnstile({
        token: TOKEN,
        headers: headers(),
        platform: 'web',
        onNoAnswer: 'closed',
      });
      await s.productEvents.flush();

      const everything = JSON.stringify(s.transport.events) + logged.join('\n');
      for (const secret of [
        IP,
        MARK,
        TOKEN,
        TURNSTILE_TEST_SECRET_FAIL,
        'mark@example.com',
        'John',
        'Fit Studio',
      ]) {
        expect(everything).not.toContain(secret);
      }
      expect(s.transport.events.length).toBeGreaterThan(0);
      // The distinct ID is random for each event: nothing leads to the account.
      const ids = s.transport.events.map((event) => event.distinct_id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(MARK);
    });

    it('records nothing for a request that is allowed', async () => {
      const s = setup();
      await s.guard.checkTurnstile({
        token: TOKEN,
        headers: headers(),
        platform: 'web',
        onNoAnswer: 'closed',
      });
      await s.guard.checkBookingAction({ accountId: MARK, platform: 'web' });

      expect(await refusedEvents(s)).toEqual([]);
    });
  });

  describe('the refusal schemas', () => {
    it('exist for routes to document, with a machine-readable code and no user-facing text', () => {
      const cases = [
        [RateLimitedSchema, 'rate_limited'],
        [TurnstileFailedSchema, 'turnstile_failed'],
        [JoinRequestPendingSchema, 'join_request_pending'],
        [JoinRequestsCappedSchema, 'join_requests_capped'],
      ] as const;
      for (const [schema, code] of cases) {
        expect(schema.safeParse({ code }).success).toBe(true);
        expect(schema.safeParse({ code: 'other' }).success).toBe(false);
        expect(Object.keys(schema.shape)).toEqual(['code']);
      }
    });
  });
});
