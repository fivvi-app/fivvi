// Module: Cancelling a private session or a class date (F026): who may (`session.private.cancel.own`
//        for a Trainer's own session, `.any` for the Owner; `class.manage`, the Owner, for a class
//        date), what is refused (a cancelled session, a stale version), what is recorded (the time,
//        the team member, who initiated it) and what follows: every place of the session goes to
//        `cancelled`, and which clients are emailed (asked for, and the session has not started).
//        A class date is cancelled alone or with the rest of its series (`cancelClassDate`): the later
//        dates with participants or changes of their own are cancelled, the others removed, and the
//        series ends the day before; `previewClassCancellation` counts what CO-03 shows. The
//        late-cancellation decision is NOT made here: M11 derives it from the recorded time, the
//        initiator and the start
// Spec: F026 AC1, AC2, AC5, AC6, AC7, AC8, AC9, AC10, AC11

import { hasCapability, type Role } from '../permissions/matrix.ts';
import type { ParticipantStatus } from './attendance.ts';
import { addDays } from './zoned-time.ts';

// Pure: the caller reads the session, its places and the actor, and stores what this decides in one
// transaction (the session's record, one status-history line for every place that changes) and
// sends the emails after the commit. Another caller with its own transaction (the trainer handover,
// F026's later tickets) uses it the same way. "Now" is passed in, from the caller's clock.

/** Who a cancellation came from: the client called it off, or the workspace did (PS-06: *De klant* / *Wij*). */
export type CancellationInitiator = 'client' | 'workspace';

/** What the rules need to know of a private session and its places. */
export interface CancellablePrivateSession {
  readonly status: 'scheduled' | 'cancelled';
  readonly version: number;
  readonly startsAt: Date;
  /** The team-member ID of the session's trainer; `null` once the trainer's profile ended: only the Owner cancels it. */
  readonly trainerTeamMemberId: string | null;
  /** The places, in the order they were made (one, or two for a duo). */
  readonly participants: readonly {
    readonly clientId: string;
    readonly status: ParticipantStatus;
  }[];
}

/** Who cancels: their role and their own team-member ID in the workspace. */
export interface CancelActor {
  readonly role: Role;
  readonly teamMemberId: string;
}

export interface CancelRequest {
  readonly initiator: CancellationInitiator;
  /** Whether to email the clients (PS-06's box); never sent once the session has started. */
  readonly notify: boolean;
  /**
   * The version the person saw. Left out by a caller that read the session itself inside its own
   * transaction (the trainer handover): then no version is compared.
   */
  readonly expectedVersion?: number;
}

export type CancelPrivateSessionRefusal =
  /** The actor may not cancel this session (a Trainer for another trainer's). */
  | 'not-allowed'
  /** The session is cancelled already (a second cancel), or is not scheduled. */
  | 'not-scheduled'
  /** Someone changed the session after the version the person saw (AC11). */
  | 'stale-version';

/** One place that goes to `cancelled`, for the status history (`from` is what it was). */
export interface CancelledPlace {
  readonly clientId: string;
  readonly from: Exclude<ParticipantStatus, 'cancelled'>;
  readonly to: 'cancelled';
}

export type CancelPrivateSessionDecision =
  | {
      readonly outcome: 'cancelled';
      /** The time of the cancellation: `now`, to be stored in UTC. */
      readonly cancelledAt: Date;
      /** The team member who clicked. */
      readonly cancelledByTeamMemberId: string;
      readonly initiator: CancellationInitiator;
      /** Every place that was not cancelled yet, in the order of the session's places. */
      readonly participantChanges: readonly CancelledPlace[];
      /** The clients who get the cancellation email: those whose place changed, when it was asked for and the session has not started. */
      readonly notifyClientIds: readonly string[];
    }
  | { readonly outcome: 'refused'; readonly reason: CancelPrivateSessionRefusal };

/**
 * Whether the actor may cancel the private session: the Owner (`session.private.cancel.any`) any,
 * a Trainer (`session.private.cancel.own`) the one they teach.
 */
