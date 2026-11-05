import { defaultLocation } from '../locations/default-location.ts';
import { instantToWallClock, wallClockToInstant } from './zoned-time.ts';

// A group class on a date (F021, spec #427): the rules the API applies before it stores a group
// session. Pure, like `planPrivateSession`, whose wall-clock and daylight saving rules it reuses
// (`wallClockToInstant`, ADR-012): the person types a date and a start in the workspace's time
// zone, the session is stored as UTC instants. The class's trainer, capacity and duration are
// copied onto the date, so a later change of the class does not change a date already planned
// (AC9). Who may do this is the route's access (`class.manage`, F004's matrix), not decided here.

/** The limits of a class and its dates (spec #427, open question 2). */
export const GROUP_CLASS_LIMITS = {
  nameMaxLength: 80,
  descriptionMaxLength: 500,
  capacity: { min: 1, max: 100 },
  duration: { min: 15, max: 240, step: 5 },
} as const;

const MINUTE_MS = 60_000;

function validCapacity(capacity: number): boolean {
  const { min, max } = GROUP_CLASS_LIMITS.capacity;
  return Number.isInteger(capacity) && capacity >= min && capacity <= max;
}

/** A trainer by the two IDs the caller stores: the team member (the API's trainer) and the trainer profile. */
export interface TrainerReference {
  readonly teamMemberId: string;
  readonly trainerProfileId: string;
}

/** What the rules need to schedule a class on a date, all read by the caller: no I/O in here. */
export interface ScheduleClassOnDateFacts {
  /** The class as stored: its defaults are copied. */
  readonly groupClass: {
    readonly capacity: number;
    readonly durationMinutes: number;
    /** The usual trainer; `null` for *Trainer nodig*. */
    readonly defaultTrainer: TrainerReference | null;
  };
  /**
   * The trainer the person chose for this date: left out takes the class's usual trainer, `null`
   * plans the date as *Trainer nodig*, a team member must train in the workspace (`trains`, F005).
   */
  readonly requestedTrainer?: (TrainerReference & { readonly trains: boolean }) | null;
  /** The capacity chosen for this date; left out takes the class's. */
  readonly requestedCapacity?: number;
  /** The date typed, in the workspace's time zone: `YYYY-MM-DD`. */
  readonly localDate: string;
  /** The start typed, in the workspace's time zone: `HH:mm`, 24 hours. */
  readonly localStart: string;
  readonly timeZone: string;
  /** From the caller's clock. */
  readonly now: Date;
  /** The workspace's locations: the date takes the default one (F016). */
  readonly locations: readonly { readonly id: string; readonly isDefault: boolean }[];
}

export type ScheduleClassOnDateRefusal =
  /** The team member named as trainer does not train in the workspace. */
  | 'unknown-trainer'
  | 'invalid-capacity'
  | 'invalid-date'
  | 'invalid-time'
  /** The start does not exist because the clocks skip it (daylight saving time starts). */
  | 'time-does-not-exist';

export type ScheduleClassOnDateDecision =
  | {
      readonly outcome: 'scheduled';
      /** The trainer of the date; `null`: *Trainer nodig*. */
      readonly trainer: TrainerReference | null;
      readonly locationId: string;
      readonly startsAt: Date;
      readonly endsAt: Date;
      readonly capacity: number;
      /** The date starts before `now`: it is saved (entered afterwards). */
      readonly past: boolean;
      /** The start happens twice (the clocks went back); the first one, summer time, was taken. */
      readonly repeatedStart: boolean;
    }
  | { readonly outcome: 'refused'; readonly reason: ScheduleClassOnDateRefusal };

/**
 * Puts a class on a date: the trainer, capacity and duration of the class (or the date's own
 * trainer and capacity when the person changed them), the workspace's default location, and the
 * start and end as UTC instants. The end is the start plus the class's duration as elapsed time,
 * so a class over the night the clocks change is as long as the class says.
 */
