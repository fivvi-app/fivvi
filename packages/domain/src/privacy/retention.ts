import { localDateOf, localDayBounds } from '../scheduling/zoned-time.ts';
import { WORKSPACE_DEFAULTS } from '../workspaces/defaults.ts';

/**
 * How long something is kept (E014, `docs/legal/retention-policy.md` §2). Hours and days are
 * counted as 24 hours of UTC time, so a change of the clocks moves nothing; months are calendar
 * months in UTC; the year after year end is the workspace's calendar year (the tax rule counts
 * whole years).
 */
export type RetentionPeriod =
  | { readonly unit: 'hours'; readonly amount: number }
  | { readonly unit: 'days'; readonly amount: number }
  | { readonly unit: 'months'; readonly amount: number }
  | { readonly unit: 'years-after-year-end'; readonly amount: number };

/**
 * Every period of `retention-policy.md` §2 that Fivvi enforces, by name. Changing one is a
 * one-line change here; the daily retention tasks, the registry and `PRIVACY.md` read it.
 */
export const RETENTION = {
  /** R2: a sign-in link or code, 24 hours after it expired or was used. */
  SIGN_IN_TOKEN_AFTER_EXPIRY: { unit: 'hours', amount: 24 },
  /** R3: a trainer invitation, 30 days after it expired, was withdrawn or accepted. */
  TRAINER_INVITATION_AFTER_CLOSING: { unit: 'days', amount: 30 },
  /** R6: a deleted client stays restorable in the trash. */
  TRASH: { unit: 'days', amount: 30 },
  /** R5: the Owner reviews a client this long after the last activity. */
  CLIENT_REVIEW_AFTER_INACTIVITY: { unit: 'months', amount: 24 },
  /** R5: the Owner has this long to answer the review before the client goes to the trash. */
  REVIEW_ANSWER: { unit: 'days', amount: 30 },
  /** R10: an account without sign-in, booking or team membership gets the warning email. */
  ACCOUNT_INACTIVITY: { unit: 'months', amount: 24 },
  /** R10: the warning email is followed by deletion this long after. */
  ACCOUNT_WARNING: { unit: 'days', amount: 30 },
  /** R10: a sign-in session, this long after it was last used. */
  SIGN_IN_SESSION_AFTER_LAST_USE: { unit: 'days', amount: 30 },
  /** R9: a departed trainer's name on past sessions becomes "Former trainer". */
  FORMER_TRAINER: { unit: 'months', amount: 24 },
  /** R12: an access-log entry. */
  ACCESS_LOG: { unit: 'months', amount: 12 },
  /** R14: a rate-limit row. */
  RATE_LIMIT: { unit: 'hours', amount: 24 },
  /** §3.5: a deletion-log entry, which a restore re-applies. */
  DELETION_LOG: { unit: 'days', amount: 30 },
  /** R21: an invoice (and the payments it records), 7 years after the end of the year it was issued. */
  INVOICE: { unit: 'years-after-year-end', amount: 7 },
  /** R11: a terminated workspace's Owner can still export. */
  WORKSPACE_EXPORT_WINDOW: { unit: 'days', amount: 30 },
  /** R11: a terminated workspace is deleted from production. */
  WORKSPACE_PURGE: { unit: 'days', amount: 60 },
} as const satisfies Record<string, RetentionPeriod>;

export type RetentionKey = keyof typeof RETENTION;

/** For each period: its rule in `retention-policy.md` §2 and what the period is counted from (`PRIVACY.md`). */
export const RETENTION_BASIS: Readonly<Record<RetentionKey, { policy: string; from: string }>> = {
  SIGN_IN_TOKEN_AFTER_EXPIRY: {
    policy: 'R2',
    from: 'the sign-in link or code expired or was used',
  },
  TRAINER_INVITATION_AFTER_CLOSING: {
    policy: 'R3',
    from: 'the invitation expired, was withdrawn or was accepted',
  },
  TRASH: { policy: 'R6', from: 'the client was moved to the trash' },
  CLIENT_REVIEW_AFTER_INACTIVITY: { policy: 'R5', from: "the client's last activity" },
  REVIEW_ANSWER: { policy: 'R5', from: 'the Owner was asked to review the client' },
  ACCOUNT_INACTIVITY: {
    policy: 'R10',
    from: "the account's last sign-in, booking or team membership",
  },
  ACCOUNT_WARNING: { policy: 'R10', from: 'the warning email was sent' },
  SIGN_IN_SESSION_AFTER_LAST_USE: { policy: 'R10', from: 'the sign-in session was last used' },
  FORMER_TRAINER: { policy: 'R9', from: "the trainer's team membership ended" },
  ACCESS_LOG: { policy: 'R12', from: 'the entry was written' },
  RATE_LIMIT: { policy: 'R14', from: 'the row was written' },
  DELETION_LOG: { policy: '§3.5', from: 'the entry was written' },
  INVOICE: { policy: 'R21', from: 'the invoice was issued' },
  WORKSPACE_EXPORT_WINDOW: { policy: 'R11', from: 'the workspace was terminated' },
  WORKSPACE_PURGE: { policy: 'R11', from: 'the workspace was terminated' },
};

const HOUR_MS = 60 * 60 * 1000;

/** `from` plus whole calendar months in UTC; a day the target month lacks becomes its last day. */
function addMonthsUtc(from: Date, months: number): Date {
  const target = new Date(from.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const daysInMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), daysInMonth));
  return target;
}

/**
 * The instant a period that started at `from` ends. `timeZone` (default: the workspace default,
 * Europe/Amsterdam) only matters for `years-after-year-end`: the year an invoice was issued in is
 * the calendar year on the wall clock of that zone, and it ends at the first instant of the next
 * 1 January there.
 */
export function retentionEndsAt(
  from: Date,
  period: RetentionPeriod,
  timeZone: string = WORKSPACE_DEFAULTS.timeZone,
): Date {
  switch (period.unit) {
    case 'hours':
      return new Date(from.getTime() + period.amount * HOUR_MS);
    case 'days':
      return new Date(from.getTime() + period.amount * 24 * HOUR_MS);
    case 'months':
      return addMonthsUtc(from, period.amount);
    case 'years-after-year-end': {
      const year = Number(localDateOf(from, timeZone).slice(0, 4));
      const newYear = localDayBounds(`${year + 1 + period.amount}-01-01`, timeZone);
      if (!newYear) throw new RangeError(`No such date in ${timeZone}`);
      return newYear.start;
    }
  }
}

/** Whether a period that started at `from` is over at `now`: at its end, not a moment before. */
export function isRetentionOver(
  from: Date,
  period: RetentionPeriod,
  now: Date,
  timeZone: string = WORKSPACE_DEFAULTS.timeZone,
): boolean {
  return now.getTime() >= retentionEndsAt(from, period, timeZone).getTime();
}

/** A period in words for `PRIVACY.md`: `24 hours`, `30 days`, `7 years after the end of the year`. */
export function describeRetention(period: RetentionPeriod): string {
  const unit = period.unit === 'years-after-year-end' ? 'year' : period.unit.slice(0, -1);
  const counted = `${period.amount} ${period.amount === 1 ? unit : `${unit}s`}`;
  return period.unit === 'years-after-year-end' ? `${counted} after the end of the year` : counted;
}
