import { expandEach } from './expand-series.ts';
import { GROUP_CLASS_LIMITS } from './group-class.ts';
import { horizonEnd, type SeriesFacts } from './series-rule.ts';
import { addDays } from './zoned-time.ts';

// "This and following classes" (F022, CO-04, ADR-012): the series changes from a date on. The
// series is split there (the earlier one ends the week before, a new one starts on the chosen
// date) and every date from there on takes the change, except dates the Owner changed one by one:
// those keep what they are (`detached_fields` of the date), so nothing the Owner did by hand is
// lost. Pure: the caller reads the dates and writes the decision.

/** What a date can differ in from its series: the fields `sessions.detached_fields` names. */
export const DETACHABLE_FIELDS = ['time', 'trainer', 'capacity', 'location'] as const;
export type DetachedField = (typeof DETACHABLE_FIELDS)[number];

/** A series as stored: the rule plus the defaults every new date copies. */
export interface SeriesState extends SeriesFacts {
  /** The usual trainer of the series' dates; `null`: *Trainer nodig*. */
  readonly trainerProfileId: string | null;
  readonly capacity: number;
  /** The last day the calendar was filled to, `null` before the first fill. */
  readonly materializedUntil: string | null;
}

/** What the series changes to, from the chosen date on; a field left out stays as it is. */
export interface SeriesChange {
  readonly localStartTime?: string;
  readonly durationMinutes?: number;
  readonly trainerProfileId?: string | null;
  readonly capacity?: number;
}

/** A date the series already has, whatever its status. */
export interface SeriesDate {
  readonly id: string;
  readonly occurrenceDate: string;
  /** The fields changed on this date alone. */
  readonly detachedFields: readonly DetachedField[];
  readonly cancelled: boolean;
  /** The date as stored: what a field of its own keeps when the chosen date is one that has them. */
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly trainerProfileId: string | null;
  readonly capacity: number;
}

/** What to write to one date that follows the series: all the series' fields, as they are from now on. */
export interface DateUpdate {
  readonly sessionId: string;
  readonly occurrenceDate: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly trainerProfileId: string | null;
  readonly capacity: number;
  /** What still differs from the series after the update: nothing, for a date that followed it. */
  readonly detachedFields: readonly DetachedField[];
}

export type ApplyFollowingDecision =
  | {
      readonly outcome: 'applied';
      /** `false` when the chosen date is the first of the series: the series itself changes. */
      readonly split: boolean;
      /** The last day of the earlier series after a split; `null` without one. */
      readonly earlierEndsOn: string | null;
      /** The series from the chosen date on (the changed series itself when nothing is split). */
      readonly later: SeriesState;
      /** The dates that take the change: every one from the chosen date on that is not kept. */
      readonly updates: readonly DateUpdate[];
      /** The dates that belong to the later series: all from the chosen date on, kept ones too. Only after a split. */
      readonly moves: readonly string[];
      /** Dates from the chosen date on that keep their own changes (CO-04 says how many). */
      readonly keptDates: number;
      /** The day the calendar is kept filled to after the change: every date up to it was checked. */
      readonly materializedUntil: string;
    }
  | {
      readonly outcome: 'refused';
      readonly reason:
        | 'time-does-not-exist'
        | 'invalid-rule'
        | 'invalid-date'
        | 'invalid-time'
        /** The chosen date is before `today`: past dates of a series are not changed (out of scope in #428). */
        | 'date-in-past'
        /** The new length is not 15 to 240 minutes in whole steps of 5. */
        | 'invalid-duration';
      readonly date?: string;
    };

/**
 * Applies `change` to the series from `fromDate` (a date of the series) on. Dates that were
 * changed on their own (any detached field), and cancelled ones, are left as they are; the chosen
 * date always takes the change, as the Owner asked for it there (a field of its own that the change
 * does not touch stays its own). Refuses, changing nothing: a chosen date before `today` (local
 * date, out of scope in #428), a length that is no whole step, and a start the clocks skip on one
 * of the dates it would reach: the dates the series has and every date up to the day the calendar
 * is kept filled to (`materializedUntil` of the result), which is later than the stored one when
 * the series has not been filled for a while.
 */
