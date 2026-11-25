import {
  addSeriesDatesIfMissing,
  findDefaultLocationId,
  listClassSeriesBehind,
  lockClassSeries,
  setClassSeriesMaterializedUntil,
} from '@fivvi/database';
import { addDays, horizonEnd, localDateOf, materialize } from '@fivvi/domain';
import type { CronTask, CronTaskContext, CronTaskReport } from './task.ts';

// The daily task that keeps every class series 12 weeks ahead (F022, spec #428, ADR-012; E012).
// A series is filled to `materialized_until`; when that is before the end of today's horizon in
// the series' own zone, the missing dates are added, across all workspaces, through the cron role
// (no request context). The rules are the domain's: `materialize` says which dates of the window
// are missing; the unique key of the series' dates refuses a date that exists, so a second run
// adds nothing and a cancelled or changed date is never made again or reset.
//
// One transaction (savepoint) per series: a series that fails is rolled back alone, reported to
// Sentry with the task name and the series ID, and the others still get their dates. The failed
// series is found again the next day, since its `materialized_until` did not move.

export const EXTEND_CLASS_SERIES_HORIZON = 'extend-class-series-horizon';

/** A series that failed is reported by its ID and the kind of error, never what was in it. */
class ExtendSeriesError extends Error {
  constructor(kind: string) {
    super(`A class series could not be extended: ${kind}.`);
    this.name = 'ExtendSeriesError';
  }
}

/**
 * Adds the missing dates of one series and moves `materialized_until`; returns how many dates were
 * made, or `undefined` for a series that has nothing to do (gone, or filled far enough).
 */
function extendSeries(ctx: CronTaskContext, seriesId: string): Promise<number | undefined> {
  return ctx.db.transaction(async (tx) => {
    // The row is locked from here: an Owner's change of the series waits until this one is done.
    const series = await lockClassSeries(tx, seriesId);
    if (!series) return undefined;
    const today = localDateOf(ctx.now, series.timeZone);
    const horizon = horizonEnd(today);
    // The calendar is filled to a day of the horizon; a series that ends sooner stops there.
    const through = series.endsOn !== null && series.endsOn < horizon ? series.endsOn : horizon;
    if (series.materializedUntil >= through) return undefined;
    // Dates in the past are not made again, whatever the task missed while it did not run.
    const nextDay = addDays(series.materializedUntil, 1);
    const from = nextDay > today ? nextDay : today;
    const missing = materialize(series, [], { from, to: through });
    const locationId = await findDefaultLocationId(tx, series.workspaceId);
    if (locationId === undefined)
      throw new ExtendSeriesError('the workspace has no default location');
    const added = await addSeriesDatesIfMissing(
      tx,
      missing.toInsert.map((occurrence) => ({
        workspaceId: series.workspaceId,
        seriesId: series.id,
        groupClassId: series.groupClassId,
        locationId,
        occurrenceDate: occurrence.occurrenceDate,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        trainerProfileId: series.trainerProfileId,
        capacity: series.capacity,
        level: series.level,
      })),
    );
    await setClassSeriesMaterializedUntil(tx, series.id, through);
    return added;
  });
}

async function run(ctx: CronTaskContext): Promise<CronTaskReport> {
  // The widest end of any horizon today: a zone is at most a day ahead of the date in UTC.
  const widest = horizonEnd(addDays(localDateOf(ctx.now, 'UTC'), 1));
  let extended = 0;
  let dates = 0;
  let failed = 0;
  for (const seriesId of await listClassSeriesBehind(ctx.db, widest)) {
    try {
      const added = await extendSeries(ctx, seriesId);
      if (added === undefined) continue;
      extended += 1;
      dates += added;
    } catch (error) {
      failed += 1;
      // The kind of the error only: its message could hold what the statement held.
      const reported =
        error instanceof ExtendSeriesError
          ? error
          : new ExtendSeriesError(error instanceof Error ? error.name : 'a non-error value');
      ctx.errorReporter.captureError(reported, {
        tags: {
          'cron.task': EXTEND_CLASS_SERIES_HORIZON,
          'cron.run_id': ctx.runId,
          'class_series.id': seriesId,
        },
      });
    }
  }
  return { counts: { extended, dates, failed } };
}

export function createClassSeriesHorizonTask(): CronTask {
  return { name: EXTEND_CLASS_SERIES_HORIZON, kind: 'daily', run };
}
