import { expandSeries } from './expand-series.ts';
import {
  horizonEnd,
  type SeriesFacts,
  type SeriesOccurrence,
  weekdayOf,
  weeklyRule,
} from './series-rule.ts';
import { localDateOf } from './zoned-time.ts';

// Repeating a class date every week (F022, spec #428): the rule is the weekday of the first date at
// its start, and the 12 weeks from that date are expanded here. Pure: the caller stores the result.

/** What the rules need to plan a weekly series, all read by the caller. */
export interface PlanWeeklySeriesFacts {
  /** The first date typed, in the workspace's time zone: `YYYY-MM-DD`. */
  readonly localDate: string;
  /** The start typed, in the workspace's time zone: `HH:mm`, 24 hours. */
  readonly localStart: string;
  readonly durationMinutes: number;
  readonly timeZone: string;
  /** From the caller's clock. */
  readonly now: Date;
}

export type PlanWeeklySeriesDecision =
  | {
      readonly outcome: 'planned';
      readonly facts: SeriesFacts;
      /** The first date and the 11 weeks after it. */
      readonly occurrences: readonly SeriesOccurrence[];
      /** The last day of the 12 weeks: where the calendar is filled to. */
      readonly materializedUntil: string;
    }
  | {
      readonly outcome: 'refused';
      readonly reason: /** The first date is before today: past dates are not made again (out of scope in #428). */
        | 'date-in-past'
        | 'invalid-date'
        | 'invalid-time'
        /** The start is in the hour the clocks skip on `date`, one of the 12. */
        | 'time-does-not-exist';
      readonly date?: string;
    };

/**
 * The weekly series for a first date: refuses, before anything is stored, a first date in the past,
 * a date or time that is none, and a start that the clocks skip on one of the 12 dates.
 */
export function planWeeklySeries(facts: PlanWeeklySeriesFacts): PlanWeeklySeriesDecision {
  if (facts.localDate < localDateOf(facts.now, facts.timeZone)) {
    return { outcome: 'refused', reason: 'date-in-past' };
  }
  const weekday = weekdayOf(facts.localDate);
  if (!weekday) return { outcome: 'refused', reason: 'invalid-date' };
  const series: SeriesFacts = {
    rrule: weeklyRule(weekday),
    localStartTime: facts.localStart,
    durationMinutes: facts.durationMinutes,
    timeZone: facts.timeZone,
    startsOn: facts.localDate,
    endsOn: null,
  };
  const materializedUntil = horizonEnd(facts.localDate);
  const expanded = expandSeries(series, facts.localDate, materializedUntil);
  if (expanded.outcome === 'refused') {
    // The rule is built here, so `invalid-rule` cannot happen.
    const reason = expanded.reason === 'invalid-rule' ? 'invalid-date' : expanded.reason;
    return {
      outcome: 'refused',
      reason,
      ...(expanded.date === undefined ? {} : { date: expanded.date }),
    };
  }
  return {
    outcome: 'planned',
    facts: series,
    occurrences: expanded.occurrences,
    materializedUntil,
  };
}