export function applyThisAndFollowing(
  series: SeriesState,
  fromDate: string,
  change: SeriesChange,
  existing: readonly SeriesDate[],
  today: string,
): ApplyFollowingDecision {
  const { duration } = GROUP_CLASS_LIMITS;
  if (
    change.durationMinutes !== undefined &&
    (!Number.isInteger(change.durationMinutes) ||
      change.durationMinutes < duration.min ||
      change.durationMinutes > duration.max ||
      change.durationMinutes % duration.step !== 0)
  ) {
    return { outcome: 'refused', reason: 'invalid-duration' };
  }
  if (fromDate < today) return { outcome: 'refused', reason: 'date-in-past' };

  const split = fromDate > series.startsOn;
  const later: SeriesState = {
    ...series,
    startsOn: split ? fromDate : series.startsOn,
    ...(change.localStartTime === undefined ? {} : { localStartTime: change.localStartTime }),
    ...(change.durationMinutes === undefined ? {} : { durationMinutes: change.durationMinutes }),
    ...(change.trainerProfileId === undefined ? {} : { trainerProfileId: change.trainerProfileId }),
    ...(change.capacity === undefined ? {} : { capacity: change.capacity }),
  };

  const reached = existing.filter((date) => date.occurrenceDate >= fromDate);
  const through = [
    series.materializedUntil ?? fromDate,
    horizonEnd(today),
    ...reached.map((d) => d.occurrenceDate),
  ].reduce((latest, date) => (date > latest ? date : latest), fromDate);
  const expansion = expandEach(later, fromDate, through);
  if ('outcome' in expansion) return expansion;
  const [skipped] = expansion.skipped;
  if (skipped !== undefined) {
    return { outcome: 'refused', reason: 'time-does-not-exist', date: skipped };
  }
  const planned = new Map(expansion.occurrences.map((o) => [o.occurrenceDate, o]));

  const updates: DateUpdate[] = [];
  let keptDates = 0;
  for (const date of reached) {
    const isChosen = date.occurrenceDate === fromDate;
    if (!isChosen && date.detachedFields.length > 0) keptDates += 1;
    if (!isChosen && (date.cancelled || date.detachedFields.length > 0)) continue;
    const occurrence = planned.get(date.occurrenceDate);
    if (!occurrence) continue;
    // The chosen date keeps the fields of its own that the change does not touch.
    const keeps = (field: DetachedField, touched: boolean) =>
      isChosen && date.detachedFields.includes(field) && !touched;
    const keepsTime = keeps(
      'time',
      change.localStartTime !== undefined || change.durationMinutes !== undefined,
    );
    const keepsTrainer = keeps('trainer', change.trainerProfileId !== undefined);
    const keepsCapacity = keeps('capacity', change.capacity !== undefined);
    updates.push({
      sessionId: date.id,
      occurrenceDate: date.occurrenceDate,
      startsAt: keepsTime ? date.startsAt : occurrence.startsAt,
      endsAt: keepsTime ? date.endsAt : occurrence.endsAt,
      trainerProfileId: keepsTrainer ? date.trainerProfileId : later.trainerProfileId,
      capacity: keepsCapacity ? date.capacity : later.capacity,
      detachedFields: date.detachedFields.filter(
        (field) =>
          isChosen &&
          ((field === 'time' && keepsTime) ||
            (field === 'trainer' && keepsTrainer) ||
            (field === 'capacity' && keepsCapacity) ||
            field === 'location'),
      ),
    });
  }
  return {
    outcome: 'applied',
    split,
    earlierEndsOn: split ? addDays(fromDate, -7) : null,
    later,
    updates,
    moves: split ? reached.map((date) => date.id) : [],
    keptDates,
    materializedUntil: through,
  };
}
