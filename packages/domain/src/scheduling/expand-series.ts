import {
  parseWeeklyRule,
  type SeriesFacts,
  type SeriesOccurrence,
  WEEKDAYS,
  type Weekday,
  weekdayOf,
} from './series-rule.ts';
import { addDays, wallClockToInstant } from './zoned-time.ts';

// The one place a rule becomes dates (F022, ADR-012): pure, no clock and no database. The local
// date and the wall-clock start of each week are turned into UTC instants one date at a time with
// `wallClockToInstant`, so 18:00 stays 18:00 in Amsterdam on both sides of the clocks changing.

const MINUTE_MS = 60_000;

export type ExpandSeriesRefusal =
  /** The rule is not `FREQ=WEEKLY;BYDAY=XX`. */
  | 'invalid-rule'
  | 'invalid-date'
  | 'invalid-time'
  /** The start does not exist on `date` because the clocks skip it (daylight saving time starts). */
  | 'time-does-not-exist';

/** The dates of a window, and the dates whose wall-clock start the clocks skip. */
export interface SeriesExpansion {
  readonly occurrences: readonly SeriesOccurrence[];
  /** Local dates (`YYYY-MM-DD`) of the rule with no start: the time falls in the hour the clocks skip. */
  readonly skipped: readonly string[];
}

export type ExpandedSeries =
  | { readonly outcome: 'expanded'; readonly occurrences: readonly SeriesOccurrence[] }
  | { readonly outcome: 'refused'; readonly reason: ExpandSeriesRefusal; readonly date?: string };

/**
 * The dates of the series between `from` and `to` (local dates, both included), clipped to the
 * series' own `startsOn` and `endsOn`. Dates that have no start (the skipped hour) are listed in
 * `skipped`; `expandSeries` refuses them, `materialize` leaves them out.
 */
export function expandEach(
  series: SeriesFacts,
  from: string,
  to: string,
): SeriesExpansion | Extract<ExpandedSeries, { outcome: 'refused' }> {
  const rule = parseWeeklyRule(series.rrule);
  if (!rule) return { outcome: 'refused', reason: 'invalid-rule' };
  if (!weekdayOf(from) || !weekdayOf(to) || !weekdayOf(series.startsOn)) {
    return { outcome: 'refused', reason: 'invalid-date' };
  }
  const first = from > series.startsOn ? from : series.startsOn;
  const last = series.endsOn !== null && series.endsOn < to ? series.endsOn : to;
  const firstWeekday = weekdayOf(first) as Weekday;
  const shift = (WEEKDAYS.indexOf(rule.weekday) - WEEKDAYS.indexOf(firstWeekday) + 7) % 7;

  const occurrences: SeriesOccurrence[] = [];
  const skipped: string[] = [];
  for (let date = addDays(first, shift); date <= last; date = addDays(date, 7)) {
    const start = wallClockToInstant(date, series.localStartTime, series.timeZone);
    if (start.outcome === 'invalid') {
      return {
        outcome: 'refused',
        reason: start.field === 'date' ? 'invalid-date' : 'invalid-time',
      };
    }
    if (start.outcome === 'does-not-exist') {
      skipped.push(date);
      continue;
    }
    occurrences.push({
      occurrenceDate: date,
      startsAt: start.instant,
      // Elapsed time, not wall-clock time: a class over the night the clocks change is as long as it says.
      endsAt: new Date(start.instant.getTime() + series.durationMinutes * MINUTE_MS),
      repeatedStart: start.repeated,
    });
  }
  return { occurrences, skipped };
}

/**
 * Expands a weekly series into its dates between `from` and `to`: the local date in the rule and
 * the UTC start and end of each. A rule other than weekly on one weekday, or a date or time that is
 * none, is refused; so is a window with a date at a time the clocks skip (`time-does-not-exist`,
 * with the first such `date`), which is how saving a series at 02:30 on a Sunday is refused.
 */
export function expandSeries(series: SeriesFacts, from: string, to: string): ExpandedSeries {
  const expansion = expandEach(series, from, to);
  if ('outcome' in expansion) return expansion;
  const [date] = expansion.skipped;
  if (date !== undefined) return { outcome: 'refused', reason: 'time-does-not-exist', date };
  return { outcome: 'expanded', occurrences: expansion.occurrences };
}
