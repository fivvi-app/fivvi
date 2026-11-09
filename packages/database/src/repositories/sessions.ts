import { and, asc, eq } from 'drizzle-orm';
import {
  authUsers,
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
  /** In the order they were added. */
  readonly participants: SessionParticipantView[];
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
      groupClassId: sessions.groupClassId,
    })
    .from(sessions)
    .where(and(eq(sessions.organizationId, scope.workspaceId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!row) return undefined;
  const { locationId, trainerProfileId, groupClassId, ...session } = row;
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
    participants,
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
