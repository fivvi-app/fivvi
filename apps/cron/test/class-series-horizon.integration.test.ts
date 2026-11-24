import {
  classSeries,
  createCronDatabase,
  createDatabase,
  type Database,
  type DatabaseClient,
  jobRuns,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClassSeries,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import { manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase } from '@fivvi/testing/database';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry } from '../src/registry.ts';
import { runCron } from '../src/runner.ts';

// F022 AC3 and AC9 (cron), ticket #453: the daily task `extend-class-series-horizon`, through
// E012's runner with a fake clock, as the cron role. Synthetic data only: John's Gym and Fit Studio.
// The series of the spec: Tuesday 18:00 Amsterdam, from 6 October 2026, filled to 22 December.

type TestDatabase = Awaited<ReturnType<typeof cloneTemplateDatabase>>;

let database: TestDatabase;
let admin: DatabaseClient;
let cronClient: DatabaseClient;
let db: Database;

beforeEach(async () => {
  database = await cloneTemplateDatabase();
  admin = createDatabase({ url: database.url, maxConnections: 2 });
  cronClient = createCronDatabase({ CRON_DATABASE_URL: database.cronUrl }, { maxConnections: 4 });
  db = cronClient.db;
});

afterEach(async () => {
  await cronClient.close();
  await admin.close();
  await database.drop();
});

const TASK = 'extend-class-series-horizon';
// 13 October 2026, 04:00 UTC (06:00 in Amsterdam).
const OCTOBER_13 = new Date('2026-10-13T04:00:00Z');

function cron(clock = manualClock(OCTOBER_13)) {
  const tasks = createRegistry({}).filter(({ name }) => name === TASK);
  const errorReporter = { captureError: vi.fn() };
  return {
    clock,
    tasks,
    errorReporter,
    run: () => runCron({ db, tasks, clock, log: () => {}, errorReporter }),
  };
}

/** A series with the dates of its first 12 weeks, as the API makes them (6 October to 22 December). */
async function seriesWithTwelveWeeks(
  workspaceId: string,
  options: Parameters<typeof addClassSeries>[1] extends infer O ? Partial<O> : never = {},
) {
  const series = await addClassSeries(admin.db, {
    workspaceId,
    materializedUntil: '2026-12-22',
    ...options,
  });
  // 18:00 in Amsterdam: 16:00 UTC while summer time lasts (to 25 October), 17:00 UTC after.
  for (const [date, startsAt] of [
    ['2026-10-06', '2026-10-06T16:00:00Z'],
    ['2026-10-13', '2026-10-13T16:00:00Z'],
    ['2026-10-20', '2026-10-20T16:00:00Z'],
    ['2026-10-27', '2026-10-27T17:00:00Z'],
    ['2026-12-22', '2026-12-22T17:00:00Z'],
  ] as const) {
    await addSession(admin.db, {
      workspaceId,
      groupClassId: series.groupClassId,
      participant: false,
      type: 'group',
      startsAt: new Date(startsAt),
      series: { id: series.id, occurrenceDate: date },
    });
  }
  return series;
}

const datesOf = async (seriesId: string) =>
  (
    await admin.db
      .select({ date: sessions.occurrenceDate })
      .from(sessions)
      .where(eq(sessions.seriesId, seriesId))
      .orderBy(asc(sessions.occurrenceDate))
  ).map((row) => row.date);

const untilOf = async (seriesId: string) =>
  (
    await admin.db
      .select({ until: classSeries.materializedUntil })
      .from(classSeries)
      .where(eq(classSeries.id, seriesId))
  )[0]?.until;

