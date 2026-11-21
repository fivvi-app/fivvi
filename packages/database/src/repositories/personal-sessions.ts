import { and, asc, eq, gte, inArray, lt, min } from 'drizzle-orm';
import {
  clients,
  groupClasses,
  locations,
  organizations,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerProfiles,
} from '../schema/index.ts';
import { executorOf, type TenantScope, type WorkspaceScope } from '../tenant-scope.ts';
import { type LocationView, locationColumns, toLocationView } from './locations.ts';
import type { AttendanceStatus, SessionStatus, SessionType } from './sessions.ts';

// The personal read model of a trainer (F013, spec #457): the sessions whose current trainer is
// the signed-in account, in the workspaces it trains in. No new tables. The queries here are
// each about ONE workspace (a workspace scope, and every query names `organization_id`); the
// account's other workspaces are read the same way, one after the other, in a context of their
// own each (`inEachWorkspace` of `tenant-scope.ts`, ADR-006). Nothing here spans workspaces and
// nothing uses the privileged path. The rules (ordering, the next item, the summary) are in
// `packages/domain` (`mergePersonalDay`).

/** A workspace the account trains in: what an item of the personal view says about where it is. */
export interface PersonalWorkspace {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** The workspace's IANA time zone. */
  readonly timeZone: string;
}

/**
 * The workspaces where the scope's account has a team role *and* a trainer profile (F005), by
 * name: the ones whose sessions it can be assigned to. An Owner who does not train is not listed,
 * nor a workspace the account is only a client of, nor one outside the scope's context.
 */
export function listMyTrainingWorkspaces(scope: TenantScope): Promise<PersonalWorkspace[]> {
  const { accountId, workspaceIds } = scope.context;
  if (workspaceIds.length === 0) return Promise.resolve([]);
  return executorOf(scope)
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timeZone: organizations.timeZone,
    })
    .from(organizations)
    .innerJoin(teamMembers, eq(teamMembers.organizationId, organizations.id))
    .innerJoin(
      trainerProfiles,
      and(
        eq(trainerProfiles.organizationId, teamMembers.organizationId),
        eq(trainerProfiles.teamMemberId, teamMembers.id),
      ),
    )
    .where(and(eq(teamMembers.accountId, accountId), inArray(organizations.id, [...workspaceIds])))
    .orderBy(asc(organizations.name), asc(organizations.slug), asc(organizations.id));
}

/** A session of the account, as one row of its day or week. */
export interface PersonalSessionRow {
  readonly id: string;
  readonly type: SessionType;
  readonly status: SessionStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  /** The places taken: participants whose place is not cancelled. */
  readonly booked: number;
  readonly location: LocationView;
  /**
   * The clients of a private session, in the order they were added: the ones whose place is not
   * cancelled (a duo has two, F066), else all of them (a cancelled session keeps its names). Empty
   * for any other kind (a class names no client).
   */
  readonly clients: readonly { readonly clientId: string; readonly name: string }[];
  /**
   * The names of `clients` joined with ` & ` (*Lisa & Eva*, F066); `null` without any: a class
   * names no client.
   */
  readonly clientName: string | null;
  /**
   * The names of the class of a group session (F021), `null` for any other kind: the Dutch name
   * and the English one when it has one. The viewer's language picks between them
   * (`pickContentLanguage`, `packages/i18n`); that is not decided here.
   */
  readonly classNameNl: string | null;
  readonly classNameEn: string | null;
}

/**
 * The scope's account as a trainer of the scope's workspace: its trainer profile, as a subquery.
 * "Mine" is `sessions.trainer_profile_id` in this: a session whose trainer was cleared (the
 * profile ended) is nobody's.
 */
function myTrainerProfile(scope: WorkspaceScope) {
  return executorOf(scope)
    .select({ id: trainerProfiles.id })
    .from(trainerProfiles)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, trainerProfiles.organizationId),
        eq(teamMembers.id, trainerProfiles.teamMemberId),
      ),
    )
    .where(
      and(
        eq(trainerProfiles.organizationId, scope.workspaceId),
        eq(teamMembers.accountId, scope.context.accountId),
      ),
    );
}

/**
 * The sessions the scope's account is the current trainer of in the scope's workspace, starting
 * from `window.from` up to, not including, `window.to`, in time order. Cancelled ones stay (the
 * calendars show them struck through). Two queries: the sessions with their location and class, and
 * their participants.
 */
