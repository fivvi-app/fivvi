import { and, asc, eq, gte, ne, sql } from 'drizzle-orm';
import {
  authUsers,
  classSeries,
  clients,
  groupClasses,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerProfiles,
} from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';
import { findLocation, type LocationView } from './locations.ts';

// The sessions of a workspace (F020, spec #425), through a workspace scope: the one scheduling
// engine that private sessions, group classes (F021) and Open Gym (F034) share. The rules (who may
// plan for whom, time zones and DST, durations, the default location) are in `packages/domain`
// (`planPrivateSession`); these functions store and read what the rules decided and know nothing
// of them.
//
// Seams for the specs that build on this one (F013, F014 calendars; F023 double booking; F025
// attendance; F026 cancellations): a session is read with its participants (`findSession`), a
// listing by time or by trainer is a new function here over the indexes of `sessions`, and a
// change takes the version it read and raises it (`version`), so a stale write changes nothing.

/** The kinds of session and their statuses, as the table holds them. */
export type SessionType = (typeof sessions.type.enumValues)[number];
export type SessionStatus = (typeof sessions.status.enumValues)[number];
export type AttendanceStatus = (typeof sessionParticipants.attendanceStatus.enumValues)[number];

export interface SessionParticipantView {
  readonly clientId: string;
  readonly name: string;
  readonly attendanceStatus: AttendanceStatus;
}

/** The trainer of a session: the team-member ID (what the API calls a trainer) and the account's name. */
export interface SessionTrainerView {
  readonly id: string;
  readonly name: string;
}

/** The class a class date was scheduled from, by name (F021): the viewer's language picks one. */
export interface SessionGroupClassView {
  readonly id: string;
  readonly nameNl: string;
  readonly nameEn: string | null;
}

/**
 * The weekly series a class date belongs to (F022): enough for "Part of: Kracht, every Tuesday
 * 18:00" and "Changed from the series: time". The rule is the series' weekly rule text.
 */
export interface SessionSeriesView {
  readonly id: string;
  readonly rrule: string;
  /** The series' wall-clock start, `HH:mm`. */
  readonly localStartTime: string;
  /** The local date in the rule this session stands for, `YYYY-MM-DD`. */
  readonly occurrenceDate: string;
  /** What was changed on this date alone: `time`, `trainer`, `capacity`, `location`. */
  readonly detachedFields: string[];
}

/** A session as the team sees it: instants in UTC, the location, the trainer and who takes part. */
export interface SessionView {
  readonly id: string;
  readonly type: SessionType;
  readonly status: SessionStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  /** Raised by every change; a change says the version it read. Starts at 1. */
  readonly version: number;
  readonly location: LocationView;
  /** `null` when the session has no trainer (an Open Gym, or the trainer's profile ended). */
  readonly trainer: SessionTrainerView | null;
  /** The class of a class date (F021); `null` for the other kinds. */
  readonly groupClass: SessionGroupClassView | null;
  /** The weekly series of a class date (F022); `null` for a date on its own and for the other kinds. */
  readonly series: SessionSeriesView | null;
  /** In the order they were added. */
  readonly participants: SessionParticipantView[];
  /**
   * Who changed the session last: its planner, then whoever rescheduled it (AC8). `null` when
   * that team member has been removed. Not part of what the API shows of a session; it names the
   * person when a stale change is refused.
   */
  readonly lastChangedBy: SessionTrainerView | null;
}

/** A session in a client's list of upcoming sessions (TW-02, TM-03): when, and with whom. */
export interface UpcomingSessionView {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** `null` when the trainer's profile ended. */
  readonly trainer: SessionTrainerView | null;
}

/** What a new private session is made of: the decisions of `planPrivateSession`, and the client. */
export interface NewPrivateSession {
  /** The trainer profile (`findTrainer`), not the team-member ID. */
  readonly trainerProfileId: string;
  readonly locationId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly clientId: string;
  /** The team-member record of the person who plans it. */
  readonly createdByTeamMemberId: string;
}

/**
 * One session of the scope's workspace with its participants, trainer and location; `undefined`
 * when the workspace has no such session (RLS shows no row of another workspace).
 */
