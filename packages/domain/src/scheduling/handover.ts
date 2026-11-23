// Module: Handing over a removed trainer's future sessions (F023): which sessions are *the next 2
//        weeks* and which *later*, the counts the removal dialog shows, whether a removal needs a
//        handover at all, and `planHandover`: the next 2 weeks' private sessions go to a trainer or
//        are cancelled (*Niemand*), the next 2 weeks' class dates to a trainer or *Trainer nodig*,
//        and everything later gets *Trainer nodig*, never cancelled
// Spec: F023 AC9, AC9a, AC11, AC18

import { DETACHABLE_FIELDS, type DetachedField } from './apply-following.ts';
import { addDays, instantToWallClock, wallClockToInstant } from './zoned-time.ts';

// Pure: the caller reads the trainer's future sessions and stores what this decides in the
// request's transaction (the handover, the cancellations, the series' trainer and the removal are
// one transaction). Who may remove a team member is the route's access, not decided here.

/** *The next 2 weeks*: the sessions that start within this many days from now, on the wall clock. */
export const HANDOVER_DAYS = 14;

/** A scheduled session of the trainer that has not started; the caller reads it all. */
export interface HandoverSession {
  readonly id: string;
  readonly type: 'private' | 'group';
  readonly startsAt: Date;
  /** The version it was read at, so the write can say which it replaces. */
  readonly version: number;
  /** Whether it is a date of a weekly series (F022). */
  readonly inSeries: boolean;
  /** What was changed on this date alone. */
  readonly detachedFields: readonly DetachedField[];
}

/**
 * The end of *the next 2 weeks*: 14 days on the wall clock of the workspace from `now`, at the same
 * time of day, so a change of the clocks inside the window does not move it. A time the clocks skip
 * takes 14 × 24 hours instead.
 */
export function handoverWindowEnd(now: Date, timeZone: string): Date {
  const wall = instantToWallClock(now, timeZone);
  const end = wallClockToInstant(addDays(wall.date, HANDOVER_DAYS), wall.time, timeZone);
  return end.outcome === 'instant'
    ? end.instant
    : new Date(now.getTime() + HANDOVER_DAYS * 86_400_000);
}

/** Private sessions and class dates in one window. */
export interface WindowCounts {
  readonly privateSessions: number;
  readonly classDates: number;
}

/** What the removal dialog counts (`GET …/future-sessions`). */
export interface FutureSessionCounts {
  readonly nextTwoWeeks: WindowCounts;
  readonly later: WindowCounts;
  /** Whether the person is the regular trainer of a series that has not ended. */
  readonly regularTrainerOfSeries: boolean;
}

const startsInFuture = (session: HandoverSession, now: Date) =>
  session.startsAt.getTime() > now.getTime();

/** The sessions of the next 2 weeks and of later, counted by kind. A session that has started counts for neither. */
export function countFutureSessions(input: {
  readonly sessions: readonly HandoverSession[];
  readonly regularTrainerOfSeries: boolean;
  readonly now: Date;
  readonly timeZone: string;
}): FutureSessionCounts {
  const windowEnd = handoverWindowEnd(input.now, input.timeZone).getTime();
  const count = (inWindow: (startsAt: number) => boolean): WindowCounts => {
    const chosen = input.sessions.filter(
      (session) => startsInFuture(session, input.now) && inWindow(session.startsAt.getTime()),
    );
    return {
      privateSessions: chosen.filter((session) => session.type === 'private').length,
      classDates: chosen.filter((session) => session.type === 'group').length,
    };
  };
  return {
    nextTwoWeeks: count((startsAt) => startsAt < windowEnd),
    later: count((startsAt) => startsAt >= windowEnd),
    regularTrainerOfSeries: input.regularTrainerOfSeries,
  };
}

/**
 * Whether removing the person needs a handover (AC11): a future private session or class date in
 * either window, or a series they are the regular trainer of. Without one the removal answers
 * `409 has_future_sessions` and changes nothing.
 */
export function hasFutureSessions(counts: FutureSessionCounts): boolean {
  return (
    counts.regularTrainerOfSeries ||
    counts.nextTwoWeeks.privateSessions > 0 ||
    counts.nextTwoWeeks.classDates > 0 ||
    counts.later.privateSessions > 0 ||
    counts.later.classDates > 0
  );
}