export function mayCancelPrivateSession(
  actor: CancelActor,
  session: Pick<CancellablePrivateSession, 'trainerTeamMemberId'>,
): boolean {
  if (hasCapability(actor.role, 'session.private.cancel.any')) return true;
  return (
    hasCapability(actor.role, 'session.private.cancel.own') &&
    session.trainerTeamMemberId !== null &&
    session.trainerTeamMemberId === actor.teamMemberId
  );
}

/**
 * Decides the cancellation of a private session. The checks run in this order: who (a caller who
 * may not learns nothing of the session), a session that is cancelled already, a stale version
 * (the route, F020's reschedule and F025's attendance keep the same order). Whatever the status of
 * a place, it becomes `cancelled`, one change each, so the history is the one record M11 reads. The
 * emails are asked for with `notify` and never go out once the session has started: it is then
 * recorded for the record, without a word to anyone.
 */
export function cancelPrivateSession(
  session: CancellablePrivateSession,
  actor: CancelActor,
  request: CancelRequest,
  now: Date,
): CancelPrivateSessionDecision {
  if (!mayCancelPrivateSession(actor, session))
    return { outcome: 'refused', reason: 'not-allowed' };
  if (session.status !== 'scheduled') return { outcome: 'refused', reason: 'not-scheduled' };
  if (request.expectedVersion !== undefined && request.expectedVersion !== session.version) {
    return { outcome: 'refused', reason: 'stale-version' };
  }
  const participantChanges = session.participants.flatMap((place): CancelledPlace[] =>
    place.status === 'cancelled'
      ? []
      : [{ clientId: place.clientId, from: place.status, to: 'cancelled' }],
  );
  const started = session.startsAt.getTime() <= now.getTime();
  return {
    outcome: 'cancelled',
    cancelledAt: now,
    cancelledByTeamMemberId: actor.teamMemberId,
    initiator: request.initiator,
    participantChanges,
    notifyClientIds:
      request.notify && !started ? participantChanges.map((change) => change.clientId) : [],
  };
}

/** The longest message an Owner can send with a class date's cancellation (CO-03), in characters. */
export const CANCELLATION_MESSAGE_MAX_LENGTH = 500;

/** How much of a series a cancellation reaches: this date alone, or this one and every later one. */
export type CancelScope = 'this' | 'following';

/** A place of a class date as the cancellation reads it. */
export interface CancellablePlace {
  readonly clientId: string;
  readonly status: ParticipantStatus;
}

/** The class date being cancelled, with the places in it. */
export interface CancellableClassDate {
  readonly id: string;
  readonly status: 'scheduled' | 'cancelled';
  readonly version: number;
  readonly startsAt: Date;
  /** The weekly series the date belongs to; `null` for a date put on the calendar on its own. */
  readonly series: {
    /** The local date in the series' rule this date stands for, `YYYY-MM-DD`. */
    readonly occurrenceDate: string;
    /** The first day of the series. */
    readonly startsOn: string;
    /** The last day it may have a date on, `null` for a series that runs until it is stopped. */
    readonly endsOn: string | null;
  } | null;
  /** In the order the places were made. */
  readonly participants: readonly CancellablePlace[];
}

/** A date of the same series after the one being cancelled. */
export interface LaterSeriesDate {
  readonly id: string;
  /** `YYYY-MM-DD`. */
  readonly occurrenceDate: string;
  readonly status: 'scheduled' | 'cancelled';
  readonly version: number;
  readonly startsAt: Date;
  /** What was changed on this date alone (`time`, `trainer`, `capacity`, `location`). */
  readonly detachedFields: readonly string[];
  readonly participants: readonly CancellablePlace[];
  /** Another record points at the date (a booking link of the date): it cannot be removed. */
  readonly referenced: boolean;
}

export interface CancelClassDateRequest {
  readonly scope: CancelScope;
  /** What the Owner typed for the participants; kept as typed, a blank text is none. */
  readonly message?: string;
  /** The version of the chosen date the person saw; left out by a caller that holds the date itself. */
  readonly expectedVersion?: number;
}

export type CancelClassDateRefusal =
  /** Anyone but the Owner (`class.manage`). */
  | 'not-allowed'
  /** The date is cancelled already (a second cancel). */
  | 'not-scheduled'
  /** *Deze en alle volgende lessen* on a date that is in no series. */
  | 'not-in-series'
  /** Someone changed the date after the version the person saw. */
  | 'stale-version';

