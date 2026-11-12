import { and, asc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { authUsers, classSeries, sessions, teamMembers, trainerProfiles } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';
import type { SessionStatus } from './sessions.ts';

// The weekly series of a class and their dates (F022, spec #428), through a workspace scope. The
// rules (the rule's syntax, expansion with daylight saving time, materializing, the edit scopes)
// are in `packages/domain` (`expandSeries`, `materialize`, `applyThisAndFollowing`); these functions
// store and read what the rules decided. A date of a series is an ordinary `group` session
// (`routes/group-classes.ts`, F021) that points at its series (`series_id`, `occurrence_date`).

/** A series as the Owner sees it. */
export interface ClassSeriesView {
  readonly id: string;
  readonly groupClassId: string;
  /** The weekly rule as the domain wrote it (`weeklyRule`). */
  readonly rrule: string;
  /** The wall-clock start, `HH:mm`. */
  readonly localStartTime: string;
  readonly durationMinutes: number;
  readonly timeZone: string;
  /** The trainer profile, what `trainer_profile_id` holds; `null` for *Trainer nodig*. */
  readonly trainerProfileId: string | null;
  /** The usual trainer: the team-member ID (what the API calls a trainer) and the account's name. */
  readonly trainer: { readonly id: string; readonly name: string } | null;
  readonly capacity: number;
  /** Local dates, `YYYY-MM-DD`. */
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly materializedUntil: string;
  readonly version: number;
}

/** What a new series is made of: the decisions of the domain rules. */
export interface NewClassSeries {
  readonly groupClassId: string;
  readonly rrule: string;
  readonly localStartTime: string;
  readonly durationMinutes: number;
  readonly timeZone: string;
  readonly trainerProfileId: string | null;
  readonly capacity: number;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly materializedUntil: string;
}

/** The fields of a series to change; a field left out stays. Raises the version. */
export type ClassSeriesChanges = Partial<
  Pick<
    NewClassSeries,
    | 'localStartTime'
    | 'durationMinutes'
    | 'trainerProfileId'
    | 'capacity'
    | 'startsOn'
    | 'endsOn'
    | 'materializedUntil'
  >
>;

/** The database's `time` is `HH:mm:ss`; the series speaks `HH:mm`. */
const hhmm = (time: string) => time.slice(0, 5);

const seriesColumns = {
  id: classSeries.id,
  groupClassId: classSeries.groupClassId,
  rrule: classSeries.rrule,
  localStartTime: classSeries.localStartTime,
  durationMinutes: classSeries.durationMinutes,
  timeZone: classSeries.timeZone,
  trainerProfileId: classSeries.trainerProfileId,
  trainerTeamMemberId: teamMembers.id,
  trainerName: authUsers.name,
  capacity: classSeries.capacity,
  startsOn: classSeries.startsOn,
  endsOn: classSeries.endsOn,
  materializedUntil: classSeries.materializedUntil,
  version: classSeries.version,
};

interface SeriesRow extends Omit<ClassSeriesView, 'trainer'> {
  readonly trainerTeamMemberId: string | null;
  readonly trainerName: string | null;
}

function viewOf(row: SeriesRow): ClassSeriesView {
  const { trainerTeamMemberId, trainerName, localStartTime, ...rest } = row;
  return {
    ...rest,
    localStartTime: hhmm(localStartTime),
    trainer:
      trainerTeamMemberId === null ? null : { id: trainerTeamMemberId, name: trainerName ?? '' },
  };
}

function selectSeries(scope: WorkspaceScope) {
  return executorOf(scope)
    .select(seriesColumns)
    .from(classSeries)
    .leftJoin(
      trainerProfiles,
      and(
        eq(trainerProfiles.organizationId, classSeries.organizationId),
        eq(trainerProfiles.id, classSeries.trainerProfileId),
      ),
    )
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, trainerProfiles.organizationId),
        eq(teamMembers.id, trainerProfiles.teamMemberId),
      ),
    )
    .leftJoin(authUsers, eq(authUsers.id, teamMembers.accountId));
}

/** One series of the scope's workspace; `undefined` when the workspace has none with that ID. */
export async function findClassSeries(
  scope: WorkspaceScope,
  seriesId: string,
): Promise<ClassSeriesView | undefined> {
  const [row] = await selectSeries(scope)
    .where(and(eq(classSeries.organizationId, scope.workspaceId), eq(classSeries.id, seriesId)))
    .limit(1);
  return row ? viewOf(row) : undefined;
}

/**
 * The series of a class that still has dates to come or running: no end, or an end on or after
 * `today` (a local date). In the order they start.
 */
export async function listActiveClassSeries(
  scope: WorkspaceScope,
  groupClassId: string,
  today: string,
): Promise<ClassSeriesView[]> {
  const rows = await selectSeries(scope)
    .where(
      and(
        eq(classSeries.organizationId, scope.workspaceId),
        eq(classSeries.groupClassId, groupClassId),
        or(isNull(classSeries.endsOn), gte(classSeries.endsOn, today)),
      ),
    )
    .orderBy(asc(classSeries.startsOn), asc(classSeries.id));
  return rows.map(viewOf);
}

/** Stores a series of the scope's workspace (version 1) and returns it as `findClassSeries` shows it. */
export async function createClassSeries(
  scope: WorkspaceScope,
  input: NewClassSeries,
): Promise<ClassSeriesView> {
  const [created] = await executorOf(scope)
    .insert(classSeries)
    .values({ organizationId: scope.workspaceId, ...input })
    .returning({ id: classSeries.id });
  if (!created) throw new Error('The series was not stored.');
  const stored = await findClassSeries(scope, created.id);
  if (!stored) throw new Error('The series was not found after it was stored.');
  return stored;
}

