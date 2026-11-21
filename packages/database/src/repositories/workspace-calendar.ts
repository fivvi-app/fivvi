import { and, asc, eq, gte, lt } from 'drizzle-orm';
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
import type { SessionSeriesView } from './sessions.ts';

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
  /** Raised by every change; a drag move says the version it saw. */
  readonly version: number;
  /** The places taken: participants whose place is not cancelled. */
  readonly booked: number;
  readonly location: LocationView;
  /** The trainer: the team-member ID (what the API calls a trainer) and the account's name; `null` for *Trainer nodig*. */
  readonly trainer: { readonly id: string; readonly name: string } | null;
  readonly clients: PersonalSessionRow['clients'];
  readonly clientName: string | null;
  /** The names of the class of a group session; `null` for any other kind. */
  readonly classNameNl: string | null;
  readonly classNameEn: string | null;
  /** The weekly series of a class date (F022) and what was changed on this date alone. */
  readonly series: SessionSeriesView | null;
}

/**
 * The sessions of the scope's workspace that start from `window.from` up to, not including,
 * `window.to`, in time order, cancelled ones included (the calendar shows them struck through).
 * Three queries: the sessions with their location, trainer, class and series, and their places.
 */
export async function listWorkspaceCalendar(
  scope: WorkspaceScope,
  window: { readonly from: Date; readonly to: Date },
): Promise<WorkspaceCalendarRow[]> {
  const rows = await executorOf(scope)
    .select({
      id: sessions.id,
      type: sessions.type,
      status: sessions.status,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      capacity: sessions.capacity,
      version: sessions.version,
      location: locationColumns,
      trainerId: teamMembers.id,
      trainerName: authUsers.name,
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
        lt(sessions.startsAt, window.to),
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
    version: row.version,
    location: toLocationView(row.location),
    trainer: row.trainerId ? { id: row.trainerId, name: row.trainerName ?? '' } : null,
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
