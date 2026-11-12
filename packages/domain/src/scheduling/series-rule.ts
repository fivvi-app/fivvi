import { addDays } from './zoned-time.ts';

// The weekly rule of a class series (F022, spec #428, ADR-012). M4 knows one rule only: every week
// on one weekday, written as an RRULE in wall-clock time (`FREQ=WEEKLY;BYDAY=TU`). The parser
// refuses anything else, so a richer rule later is additive. Expansion of a rule into dates is
// done here and nowhere else (`expandSeries`): neither the web nor the apps expand a rule.

/** How far ahead the calendar is kept filled: 12 weeks (ADR-012). */
export const SERIES_HORIZON_WEEKS = 12;

/** The weekdays as RRULE writes them, Monday first. */
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const WEEKLY_RULE = /^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The rule "every week on `weekday`". */
export function weeklyRule(weekday: Weekday): string {
  return `FREQ=WEEKLY;BYDAY=${weekday}`;
}

/** The weekday of a weekly rule; `undefined` for any other rule (an interval, a count, two weekdays, a typo). */
export function parseWeeklyRule(rrule: string): { readonly weekday: Weekday } | undefined {
  const match = WEEKLY_RULE.exec(rrule);
  return match ? { weekday: match[1] as Weekday } : undefined;
}

/** The weekday of a calendar date (`YYYY-MM-DD`); `undefined` when it is none. */
export function weekdayOf(date: string): Weekday | undefined {
  const day = DATE.exec(date);
  if (!day) return undefined;
  const [year, month, dayOfMonth] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const utc = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== dayOfMonth) return undefined;
  // `getUTCDay`: Sunday is 0.
  return WEEKDAYS[(utc.getUTCDay() + 6) % 7];
}

/**
 * The last day of the horizon that starts on `from`: 12 weeks, so a series that has a date on
 * `from` has 12 dates in it (6 October to 22 December 2026 for a Tuesday series).
 */
export function horizonEnd(from: string): string {
  return addDays(from, SERIES_HORIZON_WEEKS * 7 - 1);
}

/** What the rules need to know of a series to expand it: the rule in wall-clock time and the zone. */
export interface SeriesFacts {
  /** `FREQ=WEEKLY;BYDAY=XX` (`weeklyRule`). */
  readonly rrule: string;
  /** The start on the wall clock: `HH:mm`, 24 hours. */
  readonly localStartTime: string;
  readonly durationMinutes: number;
  /** The IANA zone the rule is read in: the workspace's. */
  readonly timeZone: string;
  /** The first day the series may have a date on: `YYYY-MM-DD`. */
  readonly startsOn: string;
  /** The last day it may have one, `null` for a series that runs until it is stopped. */
  readonly endsOn: string | null;
}

/** One date of a series: the local date in the rule and the UTC instants the wall clock gives. */
export interface SeriesOccurrence {
  /** `YYYY-MM-DD` in the series' zone: what `sessions.occurrence_date` holds. */
  readonly occurrenceDate: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The start happens twice (the clocks went back); the first one, summer time, was taken. */
  readonly repeatedStart: boolean;
}
