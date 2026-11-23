// Module: Cancelling a private session (F026): who may (`session.private.cancel.own` for a Trainer's
//        own session, `.any` for the Owner), what is refused (a cancelled session, a stale version),
//        what is recorded (the time, the team member, who initiated it) and what follows: every
//        place of the session goes to `cancelled`, and which clients are emailed (asked for, and the
//        session has not started). The late-cancellation decision is NOT made here: M11 derives it
//        from the recorded time, the initiator and the start
// Spec: F026 AC1, AC2, AC5, AC9, AC10, AC11

import { hasCapability, type Role } from '../permissions/matrix.ts';
import type { ParticipantStatus } from './attendance.ts';

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