export async function findSession(
  scope: WorkspaceScope,
  sessionId: string,
): Promise<SessionView | undefined> {
  const db = executorOf(scope);
  const [row] = await db
    .select({
      id: sessions.id,
      type: sessions.type,
      status: sessions.status,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      capacity: sessions.capacity,
      version: sessions.version,
      locationId: sessions.locationId,
      trainerProfileId: sessions.trainerProfileId,
      updatedByTeamMemberId: sessions.updatedByTeamMemberId,
      groupClassId: sessions.groupClassId,
      seriesId: sessions.seriesId,
      occurrenceDate: sessions.occurrenceDate,
      detachedFields: sessions.detachedFields,
    })
    .from(sessions)
    .where(and(eq(sessions.organizationId, scope.workspaceId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!row) return undefined;
  const {
    locationId,
    trainerProfileId,
    updatedByTeamMemberId,
    groupClassId,
    seriesId,
    occurrenceDate,
    detachedFields,
    ...session
  } = row;
  const location = await findLocation(scope, locationId);
  // The composite foreign key keeps the location in the workspace and not null: it is there.
  if (!location) throw new Error('The location of a session was not found.');
  const [trainer] = trainerProfileId
    ? await db
        .select({ id: teamMembers.id, name: authUsers.name })
        .from(trainerProfiles)
        .innerJoin(
          teamMembers,
          and(
            eq(teamMembers.organizationId, trainerProfiles.organizationId),
            eq(teamMembers.id, trainerProfiles.teamMemberId),
          ),
        )
        .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
        .where(
          and(
            eq(trainerProfiles.organizationId, scope.workspaceId),
            eq(trainerProfiles.id, trainerProfileId),
          ),
        )
    : [];
  const [lastChangedBy] = updatedByTeamMemberId
    ? await db
        .select({ id: teamMembers.id, name: authUsers.name })
        .from(teamMembers)
        .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
        .where(
          and(
            eq(teamMembers.organizationId, scope.workspaceId),
            eq(teamMembers.id, updatedByTeamMemberId),
          ),
        )
    : [];
  const [groupClass] = groupClassId
    ? await db
        .select({ id: groupClasses.id, nameNl: groupClasses.nameNl, nameEn: groupClasses.nameEn })
        .from(groupClasses)
        .where(
          and(
            eq(groupClasses.organizationId, scope.workspaceId),
            eq(groupClasses.id, groupClassId),
          ),
        )
    : [];
  const [series] =
    seriesId && occurrenceDate
      ? await db
          .select({
            id: classSeries.id,
            rrule: classSeries.rrule,
            localStartTime: classSeries.localStartTime,
          })
          .from(classSeries)
          .where(
            and(eq(classSeries.organizationId, scope.workspaceId), eq(classSeries.id, seriesId)),
          )
      : [];
  const participants = await db
    .select({
      clientId: clients.id,
      name: clients.name,
      attendanceStatus: sessionParticipants.attendanceStatus,
    })
    .from(sessionParticipants)
    .innerJoin(
      clients,
      and(
        eq(clients.organizationId, sessionParticipants.organizationId),
        eq(clients.id, sessionParticipants.clientId),
      ),
    )
    .where(
      and(
        eq(sessionParticipants.organizationId, scope.workspaceId),
        eq(sessionParticipants.sessionId, sessionId),
      ),
    )
    .orderBy(asc(sessionParticipants.createdAt), asc(sessionParticipants.id));
  return {
    ...session,
    location,
    trainer: trainer ?? null,
    groupClass: groupClass ?? null,
    series: series
      ? {
          ...series,
          localStartTime: series.localStartTime.slice(0, 5),
          occurrenceDate: occurrenceDate ?? '',
          detachedFields,
        }
      : null,
    participants,
    lastChangedBy: lastChangedBy ?? null,
  };
}

/**
 * Stores a private session of the scope's workspace with its one participant, the client, `booked`
 * (version 1, `scheduled`), and returns it as `findSession` shows it. The caller has decided it is
 * allowed (`planPrivateSession`). The session and its place are written in the request's
 * transaction: they stand or fall with the rest of the request.
 */
export async function createPrivateSession(
  scope: WorkspaceScope,
  input: NewPrivateSession,
): Promise<SessionView> {
  const db = executorOf(scope);
  const [created] = await db
    .insert(sessions)
    .values({
      organizationId: scope.workspaceId,
      type: 'private',
      trainerProfileId: input.trainerProfileId,
      locationId: input.locationId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: input.capacity,
      createdByTeamMemberId: input.createdByTeamMemberId,
      // The planner is the first to have changed it.
      updatedByTeamMemberId: input.createdByTeamMemberId,
    })
    .returning({ id: sessions.id });
  if (!created) throw new Error('The session was not stored.');
  await db.insert(sessionParticipants).values({
    organizationId: scope.workspaceId,
    sessionId: created.id,
    clientId: input.clientId,
  });
  const session = await findSession(scope, created.id);
  if (!session) throw new Error('The session was not found after it was stored.');
  return session;
}

/** What a reschedule changes: the new instants, the version the person saw, and who changes it. */
export interface SessionReschedule {
  readonly sessionId: string;
  /** The version the person read. The session is changed only if it still has it. */
  readonly expectedVersion: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The team-member record of the person who reschedules. */
  readonly changedByTeamMemberId: string;
}

/**
 * Moves a session of the scope's workspace to the new instants, raises its version and records who
 * did it, and returns it as `findSession` shows it. The location, the trainer and the places stay.
 * The caller has decided it is allowed (`reschedulePrivateSession`). The change is one statement
 * that matches the version, so of two changes from the same version exactly one is stored: the
 * second waits for the first's row lock and then matches nothing. `undefined` when the version is
 * no longer the session's (or the workspace has no such session): nothing changed, and the caller
 * reads the session to tell which.
 */
export async function rescheduleSession(
  scope: WorkspaceScope,
  input: SessionReschedule,
): Promise<SessionView | undefined> {
  const db = executorOf(scope);
  const [changed] = await db
    .update(sessions)
    .set({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      version: sql`${sessions.version} + 1`,
      updatedByTeamMemberId: input.changedByTeamMemberId,
    })
    .where(
      and(
        eq(sessions.organizationId, scope.workspaceId),
        eq(sessions.id, input.sessionId),
        eq(sessions.version, input.expectedVersion),
      ),
    )
    .returning({ id: sessions.id });
  if (!changed) return undefined;
  return findSession(scope, changed.id);
}

/**
 * The next sessions of a client of the scope's workspace, soonest first: private sessions that are
 * still scheduled and start at `now` or later, where the client's place is not cancelled. Empty for
 * a client without any, and for a client of another workspace (RLS shows none of its rows).
 */
export async function listUpcomingSessionsOfClient(
  scope: WorkspaceScope,
  clientId: string,
  options: { now: Date; limit: number },
): Promise<UpcomingSessionView[]> {
  const db = executorOf(scope);
  const rows = await db
    .select({
      id: sessions.id,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      trainerId: teamMembers.id,
      trainerName: authUsers.name,
    })
    .from(sessionParticipants)
    .innerJoin(
      sessions,
      and(
        eq(sessions.organizationId, sessionParticipants.organizationId),
        eq(sessions.id, sessionParticipants.sessionId),
      ),
    )
    .leftJoin(
      trainerProfiles,
      and(
        eq(trainerProfiles.organizationId, sessions.organizationId),
        eq(trainerProfiles.id, sessions.trainerProfileId),
      ),
    )
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, trainerProfiles.organizationId),
        eq(teamMembers.id, trainerProfiles.teamMemberId),
      ),
    )
    .leftJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(
      and(
        eq(sessionParticipants.organizationId, scope.workspaceId),
        eq(sessionParticipants.clientId, clientId),
        ne(sessionParticipants.attendanceStatus, 'cancelled'),
        eq(sessions.type, 'private'),
        eq(sessions.status, 'scheduled'),
        gte(sessions.startsAt, options.now),
      ),
    )
    .orderBy(asc(sessions.startsAt), asc(sessions.id))
    .limit(options.limit);
  return rows.map(({ trainerId, trainerName, ...session }) => ({
    ...session,
    trainer: trainerId ? { id: trainerId, name: trainerName ?? '' } : null,
  }));
}