/** One date that goes to `cancelled`, with the places that change and who is emailed. */
export interface CancelledClassDate {
  readonly sessionId: string;
  /** The version the date must still have when it is written. */
  readonly expectedVersion: number;
  /** `YYYY-MM-DD`; `null` for a date in no series. */
  readonly occurrenceDate: string | null;
  /** Every place that was not cancelled yet, in the order of the date's places. */
  readonly participantChanges: readonly CancelledPlace[];
  /** The clients who get EM-05: those whose place changed, when the date has not started. */
  readonly notifyClientIds: readonly string[];
  /** The message kept with the date and sent to `notifyClientIds`; `null` when nobody is emailed. */
  readonly message: string | null;
}

export type CancelClassDateDecision =
  | {
      readonly outcome: 'cancelled';
      readonly cancelledAt: Date;
      readonly cancelledByTeamMemberId: string;
      /** Always `workspace`: the Owner cancels a class, never a client (M5's own bookings differ). */
      readonly initiator: 'workspace';
      /** The chosen date first, then every later date that is cancelled, in date order. */
      readonly dates: readonly CancelledClassDate[];
      /** The later dates of the series with nothing of their own: removed, they were only the rule's projection. */
      readonly removedSessionIds: readonly string[];
      /**
       * The last day of the series after the cancellation (*de reeks stopt*): the day before the
       * chosen date, or the end it had already when that is earlier; `null` for a single date.
       */
      readonly seriesEndsOn: string | null;
    }
  | { readonly outcome: 'refused'; readonly reason: CancelClassDateRefusal };

const messageOf = (message: string | undefined): string | null =>
  message === undefined || message.trim() === '' ? null : message;

/** A date with nothing of its own is a projection of the rule; anything of its own keeps it. */
const hasOwnRecord = (date: LaterSeriesDate): boolean =>
  date.participants.length > 0 || date.detachedFields.length > 0 || date.referenced;

const changesOf = (places: readonly CancellablePlace[]): CancelledPlace[] =>
  places.flatMap((place): CancelledPlace[] =>
    place.status === 'cancelled'
      ? []
      : [{ clientId: place.clientId, from: place.status, to: 'cancelled' }],
  );

/**
 * What cancelling a class date does, whoever asks: the dates that go to `cancelled` (the chosen one,
 * then with `following` every later date of its series that has participants, changes of its own or
 * something that points at it), the later dates removed, and the end of the series. Each date is
 * emailed on its own start: one that has started is recorded for the record, without an email.
 */
