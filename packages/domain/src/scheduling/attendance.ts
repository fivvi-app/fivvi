// Module: Attendance (F025): `changeParticipantStatus` is the only way a participant's status
//        changes: who (the session's current trainer, `attendance.mark.own`, or the Owner,
//        `attendance.mark.any`), when (from 30 minutes before the start, with no end), what
//        (`booked`, `attended`, `no_show` in either direction, never from or to `cancelled`, never on
//        a cancelled session); `needsAttendance` says whether a session still waits for attendance
//        (the nudge, *Aandacht nodig*); `attendanceSummary` counts the statuses
// Spec: F025 AC1, AC2, AC5, AC6, AC7, AC12

import { hasCapability, type Role } from '../permissions/matrix.ts';

// Pure: the caller reads the participant, its session and the actor, and writes what this decides
// (one history row for a change). "Now" is passed in, from the caller's clock.

/** From how long before the start attendance can be taken. */
export const ATTENDANCE_OPENS_MINUTES_BEFORE = 30;

const MINUTE_MS = 60_000;

/** What became of a participant's place, as the database's `attendance_status` holds it. */
export type ParticipantStatus = 'booked' | 'attended' | 'cancelled' | 'no_show';

/** What attendance sets: `cancelled` comes only from cancelling (F026), never from here. */
export type MarkableStatus = Exclude<ParticipantStatus, 'cancelled'>;

/** What the rules need to know of the session. */
export interface AttendanceSession {
  readonly status: 'scheduled' | 'cancelled';
  readonly startsAt: Date;
  readonly endsAt: Date;
  /**
   * The team-member ID of the session's current trainer (F024's substitute, when there is one);
   * `null` for a session without a trainer: then only the Owner takes attendance.
   */
  readonly trainerTeamMemberId: string | null;
}

/** A participant with the session they are in. */
export interface AttendanceParticipant {
  readonly status: ParticipantStatus;
  readonly session: AttendanceSession;
}

/** Who changes the status: their role and their own team-member ID in the workspace. */
export interface AttendanceActor {
  readonly role: Role;
  readonly teamMemberId: string;
}

export type AttendanceRefusal =
  /** A Trainer who is not the session's current trainer, or anyone without the capability. */
  | 'not-allowed'
  /** The session was cancelled: no attendance is needed. */
  | 'session-cancelled'
  /** The participant cancelled their place: it stays cancelled. */
  | 'participant-cancelled'
  /** Before `starts_at − 30 minutes`; the decision names when it opens. */
  | 'too-early';

export type AttendanceDecision =
  | {
      readonly outcome: 'changed';
      readonly from: ParticipantStatus;
      readonly to: MarkableStatus;
      /** The time of the change: `now`, to be stored in UTC. */
      readonly changedAt: Date;
    }
  /** The participant has that status already: nothing is stored, no history row. */
  | { readonly outcome: 'unchanged' }
  | {
      readonly outcome: 'refused';
      readonly reason: Exclude<AttendanceRefusal, 'too-early'>;
    }
  | { readonly outcome: 'refused'; readonly reason: 'too-early'; readonly opensAt: Date };

/** The instant attendance opens for a session that starts at `startsAt`: elapsed time, so it holds when the clocks change. */
export function attendanceOpensAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - ATTENDANCE_OPENS_MINUTES_BEFORE * MINUTE_MS);
}

/**
 * Whether the actor may take attendance of the session: the Owner (`attendance.mark.any`) for
 * every session, a Trainer (`attendance.mark.own`) for the session they currently teach.
 */
export function mayTakeAttendance(actor: AttendanceActor, session: AttendanceSession): boolean {
  if (hasCapability(actor.role, 'attendance.mark.any')) return true;
  return (
    hasCapability(actor.role, 'attendance.mark.own') &&
    session.trainerTeamMemberId !== null &&
    session.trainerTeamMemberId === actor.teamMemberId
  );
}

