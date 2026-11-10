import { authRateLimits, createDatabase, type DatabaseClient } from '@fivvi/database';
import { manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BOOKING_CHURN_LIMIT,
  createPublicRequestLimits,
  JOIN_REQUEST_ACCOUNT_LIMIT,
  JOIN_REQUEST_IP_LIMIT,
} from '../src/public-request-limits.ts';

// E013 (spec #467, ticket #711), AC5 to AC7 and AC12: the counters of the public request guard, in
// a real Postgres, with a manual clock. Synthetic data only: Mark Jansen's account, test IPs.

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
const MARK = '0197c0de-0000-7000-8000-00000000a001';
const ANNA = '0197c0de-0000-7000-8000-00000000a002';
const IP = '192.0.2.10';
const ipHeaders = (ip: string | undefined) => new Headers(ip ? { 'x-real-ip': ip } : {});

describe('E013 the counters of the public request guard', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  const clock = manualClock('2026-11-10T10:00:00Z');
  const logged: string[] = [];

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
    logged.length = 0;
  });

  const limits = (requireClientIp = true) =>
    createPublicRequestLimits({
      db: client.db,
      secret: SECRET,
      clock,
      log: (line) => logged.push(line),
      requireClientIp,
    });

  it('AC12: every limit is a named constant', () => {
    expect(JOIN_REQUEST_IP_LIMIT).toEqual({ max: 10, windowMinutes: 60 });
    expect(JOIN_REQUEST_ACCOUNT_LIMIT).toEqual({ max: 5, windowMinutes: 60 });
    expect(BOOKING_CHURN_LIMIT).toEqual({ max: 20, windowMinutes: 10 });
  });

  it('AC6: the 11th join request from one IP within an hour is over the limit, from any accounts', async () => {
    const guard = limits();
    for (let request = 1; request <= 10; request++) {
      expect(await guard.joinRequestFromIp(ipHeaders(IP))).toBe(false);
    }

    expect(await guard.joinRequestFromIp(ipHeaders(IP))).toBe(true);
    expect(await guard.joinRequestFromIp(ipHeaders('192.0.2.11'))).toBe(false);
    expect(logged).toEqual(['Join request rate-limited: ip']);
  });

  it('AC6: an hour later the IP is allowed again', async () => {
    const guard = limits();
    for (let request = 1; request <= 11; request++) await guard.joinRequestFromIp(ipHeaders(IP));

    clock.advance({ minutes: 59 });
    expect(await guard.joinRequestFromIp(ipHeaders(IP))).toBe(true);
    clock.advance({ minutes: 1 });
    expect(await guard.joinRequestFromIp(ipHeaders(IP))).toBe(false);
  });

  it('AC6: a request with no usable IP shares one bucket behind the proxy and has no IP limit without one', async () => {
    const behindProxy = limits(true);
    for (let request = 1; request <= 10; request++) {
      expect(await behindProxy.joinRequestFromIp(ipHeaders(undefined))).toBe(false);
    }
    expect(await behindProxy.joinRequestFromIp(ipHeaders('not an address'))).toBe(true);

    const local = limits(false);
    for (let request = 1; request <= 12; request++) {
      expect(await local.joinRequestFromIp(ipHeaders(undefined))).toBe(false);
    }
  });

  it('AC6: the 6th join request from Mark’s account within an hour is over the limit', async () => {
    const guard = limits();
    for (let request = 1; request <= 5; request++) {
      expect(await guard.joinRequestFromAccount(MARK)).toBe(false);
    }

    expect(await guard.joinRequestFromAccount(MARK)).toBe(true);
    expect(await guard.joinRequestFromAccount(ANNA)).toBe(false);
    expect(logged).toEqual(['Join request rate-limited: account']);
  });

  it('AC7: Mark’s 21st book or cancel action within 10 minutes is over the limit; after the window it is allowed again', async () => {
    const guard = limits();
    for (let action = 1; action <= 20; action++) {
      expect(await guard.bookingAction(MARK)).toBe(false);
    }

    expect(await guard.bookingAction(MARK)).toBe(true);
    expect(await guard.bookingAction(ANNA)).toBe(false);
    clock.advance({ minutes: 9, seconds: 59 });
    expect(await guard.bookingAction(MARK)).toBe(true);
    clock.advance({ seconds: 1 });
    expect(await guard.bookingAction(MARK)).toBe(false);
    expect(logged).toContain('Booking action rate-limited: account');
  });

  it('keeps the three counters apart', async () => {
    const guard = limits();
    for (let request = 1; request <= 5; request++) await guard.joinRequestFromAccount(MARK);

    expect(await guard.joinRequestFromAccount(MARK)).toBe(true);
    expect(await guard.bookingAction(MARK)).toBe(false);
  });

  it('AC12: stores hashed keys in the rate-limit table: no IP address, account ID or email address', async () => {
    const guard = limits();
    await guard.joinRequestFromIp(ipHeaders(IP));
    await guard.joinRequestFromAccount(MARK);
    await guard.bookingAction(MARK);

    const keys = (await client.db.select({ key: authRateLimits.key }).from(authRateLimits)).map(
      (row) => row.key,
    );
    expect(keys).toHaveLength(3);
    expect(
      keys.every((key) => /^(join-ip|join-account|booking-account):[0-9a-f]{64}$/.test(key)),
    ).toBe(true);
    for (const key of keys) {
      expect(key).not.toContain('192.0.2');
      expect(key).not.toContain(MARK);
      expect(key).not.toContain('mark@example.com');
    }
  });

  it('clears the counters whose window has ended', async () => {
    const guard = limits();
    await guard.bookingAction(MARK);
    clock.advance({ minutes: 11 });
    await guard.joinRequestFromAccount(ANNA);

    const keys = (await client.db.select({ key: authRateLimits.key }).from(authRateLimits)).map(
      (row) => row.key,
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^join-account:/);
  });
});