function planClassCancellation(
  date: CancellableClassDate,
  laterDates: readonly LaterSeriesDate[],
  scope: CancelScope,
  message: string | null,
  now: Date,
  expectedVersion: number,
) {
  const cancelledDate = (
    sessionId: string,
    version: number,
    occurrenceDate: string | null,
    startsAt: Date,
    places: readonly CancellablePlace[],
  ): CancelledClassDate => {
    const participantChanges = changesOf(places);
    const notifyClientIds =
      startsAt.getTime() > now.getTime() ? participantChanges.map((change) => change.clientId) : [];
    return {
      sessionId,
      expectedVersion: version,
      occurrenceDate,
      participantChanges,
      notifyClientIds,
      message: notifyClientIds.length > 0 ? message : null,
    };
  };
  const dates = [
    cancelledDate(
      date.id,
      expectedVersion,
      date.series?.occurrenceDate ?? null,
      date.startsAt,
      date.participants,
    ),
  ];
  const removedSessionIds: string[] = [];
  let seriesEndsOn: string | null = null;
  if (scope === 'following' && date.series) {
    const { occurrenceDate, startsOn, endsOn } = date.series;
    const after = laterDates
      .filter((later) => later.occurrenceDate > occurrenceDate && later.status === 'scheduled')
      .toSorted((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
    for (const later of after) {
      if (hasOwnRecord(later)) {
        dates.push(
          cancelledDate(
            later.id,
            later.version,
            later.occurrenceDate,
            later.startsAt,
            later.participants,
          ),
        );
      } else {
        removedSessionIds.push(later.id);
      }
    }
    // The day before this date; a series cannot end before it starts, so for its first date the
    // end is its own day: the date stays (cancelled) and nothing is added after it.
    const dayBefore = addDays(occurrenceDate, -1);
    const newEnd = dayBefore < startsOn ? startsOn : dayBefore;
    seriesEndsOn = endsOn !== null && endsOn < newEnd ? endsOn : newEnd;
  }
  return { dates, removedSessionIds, seriesEndsOn };
}

/**
 * Decides the cancellation of a class date, alone or with the rest of its series (CO-03). The
 * checks run in this order: who (only the Owner, `class.manage`), a date that is cancelled already,
 * a date in no series asked to cancel with `following`, a stale version. Every place of a cancelled
 * date becomes `cancelled`, one change each, initiated by the workspace, so the history is the one
 * record M11 reads. Emails go out to those whose place changed, on the dates that have not started.
 */
export function cancelClassDate(
  date: CancellableClassDate,
  laterDates: readonly LaterSeriesDate[],
  actor: CancelActor,
  request: CancelClassDateRequest,
  now: Date,
): CancelClassDateDecision {
  if (!hasCapability(actor.role, 'class.manage')) {
    return { outcome: 'refused', reason: 'not-allowed' };
  }
  if (date.status !== 'scheduled') return { outcome: 'refused', reason: 'not-scheduled' };
  if (request.scope === 'following' && !date.series) {
    return { outcome: 'refused', reason: 'not-in-series' };
  }
  if (request.expectedVersion !== undefined && request.expectedVersion !== date.version) {
    return { outcome: 'refused', reason: 'stale-version' };
  }
  const plan = planClassCancellation(
    date,
    laterDates,
    request.scope,
    messageOf(request.message),
    now,
    request.expectedVersion ?? date.version,
  );
  return {
    outcome: 'cancelled',
    cancelledAt: now,
    cancelledByTeamMemberId: actor.teamMemberId,
    initiator: 'workspace',
    ...plan,
  };
}

/** What one scope of a cancellation does, as CO-03 tells the Owner before they confirm. */
export interface ClassCancellationCounts {
  /** Dates that become *Geannuleerd*, the chosen one included. */
  readonly datesCancelled: number;
  /** Later dates removed from the calendar. */
  readonly datesRemoved: number;
  /** Dates on which somebody gets an email ("{n} deelnemers in {classes} lessen"). */
  readonly datesWithEmails: number;
  /** Different people who get at least one email. */
  readonly participants: number;
  /** Emails in all: one for each place that is cancelled on a date that has not started. */
  readonly emails: number;
}

export interface ClassCancellationPreview {
  /** The date has started or passed: it is recorded for the record, without emails or a message. */
  readonly started: boolean;
  /** The date is in a series, so *Deze en alle volgende lessen* is offered. */
  readonly inSeries: boolean;
  readonly thisDate: ClassCancellationCounts;
  /** `null` for a date in no series. */
  readonly following: ClassCancellationCounts | null;
}

function countsOf(plan: ReturnType<typeof planClassCancellation>): ClassCancellationCounts {
  const notified = plan.dates.flatMap((date) => date.notifyClientIds);
  return {
    datesCancelled: plan.dates.length,
    datesRemoved: plan.removedSessionIds.length,
    datesWithEmails: plan.dates.filter((date) => date.notifyClientIds.length > 0).length,
    participants: new Set(notified).size,
    emails: notified.length,
  };
}

/**
 * What cancelling the date would do for each scope, without cancelling it (CO-03 reads it before
 * the Owner confirms): the dates cancelled and removed and the people emailed. It decides nothing
 * about who may: the route that shows it has asked for `class.manage` already.
 */
export function previewClassCancellation(
  date: CancellableClassDate,
  laterDates: readonly LaterSeriesDate[],
  now: Date,
): ClassCancellationPreview {
  const plan = (scope: CancelScope) =>
    planClassCancellation(date, laterDates, scope, null, now, date.version);
  return {
    started: date.startsAt.getTime() <= now.getTime(),
    inSeries: date.series !== null,
    thisDate: countsOf(plan('this')),
    following: date.series ? countsOf(plan('following')) : null,
  };
}