/**
 * The rules that hold for a whole session, before any participant: who, a cancelled session, the
 * time. The bulk *Iedereen aanwezig* asks them once; a single change asks them through
 * `changeParticipantStatus`.
 */
export function checkAttendanceOpen(
  session: AttendanceSession,
  actor: AttendanceActor,
  now: Date,
):
  | { readonly outcome: 'open' }
  | { readonly outcome: 'refused'; readonly reason: 'not-allowed' | 'session-cancelled' }
  | { readonly outcome: 'refused'; readonly reason: 'too-early'; readonly opensAt: Date } {
  if (!mayTakeAttendance(actor, session)) return { outcome: 'refused', reason: 'not-allowed' };
  if (session.status === 'cancelled') return { outcome: 'refused', reason: 'session-cancelled' };
  const opensAt = attendanceOpensAt(session.startsAt);
  if (now.getTime() < opensAt.getTime())
    return { outcome: 'refused', reason: 'too-early', opensAt };
  return { outcome: 'open' };
}

/**
 * Decides a change of a participant's status: the only way one changes (F025, and F026 and the
 * bookings of M5 call it too). The checks run in this order: who, a cancelled session, a cancelled
 * participant, the time. Setting the status a participant has already changes nothing.
 */
export function changeParticipantStatus(
  participant: AttendanceParticipant,
  to: MarkableStatus,
  actor: AttendanceActor,
  now: Date,
): AttendanceDecision {
  const { session } = participant;
  if (!mayTakeAttendance(actor, session)) return { outcome: 'refused', reason: 'not-allowed' };
  if (session.status === 'cancelled') return { outcome: 'refused', reason: 'session-cancelled' };
  if (participant.status === 'cancelled') {
    return { outcome: 'refused', reason: 'participant-cancelled' };
  }
  const opensAt = attendanceOpensAt(session.startsAt);
  if (now.getTime() < opensAt.getTime())
    return { outcome: 'refused', reason: 'too-early', opensAt };
  if (participant.status === to) return { outcome: 'unchanged' };
  return { outcome: 'changed', from: participant.status, to, changedAt: now };
}

/**
 * Whether a session waits for attendance: it has ended, it is not cancelled and a participant is
 * still `booked` (the nudge on *Vandaag* and *Aandacht nodig*, Q18).
 */
export function needsAttendance(
  session: Pick<AttendanceSession, 'status' | 'endsAt'> & {
    readonly participants: readonly ParticipantStatus[];
  },
  now: Date,
): boolean {
  return (
    session.status === 'scheduled' &&
    session.endsAt.getTime() <= now.getTime() &&
    session.participants.includes('booked')
  );
}

/**
 * Whether a session of the read models says *Aanwezigheid nog invullen* (F025, Q18): the rule of
 * `needsAttendance` for a private session or a class date. Open Gym has no attendance yet, so it
 * is never open, whoever is booked. The one place the type gate and the rule meet: the nudge on a
 * session and the dashboard's *Aandacht nodig* row both ask here.
 */
export function attendanceOpen(
  session: Pick<AttendanceSession, 'status' | 'endsAt'> & {
    readonly type: 'private' | 'group' | 'open_gym';
    /** The statuses of its participants; left out by a caller that has none. */
    readonly participantStatuses?: readonly ParticipantStatus[];
  },
  now: Date,
): boolean {
  return (
    session.type !== 'open_gym' &&
    needsAttendance(
      {
        status: session.status,
        endsAt: session.endsAt,
        participants: session.participantStatuses ?? [],
      },
      now,
    )
  );
}

/** The counts of a session's statuses: `open` are the participants still `booked`. */
export interface AttendanceSummary {
  readonly attended: number;
  readonly noShow: number;
  readonly open: number;
  readonly cancelled: number;
}

export function attendanceSummary(statuses: readonly ParticipantStatus[]): AttendanceSummary {
  const count = (status: ParticipantStatus) => statuses.filter((one) => one === status).length;
  return {
    attended: count('attended'),
    noShow: count('no_show'),
    open: count('booked'),
    cancelled: count('cancelled'),
  };
}