export async function listMySessions(
  scope: WorkspaceScope,
  window: { readonly from: Date; readonly to: Date },
): Promise<PersonalSessionRow[]> {
  const db = executorOf(scope);
  const rows = await db
    .select({
      id: sessions.id,
      type: sessions.type,
      status: sessions.status,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      capacity: sessions.capacity,
      location: locationColumns,
      classNameNl: groupClasses.nameNl,
      classNameEn: groupClasses.nameEn,
    })
    .from(sessions)
    .innerJoin(
      locations,
      and(
        eq(locations.organizationId, sessions.organizationId),
        eq(locations.id, sessions.locationId),
      ),
    )
    .leftJoin(
      groupClasses,
      and(
        eq(groupClasses.organizationId, sessions.organizationId),
        eq(groupClasses.id, sessions.groupClassId),
      ),
    )
    .where(
      and(
        eq(sessions.organizationId, scope.workspaceId),
        inArray(sessions.trainerProfileId, myTrainerProfile(scope)),
        gte(sessions.startsAt, window.from),
        lt(sessions.startsAt, window.to),
      ),
    )
    .orderBy(asc(sessions.startsAt), asc(sessions.endsAt), asc(sessions.id));
  if (rows.length === 0) return [];
  const places = await listSessionPlaces(
    scope,
    rows.map((row) => row.id),
  );
  return rows.map(({ location, ...row }) => ({
    ...row,
    ...placesShown(row.type, places.get(row.id) ?? []),
    location: toLocationView(location),
  }));
}

/** A client's place in a session, as the calendars read it. */
export interface SessionPlace {
  readonly clientId: string;
  readonly name: string;
  readonly attendanceStatus: AttendanceStatus;
}

/**
 * The places of the sessions of the scope's workspace, by session ID, in the order they were added.
 * Shared by the personal read model (F013) and the workspace calendar (F014): both name the clients
 * of a private session and count the places of a class the same way.
 */
export async function listSessionPlaces(
  scope: WorkspaceScope,
  sessionIds: readonly string[],
): Promise<Map<string, SessionPlace[]>> {
  const bySession = new Map<string, SessionPlace[]>();
  if (sessionIds.length === 0) return bySession;
  const participants = await executorOf(scope)
    .select({
      sessionId: sessionParticipants.sessionId,
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
        inArray(sessionParticipants.sessionId, [...sessionIds]),
      ),
    )
    .orderBy(asc(sessionParticipants.createdAt), asc(sessionParticipants.id));
  for (const { sessionId, ...place } of participants) {
    bySession.set(sessionId, [...(bySession.get(sessionId) ?? []), place]);
  }
  return bySession;
}

/**
 * What a session shows of its places: the places taken (not cancelled) and, for a private session,
 * its clients: the ones whose place is not cancelled, else all of them, so a duo that lost one
 * client reads as the one-client session it has become (F066, AC7) and a cancelled session keeps
 * its names. A class names no client.
 */
export function placesShown(
  type: SessionType,
  places: readonly SessionPlace[],
): Pick<PersonalSessionRow, 'booked' | 'clients' | 'clientName'> {
  const active = places.filter((place) => place.attendanceStatus !== 'cancelled');
  const shown = type === 'private' ? (active.length > 0 ? active : places) : [];
  return {
    booked: active.length,
    clients: shown.map((place) => ({ clientId: place.clientId, name: place.name })),
    clientName: shown.length > 0 ? shown.map((place) => place.name).join(' & ') : null,
  };
}

/**
 * The start of the first session at or after `after` that the scope's account is the current
 * trainer of in the scope's workspace and that takes place (a cancelled one is not "next");
 * `undefined` when there is none.
 */
export async function findMyNextSessionStart(
  scope: WorkspaceScope,
  after: Date,
): Promise<Date | undefined> {
  const [row] = await executorOf(scope)
    .select({ startsAt: min(sessions.startsAt) })
    .from(sessions)
    .where(
      and(
        eq(sessions.organizationId, scope.workspaceId),
        inArray(sessions.trainerProfileId, myTrainerProfile(scope)),
        eq(sessions.status, 'scheduled'),
        gte(sessions.startsAt, after),
      ),
    );
  return row?.startsAt ?? undefined;
}

/** Whether the scope's account is the current trainer of any session, past or future, of the scope's workspace. */
export async function hasMySession(scope: WorkspaceScope): Promise<boolean> {
  const found = await executorOf(scope)
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.organizationId, scope.workspaceId),
        inArray(sessions.trainerProfileId, myTrainerProfile(scope)),
      ),
    )
    .limit(1);
  return found.length > 0;
}
