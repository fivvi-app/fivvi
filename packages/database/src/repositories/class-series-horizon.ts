import { and, asc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { classSeries, locations, sessions } from '../schema/index.ts';

// What the daily task that keeps class series 12 weeks ahead needs (F022, ticket #453, E012). It
// runs as the cron role, which sets no workspace context: its table privileges and its policies
// (`cron_class_series_policies`) let it read every series, move `materialized_until` forward, add
// dates (never read, change or delete one) and read the key columns of a location. Which dates are
// missing is the domain's (`materialize`); these functions only read and store.

/** A series as the task needs it: the facts of the rule and the defaults its dates copy. */
export interface SeriesToExtend {
  readonly id: string;
  readonly workspaceId: string;
  readonly groupClassId: string;
  /** `FREQ=WEEKLY;BYDAY=XX`. */
  readonly rrule: string;
  /** The wall-clock start, `HH:mm`. */
  readonly localStartTime: string;
  readonly durationMinutes: number;
  readonly timeZone: string;
  readonly trainerProfileId: string | null;
  readonly capacity: number;
  /** Local dates, `YYYY-MM-DD`. */
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly materializedUntil: string;
}

/** A date to add to a series: the decision of `materialize` with the series' defaults. */
export interface SeriesDateToAdd {
  readonly workspaceId: string;
  readonly seriesId: string;
  readonly groupClassId: string;
  readonly locationId: string;
  readonly occurrenceDate: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly trainerProfileId: string | null;
  readonly capacity: number;
}

const columns = {
  id: classSeries.id,
  workspaceId: classSeries.organizationId,
  groupClassId: classSeries.groupClassId,
  rrule: classSeries.rrule,
  localStartTime: classSeries.localStartTime,
  durationMinutes: classSeries.durationMinutes,
  timeZone: classSeries.timeZone,
  trainerProfileId: classSeries.trainerProfileId,
  capacity: classSeries.capacity,
  startsOn: classSeries.startsOn,
  endsOn: classSeries.endsOn,
  materializedUntil: classSeries.materializedUntil,
};

/** The database's `time` is `HH:mm:ss`; the series speaks `HH:mm`. */
const viewOf = (row: Omit<SeriesToExtend, 'localStartTime'> & { localStartTime: string }) => ({
  ...row,
  localStartTime: row.localStartTime.slice(0, 5),
});

/**
 * The IDs of the series, of every workspace, that are filled to a day before `before` and still
 * have days to fill (no end, or an end after the day they are filled to), the furthest behind
 * first. `before` is the widest end of any horizon today (the series' own zone decides the exact
 * one); the caller reads each series again with `lockClassSeries`.
 */
export async function listClassSeriesBehind(
  db: DatabaseExecutor,
  before: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: classSeries.id })
    .from(classSeries)
    .where(
      and(
        lt(classSeries.materializedUntil, before),
        or(isNull(classSeries.endsOn), gt(classSeries.endsOn, classSeries.materializedUntil)),
      ),
    )
    .orderBy(asc(classSeries.materializedUntil), asc(classSeries.id));
  return rows.map((row) => row.id);
}

/**
 * Reads a series and locks its row until the end of the transaction, so a change of the series
 * by an Owner waits for the task, or the task for it. `undefined` when it is gone.
 */
export async function lockClassSeries(
  db: DatabaseExecutor,
  seriesId: string,
): Promise<SeriesToExtend | undefined> {
  const [row] = await db
    .select(columns)
    .from(classSeries)
    .where(eq(classSeries.id, seriesId))
    .for('update');
  return row ? viewOf(row) : undefined;
}

/** The ID of the workspace's default location, which the dates take; `undefined` when it has none. */
export async function findDefaultLocationId(
  db: DatabaseExecutor,
  workspaceId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.organizationId, workspaceId), eq(locations.isDefault, true)));
  return row?.id;
}

/**
 * Adds the dates as class dates (`group` sessions, `scheduled`, version 1, no participants, planned
 * by nobody) and returns how many were new. A date the series has already, whatever became of it
 * (cancelled, changed, booked), is left exactly as it is: the unique key `(series_id,
 * occurrence_date)` refuses it and `ON CONFLICT DO NOTHING` skips it. The cron role cannot read
 * sessions, so the count is the statement's.
 */
export async function addSeriesDatesIfMissing(
  db: DatabaseExecutor,
  dates: readonly SeriesDateToAdd[],
): Promise<number> {
  if (dates.length === 0) return 0;
  const result = await db
    .insert(sessions)
    .values(
      dates.map((date) => ({
        organizationId: date.workspaceId,
        type: 'group' as const,
        groupClassId: date.groupClassId,
        seriesId: date.seriesId,
        locationId: date.locationId,
        occurrenceDate: date.occurrenceDate,
        startsAt: date.startsAt,
        endsAt: date.endsAt,
        trainerProfileId: date.trainerProfileId,
        capacity: date.capacity,
        createdByTeamMemberId: null,
      })),
    )
    .onConflictDoNothing();
  return result.rowCount ?? 0;
}

/**
 * Says the series is filled to `day`. Only that column moves (the privilege allows no other, and
 * the version stays: it is the Owner's changes that raise it).
 */
export async function setClassSeriesMaterializedUntil(
  db: DatabaseExecutor,
  seriesId: string,
  day: string,
): Promise<void> {
  await db
    .update(classSeries)
    .set({ materializedUntil: day, updatedAt: sql`now()` })
    .where(eq(classSeries.id, seriesId));
}
