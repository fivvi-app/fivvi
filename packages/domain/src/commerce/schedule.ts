// The agreement's own clock (F057, spec #481, ticket #911): when each amount is due and when the
// agreement ends. Pure rules over calendar dates (`YYYY-MM-DD`) in the workspace time zone; no I/O
// and no clock.
//
// Separate clocks (ADR-012): this file derives dates from the agreement alone and never imports
// scheduling (sessions, series, class times), not even its date helpers; the small ones below are
// this clock's own. `test/clocks.architecture.test.ts` fails on an import in either direction.

import { formattingLocales, type Locale } from '@fivvi/i18n';
import type { BillingCycle, EndOfTerm, ValidOffer } from './offers.ts';
import { translatorFor } from './translator.ts';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
/** Days between the due dates of an agreement billed every 4 weeks. */
const FOUR_WEEKS_DAYS = 28;

interface Ymd {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parse(date: string): Ymd {
  const found = DATE.exec(date);
  const [year, month, day] = [Number(found?.[1]), Number(found?.[2]), Number(found?.[3])];
  // `Date.UTC` rolls 30 February over to March; the round trip catches it.
  const rolled = new Date(Date.UTC(year, month - 1, day));
  if (
    !found ||
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${date}`);
  }
  return { year, month, day };
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The same day `months` later; a day the month does not have becomes its last day. */
function addMonths(date: string, months: number): string {
  const { year, month, day } = parse(date);
  const index = year * 12 + (month - 1) + months;
  const [targetYear, targetMonth] = [Math.floor(index / 12), (index % 12) + 1];
  const clamped = Math.min(day, daysInMonth(targetYear, targetMonth));
  return format(Date.UTC(targetYear, targetMonth - 1, clamped));
}

function addDays(date: string, days: number): string {
  const { year, month, day } = parse(date);
  return format(Date.UTC(year, month - 1, day) + days * DAY_MS);
}

/**
 * The last day of a period of `months` months that starts on `startsOn`: the day before the same
 * day `months` later, so 6 months from 1 February 2027 end on 31 July 2027. A start on a day the
 * last month does not have counts to the last day of that month first (31 January 2027 plus one
 * month is 28 February, so the period ends on 27 February).
 */
export function periodEnd(startsOn: string, months: number): string {
  return addDays(addMonths(startsOn, months), -1);
}

/**
 * The calendar date on the wall clock of `timeZone` at `instant` (default zone of a workspace:
 * `Europe/Amsterdam`). A clock change moves the hour, never the date.
 */
export function calendarDateIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return format(Date.UTC(part('year'), part('month') - 1, part('day')));
}

/** The terms of a recurring agreement that decide its dates, copied from its offer version. */
export interface AgreementClock {
  readonly kind: 'membership' | 'credit_plan';
  readonly startsOn: string;
  readonly billingCycle: BillingCycle;
  readonly endOfTerm: EndOfTerm;
  /**
   * The last day of the fixed term of a membership, or of the minimum term of a credit plan;
   * `null` for a credit plan without a minimum term.
   */
  readonly termEndsOn: string | null;
  /** The end set by notice or by the Owner, or `null` while none is set. */
  readonly endsOn: string | null;
}

/**
 * The clock of an agreement of `offer` that starts on `startsOn`. A credit pack and a single class
 * pass are paid once and have no schedule: `null`.
 */
export function agreementClock(offer: ValidOffer, startsOn: string): AgreementClock | null {
  parse(startsOn);
  switch (offer.kind) {
    case 'membership':
      return {
        kind: 'membership',
        startsOn,
        billingCycle: offer.billingCycle,
        endOfTerm: offer.endOfTerm,
        termEndsOn: periodEnd(startsOn, offer.termMonths),
        endsOn: null,
      };
    case 'credit_plan':
      return {
        kind: 'credit_plan',
        startsOn,
        billingCycle: offer.billingCycle,
        endOfTerm: offer.endOfTerm,
        termEndsOn:
          offer.minimumTermMonths > 0 ? periodEnd(startsOn, offer.minimumTermMonths) : null,
        endsOn: null,
      };
    default:
      return null;
  }
}

/** The day of the month a monthly agreement is due on (31 for a start on the 31st). */
export function anchorDay(clock: AgreementClock): number {
  return parse(clock.startsOn).day;
}

/**
 * *Stopt*: the end the agreement has without any notice, the end of its term. `null` for *Loopt
 * door* (it continues per cycle until notice) and for a stopping credit plan without a term.
 */
export function stopAtTermEnd(clock: AgreementClock): string | null {
  return clock.endOfTerm === 'stop' ? clock.termEndsOn : null;
}

/** The end that applies now: the earlier of the end set by notice or the Owner and the stop at the term end. */
export function effectiveEnd(clock: AgreementClock): string | null {
  const ends = [clock.endsOn, stopAtTermEnd(clock)].filter((end) => end !== null);
  return ends.length > 0 ? ends.reduce((a, b) => (a <= b ? a : b)) : null;
}

/** The nth due date after the start: the same day n months on, or n times 28 days on. */
function dueDateAt(clock: AgreementClock, n: number): string {
  return clock.billingCycle === 'month'
    ? addMonths(clock.startsOn, n)
    : addDays(clock.startsOn, FOUR_WEEKS_DAYS * n);
}

/**
 * The due dates from `from` to `to`, both included, oldest first. The start itself is not one: the
 * first payment covers it. Monthly agreements are due on the start day, a day the month does not
 * have becoming its last day, and never drift after a clamp; agreements every 4 weeks are due every
 * 28 days, on the weekday of the start. No due date falls on or after the agreement's end.
 */
export function dueDates(clock: AgreementClock, from: string, to: string): string[] {
  parse(from);
  parse(to);
  const end = effectiveEnd(clock);
  const dates: string[] = [];
  for (let n = 1; ; n += 1) {
    const date = dueDateAt(clock, n);
    if (date > to || (end !== null && date >= end)) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

export type NoticeEnd =
  /** Notice is possible and ends the agreement on `endsOn`. */
  | { readonly outcome: 'ends'; readonly endsOn: string }
  /** A fixed term that has not run out: notice is possible from `firstNoticeOn`, and then ends it on `endsOn`. */
  | { readonly outcome: 'not-yet'; readonly firstNoticeOn: string; readonly endsOn: string }
  /** The agreement stops at the end of its term (*Stopt*) on `endsOn`, so it needs no notice. */
  | { readonly outcome: 'not-needed'; readonly endsOn: string }
  /** Notice or the Owner already gave the agreement an end. */
  | { readonly outcome: 'already-ending'; readonly endsOn: string };

/**
 * What notice given on `noticeDate` does. The end is the later of one month from the notice date
 * (the day before the same day a month later) and the end of the minimum term of a credit plan.
 * The fixed term of a membership that continues per cycle can't be ended by notice before it has
 * run out: the first notice date is the day after the term and gives the end one month on.
 */
export function noticeEnd(clock: AgreementClock, noticeDate: string): NoticeEnd {
  parse(noticeDate);
  if (clock.endsOn !== null) return { outcome: 'already-ending', endsOn: clock.endsOn };
  // A stopping credit plan without a minimum term has no end of its own: it needs notice like any other.
  const stopsOn = stopAtTermEnd(clock);
  if (stopsOn !== null) return { outcome: 'not-needed', endsOn: stopsOn };
  if (clock.kind === 'membership' && clock.termEndsOn !== null && noticeDate <= clock.termEndsOn) {
    const firstNoticeOn = addDays(clock.termEndsOn, 1);
    return { outcome: 'not-yet', firstNoticeOn, endsOn: periodEnd(firstNoticeOn, 1) };
  }
  const afterOneMonth = periodEnd(noticeDate, 1);
  const minimumTermEnd = clock.kind === 'credit_plan' ? clock.termEndsOn : null;
  const endsOn =
    minimumTermEnd !== null && minimumTermEnd > afterOneMonth ? minimumTermEnd : afterOneMonth;
  return { outcome: 'ends', endsOn };
}

/**
 * The due day as the screens word it: "op de 1e" / "on the 1st". The wording is in the catalogs
 * (`agreements.dueDay.*`), the ordinal category comes from the language's rules.
 */
export function dueDayPhrase(day: number, locale: Locale): string {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError('A due day is a day of the month, 1 to 31');
  }
  const category = new Intl.PluralRules(formattingLocales[locale], { type: 'ordinal' }).select(day);
  const key = category === 'one' || category === 'two' || category === 'few' ? category : 'other';
  return translatorFor(locale)(`agreements.dueDay.${key}`, { day });
}
