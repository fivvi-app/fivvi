import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  authUsers,
  classSeries,
  groupClasses,
  locations,
  sessions,
  teamMembers,
  trainerProfiles,
} from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';
import { type LocationView, locationColumns, toLocationView } from './locations.ts';
import { listSessionPlaces, type PersonalSessionRow, placesShown } from './personal-sessions.ts';
import type { SessionLevel, SessionSeriesView } from './sessions.ts';

// The workspace calendar's read model (F014, spec #458): every session of ONE workspace in a
// window of time, whoever its trainer is. No new tables. The query is about the scope's workspace
// alone (a workspace scope, and every table is joined and filtered on `organization_id`), so a
// trainer's sessions in another workspace never come back, not even as a busy marker (AC2). The
// rules (the filters, the rows of a day, the open items) are in `packages/domain`
// (`workspace-calendar.ts`); this function only reads.

/** A session of the workspace, as one block of its calendar. Holds no note and no contact detail. */
export interface WorkspaceCalendarRow {
  readonly id: string;
  readonly type: PersonalSessionRow['type'];
  readonly status: PersonalSessionRow['status'];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  /** The level of a class date (F067); `null` is *Geen*, and what any other kind has. */
  readonly level: SessionLevel | null;
  /** Raised by every change; a drag move says the version it saw. */
  readonly version: number;
  /** The places taken: participants whose place is not cancelled. */
  readonly booked: number;
  readonly location: LocationView;
  /** The trainer: the team-member ID (what the API calls a trainer) and the account's name; `null` for *Trainer nodig*. */
  readonly trainer: { readonly id: string; readonly name: string } | null;
  readonly clients: PersonalSessionRow['clients'];
  readonly clientName: string | null;
  /** The class of a group session (F037 lists a class's dates); `null` for any other kind. */
  readonly groupClassId: string | null;
  /** The names of the class of a group session; `null` for any other kind. */
  readonly classNameNl: string | null;
  readonly classNameEn: string | null;
  /** The weekly series of a class date (F022) and what was changed on this date alone. */
  readonly series: SessionSeriesView | null;
}

/**
 * The sessions of the scope's workspace that start from `window.from` up to, not including,
 * `window.to` (no end when left out: the upcoming dates of one class, F037), in time order,
 * cancelled ones included (the calendar shows them struck through). `window.groupClassId` keeps
 * the dates of that class only.
 * Two queries: the sessions with their location, trainer, class and series, and their places.
 */
export async function listWorkspaceCalendar(
  scope: WorkspaceScope,
  window: { readonly from: Date; readonly to?: Date; readonly groupClassId?: string },
): Promise<WorkspaceCalendarRow[]> {
  const rows = await executorOf(scope)
    .select({
      id: sessions.id,
      type: sessions.type,
      status: sessions.status,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      capacity: sessions.capacity,
      level: sessions.level,
      version: sessions.version,
      location: locationColumns,
      // A trainer who was removed keeps their profile (F023): past sessions still show who it was.
      trainerId: sql<
        string | null
      >`coalesce(${teamMembers.id}, ${trainerProfiles.removedTeamMemberId})`,
      trainerName: sql<string | null>`coalesce(${authUsers.name}, ${trainerProfiles.removedName})`,
      groupClassId: sessions.groupClassId,
      classNameNl: groupClasses.nameNl,
      classNameEn: groupClasses.nameEn,
      seriesId: sessions.seriesId,
      occurrenceDate: sessions.occurrenceDate,
      detachedFields: sessions.detachedFields,
      seriesRule: classSeries.rrule,
      seriesStart: classSeries.localStartTime,
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
    .leftJoin(
      groupClasses,
      and(
        eq(groupClasses.organizationId, sessions.organizationId),
        eq(groupClasses.id, sessions.groupClassId),
      ),
    )
    .leftJoin(
      classSeries,
      and(
        eq(classSeries.organizationId, sessions.organizationId),
        eq(classSeries.id, sessions.seriesId),
      ),
    )
    .where(
      and(
        eq(sessions.organizationId, scope.workspaceId),
        gte(sessions.startsAt, window.from),
        window.to ? lt(sessions.startsAt, window.to) : undefined,
        window.groupClassId ? eq(sessions.groupClassId, window.groupClassId) : undefined,
      ),
    )
    .orderBy(asc(sessions.startsAt), asc(sessions.endsAt), asc(sessions.id));
  if (rows.length === 0) return [];
  const places = await listSessionPlaces(
    scope,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    capacity: row.capacity,
    level: row.level,
    version: row.version,
    location: toLocationView(row.location),
    trainer: row.trainerId ? { id: row.trainerId, name: row.trainerName ?? '' } : null,
    groupClassId: row.groupClassId,
    classNameNl: row.classNameNl,
    classNameEn: row.classNameEn,
    series:
      row.seriesId && row.occurrenceDate && row.seriesRule && row.seriesStart
        ? {
            id: row.seriesId,
            rrule: row.seriesRule,
            localStartTime: row.seriesStart.slice(0, 5),
            occurrenceDate: row.occurrenceDate,
            detachedFields: row.detachedFields,
          }
        : null,
    ...placesShown(row.type, places.get(row.id) ?? []),
  }));
}

/**
 * Whether the scope's workspace has any session at all, whoever its trainer is: past or planned,
 * cancelled or not. Tells a new workspace from one with nothing on the day (F014, #1544). Scoped
 * to the workspace alone, so another workspace's sessions never count.
 */
export async function hasWorkspaceSession(scope: WorkspaceScope): Promise<boolean> {
  const found = await executorOf(scope)
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.organizationId, scope.workspaceId))
    .limit(1);
  return found.length > 0;
}