describe('F022 AC3: the daily task keeps a series 12 weeks ahead', () => {
  it('registers it as a daily task of the registry', () => {
    expect(createRegistry({}).find(({ name }) => name === TASK)).toMatchObject({
      name: TASK,
      kind: 'daily',
    });
  });

  it('AC3: on 13 October 2026 it adds 29 December to the 6 October series, at 18:00 in Amsterdam', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const series = await seriesWithTwelveWeeks(gym.id);

    const result = await cron().run();

    expect(result.results).toEqual([{ name: TASK, outcome: 'succeeded' }]);
    expect((await datesOf(series.id)).slice(-2)).toEqual(['2026-12-22', '2026-12-29']);
    expect(await untilOf(series.id)).toBe('2027-01-04');
    const [added] = await admin.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.seriesId, series.id), eq(sessions.occurrenceDate, '2026-12-29')));
    expect(added).toMatchObject({
      type: 'group',
      status: 'scheduled',
      groupClassId: series.groupClassId,
      capacity: 8,
      trainerProfileId: null,
      version: 1,
      detachedFields: [],
      createdByTeamMemberId: null,
    });
    // 18:00 on 29 December 2026 is 17:00 UTC, for 60 minutes, at the workspace's default location.
    expect(added?.startsAt.toISOString()).toBe('2026-12-29T17:00:00.000Z');
    expect(added?.endsAt.toISOString()).toBe('2026-12-29T18:00:00.000Z');
    const location = await admin.db.execute(
      sql`select id from locations where organization_id = ${gym.id} and is_default`,
    );
    expect(added?.locationId).toBe(location.rows[0]?.id);
    expect((await db.select().from(jobRuns))[0]?.message).toBe('extended=1, dates=1, failed=0');
  });

  it('AC2: later dates get the new trainer of the series (F023)', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const mikeAccount = await createAccount(admin.db, { label: 'mike' });
    const mike = await addTeamRole(admin.db, { workspaceId: gym.id, accountId: mikeAccount.id });
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, mike.id));
    // The series as F023 leaves it after "Mike from 6 October": Mike is its regular trainer.
    const series = await seriesWithTwelveWeeks(gym.id, { trainerProfileId: profile?.id ?? null });

    await cron().run();

    const [added] = await admin.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.seriesId, series.id), eq(sessions.occurrenceDate, '2026-12-29')));
    expect(added?.trainerProfileId).toBe(profile?.id);
  });

  it('AC3: running it twice adds nothing', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const series = await seriesWithTwelveWeeks(gym.id);
    const { run, tasks, clock } = cron();
    await run();
    const afterFirst = await admin.db.select().from(sessions).orderBy(asc(sessions.occurrenceDate));

    // The same day again, past the runner's due rule: the task itself finds nothing to do.
    const ctx = {
      db,
      now: clock.now(),
      runId: crypto.randomUUID(),
      log: () => {},
      errorReporter: { captureError: vi.fn() },
    };
    expect(await tasks[0]?.run(ctx)).toEqual({ counts: { extended: 0, dates: 0, failed: 0 } });
    clock.advance({ hours: 2 });
    expect((await run()).results).toEqual([]);

    expect(await admin.db.select().from(sessions).orderBy(asc(sessions.occurrenceDate))).toEqual(
      afterFirst,
    );
    expect(await untilOf(series.id)).toBe('2027-01-04');
  });

  it('AC3: a cancelled or changed date is never re-created or reset, even when the day is filled again', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const series = await seriesWithTwelveWeeks(gym.id);
    await admin.db
      .update(sessions)
      .set({
        status: 'cancelled',
        capacity: 3,
        detachedFields: ['capacity'],
        version: 4,
      })
      .where(and(eq(sessions.seriesId, series.id), eq(sessions.occurrenceDate, '2026-10-20')));
    // 29 December is already there, cancelled and changed on its own, while the series says it is
    // filled to 22 December only (as when a change of the series made it).
    await addSession(admin.db, {
      workspaceId: gym.id,
      groupClassId: series.groupClassId,
      participant: false,
      type: 'group',
      startsAt: new Date('2026-12-29T19:00:00Z'),
      series: { id: series.id, occurrenceDate: '2026-12-29', detachedFields: ['time'] },
      status: 'cancelled',
      capacity: 2,
    });
    const before = await admin.db.select().from(sessions).orderBy(asc(sessions.occurrenceDate));

    const result = await cron().run();

    expect(result.failed).toBe(false);
    const after = await admin.db.select().from(sessions).orderBy(asc(sessions.occurrenceDate));
    expect(after).toEqual(before);
    expect(await untilOf(series.id)).toBe('2027-01-04');
  });

  it('adds every missing week when the cron was down for a while, from today on', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const series = await seriesWithTwelveWeeks(gym.id);

    // Three weeks later: 3 November. The horizon ends 26 January 2027.
    await cron(manualClock(new Date('2026-11-03T04:00:00Z'))).run();

    const dates = await datesOf(series.id);
    expect(dates.slice(-5)).toEqual([
      '2026-12-22',
      '2026-12-29',
      '2027-01-05',
      '2027-01-12',
      '2027-01-19',
    ]);
    expect(await untilOf(series.id)).toBe('2027-01-25');
  });

  it('leaves a series that ended alone, and stops filling at its last day', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const ending = await seriesWithTwelveWeeks(gym.id, { endsOn: '2026-12-23' });
    const ended = await seriesWithTwelveWeeks(gym.id, { endsOn: '2026-12-22' });

    const result = await cron().run();

    expect(result.failed).toBe(false);
    expect((await datesOf(ending.id)).at(-1)).toBe('2026-12-22');
    expect(await datesOf(ended.id)).toHaveLength(5);
    expect((await db.select().from(jobRuns))[0]?.message).toBe('extended=1, dates=0, failed=0');
  });

  it('F026 AC7 (#558): no dates after the end an Owner gave the series by cancelling the rest of it, and the cancelled date stays', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    // Cancelled "this and following" from Tuesday 3 November: the series ends on 2 November, that
    // date stays as it is (cancelled) and the later dates were removed. The calendar was filled to 13 October.
    const series = await addClassSeries(admin.db, {
      workspaceId: gym.id,
      materializedUntil: '2026-10-13',
      endsOn: '2026-11-02',
    });
    for (const [date, startsAt, status] of [
      ['2026-10-06', '2026-10-06T16:00:00Z', 'scheduled'],
      ['2026-10-13', '2026-10-13T16:00:00Z', 'scheduled'],
      ['2026-11-03', '2026-11-03T17:00:00Z', 'cancelled'],
    ] as const) {
      await addSession(admin.db, {
        workspaceId: gym.id,
        groupClassId: series.groupClassId,
        participant: false,
        type: 'group',
        status,
        startsAt: new Date(startsAt),
        series: { id: series.id, occurrenceDate: date },
      });
    }
    // On 13 October the task has days to fill before the end (20 and 27 October), and none after it
    // although the horizon reaches into January.
    const result = await cron().run();

    expect(result.failed).toBe(false);
    expect(await datesOf(series.id)).toEqual([
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
      '2026-10-27',
      '2026-11-03',
    ]);
    const [cancelled] = await admin.db
      .select({ status: sessions.status, version: sessions.version })
      .from(sessions)
      .where(and(eq(sessions.seriesId, series.id), eq(sessions.occurrenceDate, '2026-11-03')));
    expect(cancelled).toEqual({ status: 'cancelled', version: 1 });
    expect((await db.select().from(jobRuns)).map((run) => run.message)).toEqual([
      'extended=1, dates=2, failed=0',
    ]);
  });

  it('reads "today" in the time zone of the series, not in UTC', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    // Mondays 18:00 in Auckland, filled to 27 December.
    const series = await addClassSeries(admin.db, {
      workspaceId: gym.id,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timeZone: 'Pacific/Auckland',
      startsOn: '2026-10-05',
      materializedUntil: '2026-12-27',
    });

    // 12 October 23:00 UTC is Tuesday 13 October, 12:00 in Auckland: the horizon ends Monday 4
    // January there, and Sunday 3 January by the date in UTC.
    await cron(manualClock(new Date('2026-10-12T23:00:00Z'))).run();

    expect(await datesOf(series.id)).toEqual(['2026-12-28', '2027-01-04']);
    expect(await untilOf(series.id)).toBe('2027-01-04');
  });
});

