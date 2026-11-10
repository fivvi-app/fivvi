import { describe, expect, it } from 'vitest';
import {
  isRetentionOver,
  RETENTION,
  RETENTION_BASIS,
  type RetentionKey,
  retentionEndsAt,
} from './retention.ts';

const at = (iso: string) => new Date(iso);

/** The boundary of one period: still running 1 ms before the end, over at the end. */
function expectBoundary(key: RetentionKey, from: Date, end: Date, timeZone?: string) {
  const period = RETENTION[key];
  expect(retentionEndsAt(from, period, timeZone).toISOString()).toBe(end.toISOString());
  expect(isRetentionOver(from, period, new Date(end.getTime() - 1), timeZone)).toBe(false);
  expect(isRetentionOver(from, period, end, timeZone)).toBe(true);
}

describe('E014 AC2: every retention period is a named constant', () => {
  it('names every period of retention-policy.md §2 that Fivvi enforces, with its length', () => {
    expect(RETENTION).toEqual({
      SIGN_IN_TOKEN_AFTER_EXPIRY: { unit: 'hours', amount: 24 },
      TRAINER_INVITATION_AFTER_CLOSING: { unit: 'days', amount: 30 },
      TRASH: { unit: 'days', amount: 30 },
      CLIENT_REVIEW_AFTER_INACTIVITY: { unit: 'months', amount: 24 },
      REVIEW_ANSWER: { unit: 'days', amount: 30 },
      ACCOUNT_INACTIVITY: { unit: 'months', amount: 24 },
      ACCOUNT_WARNING: { unit: 'days', amount: 30 },
      SIGN_IN_SESSION_AFTER_LAST_USE: { unit: 'days', amount: 30 },
      FORMER_TRAINER: { unit: 'months', amount: 24 },
      ACCESS_LOG: { unit: 'months', amount: 12 },
      RATE_LIMIT: { unit: 'hours', amount: 24 },
      DELETION_LOG: { unit: 'days', amount: 30 },
      INVOICE: { unit: 'years-after-year-end', amount: 7 },
      WORKSPACE_EXPORT_WINDOW: { unit: 'days', amount: 30 },
      WORKSPACE_PURGE: { unit: 'days', amount: 60 },
    });
  });

  it('says for each period which rule of the policy it is and what it counts from', () => {
    expect(Object.keys(RETENTION_BASIS).sort()).toEqual(Object.keys(RETENTION).sort());
    for (const basis of Object.values(RETENTION_BASIS)) {
      expect(basis.policy).toMatch(/^(R\d+|§\d+\.\d+)$/);
      expect(basis.from).not.toBe('');
    }
  });

  it('ends a sign-in token 24 hours after it expired, at the instant and not a day on the wall clock', () => {
    expectBoundary(
      'SIGN_IN_TOKEN_AFTER_EXPIRY',
      at('2026-03-28T12:00:00.000Z'),
      at('2026-03-29T12:00:00.000Z'),
    );
  });

  it('counts a rate limit row for 24 hours', () => {
    expectBoundary('RATE_LIMIT', at('2026-10-24T08:30:00.000Z'), at('2026-10-25T08:30:00.000Z'));
  });

  it('counts days as 24 hours in UTC, so a change of the clocks moves nothing', () => {
    // 30 days from 10 March 2026 cross the change to summer time (29 March, Europe/Amsterdam).
    expectBoundary('TRASH', at('2026-03-10T23:30:00.000Z'), at('2026-04-09T23:30:00.000Z'));
    // 30 days from 10 October 2026 cross the change back to winter time (25 October).
    expectBoundary('DELETION_LOG', at('2026-10-10T00:00:00.000Z'), at('2026-11-09T00:00:00.000Z'));
    expectBoundary(
      'TRAINER_INVITATION_AFTER_CLOSING',
      at('2026-10-01T10:00:00.000Z'),
      at('2026-10-31T10:00:00.000Z'),
    );
    expectBoundary('REVIEW_ANSWER', at('2026-02-15T09:00:00.000Z'), at('2026-03-17T09:00:00.000Z'));
    expectBoundary(
      'ACCOUNT_WARNING',
      at('2026-03-01T09:00:00.000Z'),
      at('2026-03-31T09:00:00.000Z'),
    );
    expectBoundary(
      'SIGN_IN_SESSION_AFTER_LAST_USE',
      at('2026-03-01T09:00:00.000Z'),
      at('2026-03-31T09:00:00.000Z'),
    );
    expectBoundary(
      'WORKSPACE_EXPORT_WINDOW',
      at('2026-03-01T09:00:00.000Z'),
      at('2026-03-31T09:00:00.000Z'),
    );
    expectBoundary(
      'WORKSPACE_PURGE',
      at('2026-09-01T09:00:00.000Z'),
      at('2026-10-31T09:00:00.000Z'),
    );
  });

  it('counts months on the calendar in UTC and keeps the time of day', () => {
    expectBoundary(
      'CLIENT_REVIEW_AFTER_INACTIVITY',
      at('2024-10-31T22:15:00.000Z'),
      at('2026-10-31T22:15:00.000Z'),
    );
    expectBoundary(
      'ACCOUNT_INACTIVITY',
      at('2024-03-30T01:00:00.000Z'),
      at('2026-03-30T01:00:00.000Z'),
    );
    expectBoundary(
      'FORMER_TRAINER',
      at('2025-01-15T12:00:00.000Z'),
      at('2027-01-15T12:00:00.000Z'),
    );
    expectBoundary('ACCESS_LOG', at('2025-11-10T08:00:00.000Z'), at('2026-11-10T08:00:00.000Z'));
  });

  it('ends a month period on the last day of a shorter month', () => {
    expectBoundary('ACCESS_LOG', at('2025-02-28T08:00:00.000Z'), at('2026-02-28T08:00:00.000Z'));
    // 29 February 2024 plus 24 months: February 2026 has 28 days.
    expectBoundary(
      'ACCOUNT_INACTIVITY',
      at('2024-02-29T08:00:00.000Z'),
      at('2026-02-28T08:00:00.000Z'),
    );
    // 29 February 2024 plus 12 months is 28 February 2025.
    expect(
      retentionEndsAt(at('2024-02-29T00:00:00.000Z'), RETENTION.ACCESS_LOG).toISOString(),
    ).toBe('2025-02-28T00:00:00.000Z');
  });

  it('ends an invoice 7 years after the end of the year it was issued in Europe/Amsterdam', () => {
    // Issued 15 June 2026: the year ends 1 January 2027 00:00 Amsterdam (23:00 UTC on 31 December).
    expectBoundary(
      'INVOICE',
      at('2026-06-15T10:00:00.000Z'),
      at('2033-12-31T23:00:00.000Z'),
      'Europe/Amsterdam',
    );
  });

  it('puts an invoice issued around midnight on 1 January in the year of the workspace zone', () => {
    // 23:59 Amsterdam on 31 December 2026 is still 2026; 00:00 on 1 January 2027 is 2027.
    expectBoundary('INVOICE', at('2026-12-31T22:59:00.000Z'), at('2033-12-31T23:00:00.000Z'));
    expectBoundary('INVOICE', at('2026-12-31T23:00:00.000Z'), at('2034-12-31T23:00:00.000Z'));
  });

  it('follows the zone it is given for the year of an invoice', () => {
    // 23:30 UTC on 31 December is already 1 January in Amsterdam but still 2026 in UTC.
    expect(
      retentionEndsAt(at('2026-12-31T23:30:00.000Z'), RETENTION.INVOICE, 'UTC').toISOString(),
    ).toBe('2034-01-01T00:00:00.000Z');
  });
});
