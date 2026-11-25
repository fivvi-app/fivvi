// Module: Part of the module described in `series-rule.ts` (same folder).
// Spec: F022 AC5

import {
  type ApplyFollowingDecision,
  applyThisAndFollowing,
  countKeptDates,
  type SeriesChange,
  type SeriesDate,
  type SeriesState,
} from './apply-following.ts';
import { localDateOf } from './zoned-time.ts';

// Editing a whole series (F022, CO-04): the Owner changes the series, not one of its dates. The
// change applies from the first date that has not started, and the dates before it stay as they
// are. Everything else is `applyThisAndFollowing`'s: dates changed on their own keep their changes
// and are counted, the series is split where the change starts, and a refusal changes nothing.
// Pure: the caller reads the dates and writes the decision.

export type ApplyToSeriesDecision =
  | ApplyFollowingDecision
  | {
      readonly outcome: 'refused';
      /** Every date of the series has started or was cancelled: there is nothing to change. */
      readonly reason: 'no-upcoming-dates';
    }
  | {
      readonly outcome: 'unchanged';
      /** The dates from the first one that has not started on that keep their own changes. */
      readonly keptDates: number;
    };

/** Whether the change gives the series something it does not have already. */
function differsFrom(series: SeriesState, change: SeriesChange): boolean {
  return (
    (change.localStartTime !== undefined && change.localStartTime !== series.localStartTime) ||
    (change.durationMinutes !== undefined && change.durationMinutes !== series.durationMinutes) ||
    (change.capacity !== undefined && change.capacity !== series.capacity) ||
    (change.level !== undefined && change.level !== series.level) ||
    (change.trainerProfileId !== undefined && change.trainerProfileId !== series.trainerProfileId)
  );
}

/**
 * Applies `change` to the series from its first date that has not started at `now` (a date that
 * is running has started; a cancelled date is passed over). `today` is `now` as a local date.
 * Refuses, changing nothing, for what `applyThisAndFollowing` refuses, and when the series has no
 * such date. A change that leaves every field as the series has it is `unchanged`: it splits
 * nothing and writes nothing.
 */
export function applyToUpcomingDates(
  series: SeriesState,
  change: SeriesChange,
  existing: readonly SeriesDate[],
  now: Date,
  today: string = localDateOf(now, series.timeZone),
): ApplyToSeriesDecision {
  const first = existing
    .filter((date) => !date.cancelled && date.startsAt.getTime() > now.getTime())
    .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))[0];
  if (!first) return { outcome: 'refused', reason: 'no-upcoming-dates' };
  if (!differsFrom(series, change)) {
    return {
      outcome: 'unchanged',
      keptDates: countKeptDates(existing, first.occurrenceDate, { fromDateIsAsked: false }),
    };
  }
  return applyThisAndFollowing(series, first.occurrenceDate, change, existing, today, {
    fromDateIsAsked: false,
  });
}