export function scheduleClassOnDate(facts: ScheduleClassOnDateFacts): ScheduleClassOnDateDecision {
  const { groupClass, requestedTrainer } = facts;
  if (requestedTrainer && !requestedTrainer.trains) {
    return { outcome: 'refused', reason: 'unknown-trainer' };
  }
  const capacity = facts.requestedCapacity ?? groupClass.capacity;
  if (!validCapacity(capacity)) return { outcome: 'refused', reason: 'invalid-capacity' };
  const start = wallClockToInstant(facts.localDate, facts.localStart, facts.timeZone);
  if (start.outcome === 'invalid') {
    return { outcome: 'refused', reason: start.field === 'date' ? 'invalid-date' : 'invalid-time' };
  }
  if (start.outcome === 'does-not-exist') {
    return { outcome: 'refused', reason: 'time-does-not-exist' };
  }
  return {
    outcome: 'scheduled',
    trainer:
      requestedTrainer === undefined
        ? groupClass.defaultTrainer
        : requestedTrainer && {
            teamMemberId: requestedTrainer.teamMemberId,
            trainerProfileId: requestedTrainer.trainerProfileId,
          },
    locationId: defaultLocation({ locations: facts.locations }).id,
    startsAt: start.instant,
    endsAt: new Date(start.instant.getTime() + groupClass.durationMinutes * MINUTE_MS),
    capacity,
    past: start.instant.getTime() < facts.now.getTime(),
    repeatedStart: start.repeated,
  };
}

/** What the person changes on one date (CO-04): every field left out stays as it is. */
export interface GroupDateEditFacts {
  /** The date as stored. */
  readonly current: { readonly startsAt: Date; readonly endsAt: Date; readonly capacity: number };
  readonly requested: {
    /** `HH:mm`. */
    readonly localStart?: string;
    /** `HH:mm`, on the same date as the start. */
    readonly localEnd?: string;
    readonly capacity?: number;
  };
  readonly timeZone: string;
}

export type GroupDateEditRefusal =
  | 'nothing-to-change'
  | 'invalid-capacity'
  | 'invalid-time'
  | 'invalid-end-time'
  | 'time-does-not-exist'
  | 'end-time-does-not-exist'
  /** The end is not after the start (CO-04: *De eindtijd moet na de begintijd liggen.*). */
  | 'end-before-start';

export type GroupDateEditDecision =
  | {
      readonly outcome: 'edited';
      readonly startsAt: Date;
      readonly endsAt: Date;
      readonly capacity: number;
    }
  | { readonly outcome: 'refused'; readonly reason: GroupDateEditRefusal };

/**
 * Edits one date of a class (CO-04, AC4): the start, the end and the capacity, each only when
 * given, read in the workspace's time zone with the same daylight saving rules as scheduling (a
 * skipped time is refused, a repeated one takes the first instant). The day stays: a date does
 * not move to another day. The end is on the same day as the start and must be after it; an
 * unchanged end keeps its time of day, so a start moved past it is refused for the same reason.
 * The class itself is never touched.
 */
export function decideGroupDateEdit(facts: GroupDateEditFacts): GroupDateEditDecision {
  const { current, requested, timeZone } = facts;
  if (
    requested.localStart === undefined &&
    requested.localEnd === undefined &&
    requested.capacity === undefined
  ) {
    return { outcome: 'refused', reason: 'nothing-to-change' };
  }
  const capacity = requested.capacity ?? current.capacity;
  if (!validCapacity(capacity)) return { outcome: 'refused', reason: 'invalid-capacity' };

  if (requested.localStart === undefined && requested.localEnd === undefined) {
    return { outcome: 'edited', startsAt: current.startsAt, endsAt: current.endsAt, capacity };
  }

  const now = instantToWallClock(current.startsAt, timeZone);
  const startTime = requested.localStart ?? now.time;
  const endTime = requested.localEnd ?? instantToWallClock(current.endsAt, timeZone).time;
  const start = wallClockToInstant(now.date, startTime, timeZone);
  if (start.outcome === 'invalid') return { outcome: 'refused', reason: 'invalid-time' };
  if (start.outcome === 'does-not-exist') {
    return { outcome: 'refused', reason: 'time-does-not-exist' };
  }
  const end = wallClockToInstant(now.date, endTime, timeZone);
  if (end.outcome === 'invalid') return { outcome: 'refused', reason: 'invalid-end-time' };
  if (end.outcome === 'does-not-exist') {
    return { outcome: 'refused', reason: 'end-time-does-not-exist' };
  }
  if (end.instant.getTime() <= start.instant.getTime()) {
    return { outcome: 'refused', reason: 'end-before-start' };
  }
  return { outcome: 'edited', startsAt: start.instant, endsAt: end.instant, capacity };
}