/** What happens to one session. */
export type HandoverAction =
  /** The session goes to the trainer; a class date of a series is marked as having its own trainer. */
  | {
      readonly kind: 'hand-over';
      readonly trainerProfileId: string;
      readonly detachedFields: readonly DetachedField[];
    }
  /** A private session of the next 2 weeks with nobody to take it: cancelled (F026). */
  | { readonly kind: 'cancel' }
  /** The session has no trainer (*Trainer nodig*) and stays on the calendar. */
  | { readonly kind: 'trainer-needed' };

export interface HandoverChange {
  readonly sessionId: string;
  readonly type: 'private' | 'group';
  /** The version the session was read at. */
  readonly version: number;
  readonly action: HandoverAction;
}

/** What the removal reports it changed (the response of `DELETE …/team-members/{id}`). */
export interface HandoverSummary {
  readonly nextTwoWeeks: {
    readonly privateHandedOver: number;
    readonly privateCancelled: number;
    readonly classesHandedOver: number;
    readonly classesTrainerNeeded: number;
  };
  readonly later: {
    readonly privateTrainerNeeded: number;
    readonly classesTrainerNeeded: number;
  };
}

export interface HandoverPlan {
  /** One change for each session that has not started, soonest first. */
  readonly changes: readonly HandoverChange[];
  readonly summary: HandoverSummary;
}

/**
 * Decides what happens to the trainer's future sessions (F023 AC9, AC9a):
 * - **the next 2 weeks:** a private session goes to `privateTo`, or is cancelled when that is `null`
 *   (*Niemand*); a class date goes to `classesTo`, or gets *Trainer nodig* when that is `null`;
 * - **later:** every private session and class date gets *Trainer nodig*, whatever the request
 *   says, and none is cancelled.
 * The caller also takes the trainer off the series they were the regular trainer of, so dates made
 * later show *Trainer nodig* too. `privateTo` and `classesTo` are trainer profile IDs.
 */
export function planHandover(input: {
  readonly sessions: readonly HandoverSession[];
  readonly now: Date;
  readonly timeZone: string;
  readonly privateTo: string | null;
  readonly classesTo: string | null;
}): HandoverPlan {
  const windowEnd = handoverWindowEnd(input.now, input.timeZone).getTime();
  const summary = {
    nextTwoWeeks: {
      privateHandedOver: 0,
      privateCancelled: 0,
      classesHandedOver: 0,
      classesTrainerNeeded: 0,
    },
    later: { privateTrainerNeeded: 0, classesTrainerNeeded: 0 },
  };

  const changes = input.sessions
    .filter((session) => startsInFuture(session, input.now))
    .toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))
    .map((session): HandoverChange => {
      const change = (action: HandoverAction): HandoverChange => ({
        sessionId: session.id,
        type: session.type,
        version: session.version,
        action,
      });
      const next = session.startsAt.getTime() < windowEnd;
      const isPrivate = session.type === 'private';
      if (!next) {
        if (isPrivate) summary.later.privateTrainerNeeded += 1;
        else summary.later.classesTrainerNeeded += 1;
        return change({ kind: 'trainer-needed' });
      }
      const to = isPrivate ? input.privateTo : input.classesTo;
      if (to === null) {
        if (isPrivate) {
          summary.nextTwoWeeks.privateCancelled += 1;
          return change({ kind: 'cancel' });
        }
        summary.nextTwoWeeks.classesTrainerNeeded += 1;
        return change({ kind: 'trainer-needed' });
      }
      if (isPrivate) summary.nextTwoWeeks.privateHandedOver += 1;
      else summary.nextTwoWeeks.classesHandedOver += 1;
      // A class date of a series keeps its own trainer when the series changes later (F022).
      const detachedFields =
        !isPrivate && session.inSeries
          ? DETACHABLE_FIELDS.filter(
              (field) => field === 'trainer' || session.detachedFields.includes(field),
            )
          : [];
      return change({ kind: 'hand-over', trainerProfileId: to, detachedFields });
    });
  return { changes, summary };
}