/** Changes the fields given of a series and raises its version; `undefined` when the workspace has no such series. */
export async function updateClassSeries(
  scope: WorkspaceScope,
  seriesId: string,
  changes: ClassSeriesChanges,
): Promise<ClassSeriesView | undefined> {
  const defined = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
  const updated = await executorOf(scope)
    .update(classSeries)
    .set({ ...defined, version: sql`${classSeries.version} + 1` })
    .where(and(eq(classSeries.organizationId, scope.workspaceId), eq(classSeries.id, seriesId)))
    .returning({ id: classSeries.id });
  if (updated.length === 0) return undefined;
  return findClassSeries(scope, seriesId);
}

/** A date a series already has: what the domain rules need to leave it alone or update it. */
export interface SeriesDateRow {
  readonly id: string;
  readonly occurrenceDate: string;
  readonly detachedFields: string[];
  readonly status: SessionStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly trainerProfileId: string | null;
  readonly capacity: number;
}

/** Every date of a series, whatever its status, by date. */
export async function listSeriesDates(
  scope: WorkspaceScope,
  seriesId: string,
): Promise<SeriesDateRow[]> {
  const rows = await executorOf(scope)
    .select({
      id: sessions.id,
      occurrenceDate: sessions.occurrenceDate,
      detachedFields: sessions.detachedFields,
      status: sessions.status,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      trainerProfileId: sessions.trainerProfileId,
      capacity: sessions.capacity,
    })
    .from(sessions)
    .where(and(eq(sessions.organizationId, scope.workspaceId), eq(sessions.seriesId, seriesId)))
    .orderBy(asc(sessions.occurrenceDate));
  return rows.flatMap((row) =>
    row.occurrenceDate === null ? [] : [{ ...row, occurrenceDate: row.occurrenceDate }],
  );
}

/** A date to make for a series: the decisions of `materialize`, the series' defaults and the default location. */
export interface NewSeriesDate {
  readonly occurrenceDate: string;
  readonly locationId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly trainerProfileId: string | null;
  readonly capacity: number;
  /** The team-member record of the person who plans it; `null` for none (the daily task). */
  readonly createdByTeamMemberId: string | null;
}

/**
 * Makes dates of a series as class dates (`group` sessions, version 1, `scheduled`, no
 * participants) in one statement; returns the IDs and days of the dates made. A date the series has already fails on the
 * unique key (`materialize` leaves existing dates out, so that is a bug or a race, not a case).
 */
export async function createSeriesDates(
  scope: WorkspaceScope,
  seriesId: string,
  groupClassId: string,
  dates: readonly NewSeriesDate[],
): Promise<{ readonly id: string; readonly occurrenceDate: string }[]> {
  if (dates.length === 0) return [];
  const created = await executorOf(scope)
    .insert(sessions)
    .values(
      dates.map((date) => ({
        organizationId: scope.workspaceId,
        type: 'group' as const,
        groupClassId,
        seriesId,
        ...date,
      })),
    )
    .returning({ id: sessions.id, occurrenceDate: sessions.occurrenceDate });
  return created.flatMap((row) =>
    row.occurrenceDate === null ? [] : [{ id: row.id, occurrenceDate: row.occurrenceDate }],
  );
}

/** Points the given dates (session IDs of the workspace) at another series. */
export async function moveDatesToSeries(
  scope: WorkspaceScope,
  sessionIds: readonly string[],
  seriesId: string,
): Promise<void> {
  if (sessionIds.length === 0) return;
  await executorOf(scope)
    .update(sessions)
    .set({ seriesId })
    .where(
      and(eq(sessions.organizationId, scope.workspaceId), inArray(sessions.id, [...sessionIds])),
    );
}

/** What one date that follows its series is written as: start, end, trainer, capacity and what still differs. */
export interface SeriesDateUpdate {
  readonly sessionId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly trainerProfileId: string | null;
  readonly capacity: number;
  readonly detachedFields: readonly string[];
  /** The version the writer read: the date is written only if it is still that one. Left out: always written. */
  readonly version?: number;
}

/**
 * Writes the given dates and raises the version of each, so a reader of the old one gets a
 * conflict. Returns the IDs of the dates that were not written because their version was no longer
 * the one the writer read (the caller refuses the whole change then, which rolls it back).
 */
export async function updateSeriesDates(
  scope: WorkspaceScope,
  updates: readonly SeriesDateUpdate[],
): Promise<string[]> {
  const db = executorOf(scope);
  const stale: string[] = [];
  for (const { sessionId, version, ...fields } of updates) {
    const written = await db
      .update(sessions)
      .set({
        startsAt: fields.startsAt,
        endsAt: fields.endsAt,
        trainerProfileId: fields.trainerProfileId,
        capacity: fields.capacity,
        detachedFields: [...fields.detachedFields],
        version: sql`${sessions.version} + 1`,
      })
      .where(
        and(
          eq(sessions.organizationId, scope.workspaceId),
          eq(sessions.id, sessionId),
          ...(version === undefined ? [] : [eq(sessions.version, version)]),
        ),
      )
      .returning({ id: sessions.id });
    if (written.length === 0) stale.push(sessionId);
  }
  return stale;
}
