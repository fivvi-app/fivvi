import { type Locale, matchLocale, resolveCommunicationLanguage } from '@fivvi/i18n';
import { defaultLocation } from '../locations/default-location.ts';
import { hasCapability, type Role } from '../permissions/matrix.ts';
import { wallClockToInstant } from './zoned-time.ts';

// Planning a private session (F020, spec #425): the rules the API applies before it stores one.
// Pure, so the highest seam for time logic is a unit test. The session engine is shared with group
// classes and Open Gym (F021, F022 later): their rules are their own functions beside this one,
// and the session record is the same (`sessions` in `packages/database`).
//
// Time: the person types a wall-clock date and start in the workspace's time zone; this turns them
// into UTC instants (ADR-012). The duration is elapsed time, so a session over the night the clocks
// change is as long as the person asked and its wall-clock end moves with the change.

/** The durations of a private session: minutes, in steps (PS-01: chips 45, 60, 90 or another value). */
export const PRIVATE_SESSION_DURATIONS = { min: 15, max: 240, step: 5 } as const;

/** A private session has one place: the client's. */
const PRIVATE_SESSION_CAPACITY = 1;

const MINUTE_MS = 60_000;

/** What the rules need to know, all read by the caller: no I/O in here. */
export interface PlanPrivateSessionFacts {
  /** Who plans: their role and their own team-member ID in the workspace. */
  readonly actor: { readonly role: Role; readonly teamMemberId: string };
  /** The trainer of the session: a team-member ID of the workspace. */
  readonly trainerTeamMemberId: string;
  /** Whether that team member trains in the workspace (has a trainer profile, F005). */
  readonly trainerTrains: boolean;
  /** The date the person typed, in the workspace's time zone: `YYYY-MM-DD`. */
  readonly localDate: string;
  /** The start the person typed, in the workspace's time zone: `HH:mm`, 24 hours. */
  readonly localStart: string;
  readonly durationMinutes: number;
  /** The workspace's IANA time zone. */
  readonly timeZone: string;
  /** From the caller's clock. */
  readonly now: Date;
  /** The workspace's locations: the session takes the default one (F016). */
  readonly locations: readonly { readonly id: string; readonly isDefault: boolean }[];
}

export type PlanPrivateSessionRefusal =
  /** The actor may not plan for this trainer (a Trainer for another trainer). */
  | 'not-allowed'
  /** The team member named as trainer does not train in the workspace. */
  | 'unknown-trainer'
  | 'invalid-duration'
  /** The date is no calendar date. */
  | 'invalid-date'
  /** The start is no time of day. */
  | 'invalid-time'
  /** The start does not exist because the clocks skip it (daylight saving time starts). */
  | 'time-does-not-exist';

export type PlanPrivateSessionDecision =
  | {
      readonly outcome: 'planned';
      readonly trainerTeamMemberId: string;
      readonly locationId: string;
      readonly startsAt: Date;
      readonly endsAt: Date;
      readonly capacity: number;
      /** The session starts before `now`: it is saved, with a warning, and never emailed. */
      readonly past: boolean;
      /** The start happens twice (the clocks went back); the first one, summer time, was taken. */
      readonly repeatedStart: boolean;
    }
  | { readonly outcome: 'refused'; readonly reason: PlanPrivateSessionRefusal };

function validDuration(minutes: number): boolean {
  const { min, max, step } = PRIVATE_SESSION_DURATIONS;
  return Number.isInteger(minutes) && minutes >= min && minutes <= max && minutes % step === 0;
}

/** The refusals of a typed date, start and duration: the same wherever a session is placed in time. */
type TimeRefusal = Extract<
  PlanPrivateSessionRefusal,
  'invalid-duration' | 'invalid-date' | 'invalid-time' | 'time-does-not-exist'
>;

/**
 * The instants of a typed local date, start and duration in the workspace's time zone, the one rule
 * of planning and of rescheduling: the duration is checked first, then the date and the start
 * (a start the clocks skip does not exist). A past start is allowed and reported.
 */
function placeInTime(input: {
  localDate: string;
  localStart: string;
  durationMinutes: number;
  timeZone: string;
  now: Date;
}):
  | {
      readonly outcome: 'placed';
      readonly startsAt: Date;
      readonly endsAt: Date;
      readonly past: boolean;
      readonly repeatedStart: boolean;
    }
  | { readonly outcome: 'refused'; readonly reason: TimeRefusal } {
  if (!validDuration(input.durationMinutes)) {
    return { outcome: 'refused', reason: 'invalid-duration' };
  }
  const start = wallClockToInstant(input.localDate, input.localStart, input.timeZone);
  if (start.outcome === 'invalid') {
    return { outcome: 'refused', reason: start.field === 'date' ? 'invalid-date' : 'invalid-time' };
  }
  if (start.outcome === 'does-not-exist') {
    return { outcome: 'refused', reason: 'time-does-not-exist' };
  }
  return {
    outcome: 'placed',
    startsAt: start.instant,
    endsAt: new Date(start.instant.getTime() + input.durationMinutes * MINUTE_MS),
    past: start.instant.getTime() < input.now.getTime(),
    repeatedStart: start.repeated,
  };
}

/**
 * Plans a private session: whether the actor may (`session.private.manage.any` for any trainer,
 * `session.private.manage.own` for themself, F004's matrix), the start and end as UTC instants,
 * and the workspace's default location. The refusal for a right comes first, so a caller who may
 * not plan for someone learns nothing about the rest of the input.
 *
 * A past start is allowed (a trainer enters a session afterwards); it is reported, so the caller
 * can warn and skip the confirmation email.
 */