describe('F022 AC9 (cron): across workspaces, through the cron role only', () => {
  it('AC9: extends the series of every workspace without a request context', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const fit = await createWorkspace(admin.db, { label: 'fit-studio' });
    const johns = await seriesWithTwelveWeeks(gym.id);
    const fits = await seriesWithTwelveWeeks(fit.id);

    const result = await cron().run();

    expect(result.failed).toBe(false);
    expect((await datesOf(johns.id)).at(-1)).toBe('2026-12-29');
    expect((await datesOf(fits.id)).at(-1)).toBe('2026-12-29');
    // Each workspace's dates stay in it.
    const rows = await admin.db
      .select({ workspace: sessions.organizationId, series: sessions.seriesId })
      .from(sessions)
      .where(eq(sessions.occurrenceDate, '2026-12-29'));
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ workspace: gym.id, series: johns.id });
    expect(rows).toContainEqual({ workspace: fit.id, series: fits.id });
  });
});

describe('F022: a series that fails to materialize', () => {
  it('is reported with the task name and the series ID only, recorded, and the others are still extended', async () => {
    const broken = await createWorkspace(admin.db, { label: 'johns-gym' });
    const fine = await createWorkspace(admin.db, { label: 'fit-studio' });
    const brokenSeries = await seriesWithTwelveWeeks(broken.id);
    const fineSeries = await seriesWithTwelveWeeks(fine.id);
    // A workspace without its default location is broken: the dates have nowhere to go.
    await admin.db.execute(
      sql`update locations set is_default = false where organization_id = ${broken.id}`,
    );
    const { run, errorReporter } = cron();

    const result = await run();

    expect(result.results).toEqual([{ name: TASK, outcome: 'succeeded' }]);
    expect((await datesOf(fineSeries.id)).at(-1)).toBe('2026-12-29');
    expect(await datesOf(brokenSeries.id)).toHaveLength(5);
    expect(await untilOf(brokenSeries.id)).toBe('2026-12-22');
    expect(errorReporter.captureError).toHaveBeenCalledTimes(1);
    const [error, options] = errorReporter.captureError.mock.calls[0] ?? [];
    expect(options).toEqual({
      tags: {
        'cron.task': TASK,
        'cron.run_id': result.runId,
        'class_series.id': brokenSeries.id,
      },
    });
    // The error says what kind of failure it was, nothing of the data.
    expect(String((error as Error).message)).not.toContain(broken.id);
    expect((await db.select().from(jobRuns))[0]?.message).toBe('extended=1, dates=1, failed=1');
  });

  it('rolls back the dates of a series that fails half way', async () => {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const series = await seriesWithTwelveWeeks(gym.id);
    // The dates go in first and the update of the series ends the work: make that update fail.
    await admin.db.execute(
      sql`alter table class_series add constraint probe_fails check (materialized_until <= '2026-12-22') not valid`,
    );
    const { run, errorReporter } = cron();

    await run();

    expect(errorReporter.captureError).toHaveBeenCalledTimes(1);
    expect(await datesOf(series.id)).toHaveLength(5);
    expect(await untilOf(series.id)).toBe('2026-12-22');
  });
});