export function planPrivateSession(facts: PlanPrivateSessionFacts): PlanPrivateSessionDecision {
  const { actor } = facts;
  const mayPlanForAnyone = hasCapability(actor.role, 'session.private.manage.any');
  const mayPlanForThemself =
    hasCapability(actor.role, 'session.private.manage.own') &&
    facts.trainerTeamMemberId === actor.teamMemberId;
  if (!mayPlanForAnyone && !mayPlanForThemself) {
    return { outcome: 'refused', reason: 'not-allowed' };
  }
  if (!facts.trainerTrains) return { outcome: 'refused', reason: 'unknown-trainer' };
  const placed = placeInTime(facts);
  if (placed.outcome === 'refused') return placed;
  return {
    outcome: 'planned',
    trainerTeamMemberId: facts.trainerTeamMemberId,
    locationId: defaultLocation({ locations: facts.locations }).id,
    startsAt: placed.startsAt,
    endsAt: placed.endsAt,
    capacity: PRIVATE_SESSION_CAPACITY,
    past: placed.past,
    repeatedStart: placed.repeatedStart,
  };
}

/** What the rules need to know to move a private session, all read by the caller: no I/O in here. */
export interface ReschedulePrivateSessionFacts {
  /** Who reschedules: their role and their own team-member ID in the workspace. */
  readonly actor: { readonly role: Role; readonly teamMemberId: string };
  /** The session as it is now. */
  readonly session: {
    /** `null` when the trainer's profile ended: only the Owner reschedules such a session. */
    readonly trainerTeamMemberId: string | null;
    readonly status: 'scheduled' | 'cancelled';
    readonly version: number;
  };
  /** The version the person saw when they opened the session. */
  readonly expectedVersion: number;
  /** The new date, start and duration, as in planning. */
  readonly localDate: string;
  readonly localStart: string;
  readonly durationMinutes: number;
  readonly timeZone: string;
  readonly now: Date;
}

export type ReschedulePrivateSessionRefusal =
  | Exclude<PlanPrivateSessionRefusal, 'unknown-trainer'>
  /** The session was cancelled (F026): a cancelled session stays as it is. */
  | 'not-scheduled'
  /** Someone changed the session after the version the person saw (AC8). */
  | 'stale-version';

export type ReschedulePrivateSessionDecision =
  | {
      readonly outcome: 'rescheduled';
      readonly startsAt: Date;
      readonly endsAt: Date;
      /** The new start is before `now`: it is saved, with a warning, and never emailed. */
      readonly past: boolean;
      /** The new start happens twice (the clocks went back); the first one was taken. */
      readonly repeatedStart: boolean;
    }
  | { readonly outcome: 'refused'; readonly reason: ReschedulePrivateSessionRefusal };

/**
 * Moves a private session (F020, PS-05): the Owner may move any session
 * (`session.private.manage.any`), a Trainer only their own (`session.private.manage.own`, F004's
 * matrix); the new date, start and duration follow the rules of planning, and the location stays.
 * The refusal for a right comes first, so a caller who may not move the session learns nothing
 * else about it. A stale version is refused last: the person is told the session changed, with
 * the values it has now (the caller adds them).
 */
export function reschedulePrivateSession(
  facts: ReschedulePrivateSessionFacts,
): ReschedulePrivateSessionDecision {
  const { actor, session } = facts;
  const mayMoveAny = hasCapability(actor.role, 'session.private.manage.any');
  const mayMoveOwn =
    hasCapability(actor.role, 'session.private.manage.own') &&
    session.trainerTeamMemberId !== null &&
    session.trainerTeamMemberId === actor.teamMemberId;
  if (!mayMoveAny && !mayMoveOwn) return { outcome: 'refused', reason: 'not-allowed' };
  const placed = placeInTime(facts);
  if (placed.outcome === 'refused') return placed;
  if (session.status !== 'scheduled') return { outcome: 'refused', reason: 'not-scheduled' };
  if (facts.expectedVersion !== session.version) {
    return { outcome: 'refused', reason: 'stale-version' };
  }
  return {
    outcome: 'rescheduled',
    startsAt: placed.startsAt,
    endsAt: placed.endsAt,
    past: placed.past,
    repeatedStart: placed.repeatedStart,
  };
}

/**
 * Whether EM-11 goes to the client: the trainer asked for it (`notify`) and the session is not in
 * the past (AC5): a session entered afterwards never emails, even when the box was checked.
 */
export function sendsConfirmation(input: { notify: boolean; past: boolean }): boolean {
  return input.notify && !input.past;
}

/**
 * The language of EM-11 (ADR-017, AC1, AC3): the client's own email language, then the workspace's
 * default. A value that is no catalog language is skipped.
 */
export function confirmationLanguage(sources: {
  clientEmailLocale?: string | null;
  workspaceDefault: Locale;
}): Locale {
  return resolveCommunicationLanguage({
    recipientPreference: matchLocale(sources.clientEmailLocale),
    workspaceDefault: sources.workspaceDefault,
  });
}

/**
 * Whether EM-04 goes to the client after a reschedule: the trainer asked for it (`notify`) and the
 * new time is not in the past, so a session moved afterwards never emails (as for EM-11).
 */
export function sendsChangeNotice(input: { notify: boolean; past: boolean }): boolean {
  return input.notify && !input.past;
}
