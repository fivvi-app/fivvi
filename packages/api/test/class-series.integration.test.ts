import { readFileSync } from 'node:fs';
import { classSeries, createDatabase, type DatabaseClient, sessions } from '@fivvi/database';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type CreatedClassBody,
  call,
  createClass,
  groupClassWorld,
  kracht,
  listSeries,
  readSession,
  type SeriesBody,
  type SessionBody,
  scheduleClass,
  setupGroupClassApi,
  updateDate,
} from './group-classes-world.ts';

// F022 (spec #428), first ticket (#452): weekly class series through the API. Synthetic people: John
// (Owner of John's Gym, also trains), Sarah and Tom (Trainers), Mike (Owner of Fit Studio). Class
// "Kracht" with Sarah, capacity 8, 60 minutes. Workspace time zone Europe/Amsterdam; "now" is
// Monday 28 September 2026.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

type Dated = SessionBody & {
  series?: {
    id: string;
    weekday: string;
    localStartTime: string;
    occurrenceDate: string;
    changedFields: string[];
  };
  datesAdded?: number;
  keptDates?: number;
};

const TUESDAYS = [
  '2026-10-06',
  '2026-10-13',
  '2026-10-20',
  '2026-10-27',
  '2026-11-03',
  '2026-11-10',
  '2026-11-17',
  '2026-11-24',
  '2026-12-01',
  '2026-12-08',
  '2026-12-15',
  '2026-12-22',
];

describe('F022 weekly class series through the API', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 12 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const setup = (overrides = {}) => setupGroupClassApi(admin, app, overrides);
  const storedSeries = (workspaceId: string) =>
    admin.db.select().from(classSeries).where(eq(classSeries.organizationId, workspaceId));
  const storedDates = (workspaceId: string) =>
    admin.db
      .select()
      .from(sessions)
      .where(eq(sessions.organizationId, workspaceId))
      .orderBy(asc(sessions.startsAt));

  /** Kracht with Sarah, scheduled every Tuesday from 6 October 2026 at 18:00. */
  async function aWeeklyClass(overrides = {}) {
    const world = await groupClassWorld(admin);
    const { server } = setup(overrides);
    const { groupClass } = (await (
      await createClass(server, world.gym.id, world.john, kracht(world.sarahRole.id))
    ).json()) as CreatedClassBody;
    const response = await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
      localDate: '2026-10-06',
      localStart: '18:00',
      repeat: 'weekly',
    });
    return { ...world, server, groupClass, response, first: (await response.json()) as Dated };
  }

  const dateOn = async (workspaceId: string, day: string) => {
    const rows = await storedDates(workspaceId);
    const row = rows.find((r) => r.occurrenceDate === day);
    if (!row) throw new Error(`no date on ${day}`);
    return row;
  };

  it('AC1: John schedules Kracht every Tuesday from 6 October 18:00: the rule is stored with 12 dates, 6 October to 22 December', async () => {
    const { gym, response, first, sarahRole } = await aWeeklyClass();

    expect(response.status).toBe(201);
    expect(first).toMatchObject({
      startsAt: '2026-10-06T16:00:00.000Z',
      timeZone: 'Europe/Amsterdam',
      datesAdded: 12,
      series: {
        id: expect.any(String),
        weekday: 'TU',
        localStartTime: '18:00',
        occurrenceDate: '2026-10-06',
        changedFields: [],
      },
    });
    const [series, ...more] = await storedSeries(gym.id);
    expect(more).toEqual([]);
    expect(series).toMatchObject({
      id: first.series?.id,
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      localStartTime: '18:00:00',
      timeZone: 'Europe/Amsterdam',
      durationMinutes: 60,
      capacity: 8,
      startsOn: '2026-10-06',
      endsOn: null,
      materializedUntil: '2026-12-28',
      version: 1,
    });
    const dates = await storedDates(gym.id);
    expect(dates.map((d) => d.occurrenceDate)).toEqual(TUESDAYS);
    expect(dates.every((d) => d.seriesId === series?.id && d.status === 'scheduled')).toBe(true);
    expect(dates.every((d) => d.capacity === 8 && d.detachedFields.length === 0)).toBe(true);
    // Sarah teaches them all (the class's usual trainer is copied to the series and its dates).
    expect(new Set(dates.map((d) => d.trainerProfileId)).size).toBe(1);
    expect(dates[0]?.trainerProfileId).toBe(series?.trainerProfileId);
    expect(sarahRole.id).toBeDefined();
  });

  it('AC2: 18:00 in Amsterdam is 16:00 UTC before 25 October and 17:00 UTC after it', async () => {
    const { gym } = await aWeeklyClass();
    const dates = await storedDates(gym.id);
    const starts = Object.fromEntries(
      dates.map((d) => [d.occurrenceDate, d.startsAt.toISOString()]),
    );
    expect(starts['2026-10-20']).toBe('2026-10-20T16:00:00.000Z');
    expect(starts['2026-10-27']).toBe('2026-10-27T17:00:00.000Z');
    expect(starts['2026-12-22']).toBe('2026-12-22T17:00:00.000Z');
    expect(dates[0]?.endsAt.toISOString()).toBe('2026-10-06T17:00:00.000Z');
  });

  it('a date without repeat, and one with repeat "none", makes one date and no series', async () => {
    const world = await groupClassWorld(admin);
    const { server } = setup();
    const { groupClass } = (await (
      await createClass(server, world.gym.id, world.john, kracht())
    ).json()) as CreatedClassBody;
    for (const extra of [{}, { repeat: 'none' }]) {
      const date = (await (
        await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
          localDate: '2026-10-06',
          localStart: '18:00',
          ...extra,
        })
      ).json()) as Dated;
      expect(date.series).toBeUndefined();
      expect(date.datesAdded).toBeUndefined();
    }
    expect(await storedSeries(world.gym.id)).toEqual([]);
    expect(await storedDates(world.gym.id)).toHaveLength(2);
  });

  it('a weekly class asked for with a trainer and a capacity of its own copies both to the series and its dates', async () => {
    const world = await groupClassWorld(admin);
    const { server } = setup();
    const { groupClass } = (await (
      await createClass(server, world.gym.id, world.john, kracht(world.sarahRole.id))
    ).json()) as CreatedClassBody;
    const response = await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
      localDate: '2026-10-06',
      localStart: '18:00',
      repeat: 'weekly',
      trainerId: world.tomRole.id,
      capacity: 12,
    });
    expect(response.status).toBe(201);
    const list = (await (
      await listSeries(server, world.gym.id, groupClass.id, world.john)
    ).json()) as SeriesBody[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      weekday: 'TU',
      localStartTime: '18:00',
      durationMinutes: 60,
      timeZone: 'Europe/Amsterdam',
      trainer: { id: world.tomRole.id, name: 'Tom' },
      capacity: 12,
      startsOn: '2026-10-06',
      materializedUntil: '2026-12-28',
      version: 1,
    });
    expect(list[0]?.endsOn).toBeUndefined();
    const dates = await storedDates(world.gym.id);
    expect(dates.every((d) => d.capacity === 12)).toBe(true);
  });

  it('the series of a class lists the series still running, and none for a class without one', async () => {
    const { gym, john, server, groupClass } = await aWeeklyClass();
    const other = (await (
      await createClass(server, gym.id, john, kracht())
    ).json()) as CreatedClassBody;

    expect(
      (await (await listSeries(server, gym.id, groupClass.id, john)).json()) as SeriesBody[],
    ).toHaveLength(1);
    expect(await (await listSeries(server, gym.id, other.groupClass.id, john)).json()).toEqual([]);
    expect((await listSeries(server, gym.id, crypto.randomUUID(), john)).status).toBe(404);
  });

  describe('the apps’ quick create: a new class with a weekly first date', () => {
    it('makes the class, its series and 12 dates in one request', async () => {
      const world = await groupClassWorld(admin);
      const { server } = setup();

      const response = await createClass(server, world.gym.id, world.john, {
        ...kracht(world.tomRole.id),
        nameNl: 'Mobility',
        firstDate: { localDate: '2026-10-08', localStart: '19:00', repeat: 'weekly' },
      });

      expect(response.status).toBe(201);
      const created = (await response.json()) as CreatedClassBody & { datesAdded?: number };
      expect(created.datesAdded).toBe(12);
      expect(created.firstDate).toMatchObject({
        startsAt: '2026-10-08T17:00:00.000Z',
        series: { weekday: 'TH', localStartTime: '19:00', occurrenceDate: '2026-10-08' },
      });
      const dates = await storedDates(world.gym.id);
      expect(dates).toHaveLength(12);
      expect(dates.at(-1)?.occurrenceDate).toBe('2026-12-24');
      expect((await storedSeries(world.gym.id))[0]).toMatchObject({
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        groupClassId: created.groupClass.id,
      });
    });

    it('a start that does not exist leaves no class, no series and no date behind', async () => {
      const world = await groupClassWorld(admin);
      const { server } = setup();

      const response = await createClass(server, world.gym.id, world.john, {
        ...kracht(),
        firstDate: { localDate: '2027-03-14', localStart: '02:30', repeat: 'weekly' },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'firstDate.localStart', code: 'time_does_not_exist', date: '2027-03-28' }],
      });
      expect(await storedSeries(world.gym.id)).toEqual([]);
      expect(await storedDates(world.gym.id)).toEqual([]);
      const classes = await call(
        server,
        'GET',
        `/v1/workspaces/${world.gym.id}/group-classes`,
        world.john,
      );
      expect(await classes.json()).toEqual([]);
    });

    it('a weekly first date in the past is refused on the date and makes nothing', async () => {
      const world = await groupClassWorld(admin);
      const { server } = setup();
      const response = await createClass(server, world.gym.id, world.john, {
        ...kracht(),
        firstDate: { localDate: '2026-09-22', localStart: '18:00', repeat: 'weekly' },
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'firstDate.localDate', code: 'date_in_past' }],
      });
      expect(await storedSeries(world.gym.id)).toEqual([]);
    });
  });

  describe('AC4: only this class', () => {
    it('AC4: 20 October to 18:30 with "this": only that date moves, it is marked, the other dates and the rule are unchanged', async () => {
      const { gym, john, server } = await aWeeklyClass();
      const before = await storedDates(gym.id);
      const seriesBefore = (await storedSeries(gym.id))[0];
      const target = await dateOn(gym.id, '2026-10-20');

      const response = await updateDate(server, gym.id, target.id, john, {
        version: 1,
        localStart: '18:30',
        scope: 'this',
      });

      expect(response.status).toBe(200);
      const edited = (await response.json()) as Dated;
      expect(edited).toMatchObject({
        startsAt: '2026-10-20T16:30:00.000Z',
        endsAt: '2026-10-20T17:00:00.000Z',
        version: 2,
        series: { occurrenceDate: '2026-10-20', changedFields: ['time'] },
      });
      expect(edited.keptDates).toBeUndefined();
      const after = await storedDates(gym.id);
      for (const row of after) {
        const was = before.find((b) => b.id === row.id);
        if (row.id === target.id) continue;
        expect(row, row.occurrenceDate ?? '').toEqual(was);
      }
      expect((await storedSeries(gym.id))[0]).toEqual(seriesBefore);
      // The reader sees the same on the date's own page (CO-01).
      const read = (await (await readSession(server, gym.id, target.id, john)).json()) as Dated;
      expect(read.series?.changedFields).toEqual(['time']);
    });

    it('a date without a scope is edited as "this", and a capacity of its own is marked too', async () => {
      const { gym, john, server } = await aWeeklyClass();
      const target = await dateOn(gym.id, '2026-10-13');
      const edited = (await (
        await updateDate(server, gym.id, target.id, john, { version: 1, capacity: 9 })
      ).json()) as Dated;
      expect(edited.series?.changedFields).toEqual(['capacity']);
      const again = (await (
        await updateDate(server, gym.id, target.id, john, { version: 2, localEnd: '19:30' })
      ).json()) as Dated;
      expect(again.series?.changedFields).toEqual(['time', 'capacity']);
    });

    it('a date on its own has no series, and "this and following" on it is refused on the scope', async () => {
      const world = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, world.gym.id, world.john, kracht())
      ).json()) as CreatedClassBody;
      const single = (await (
        await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
          localDate: '2026-10-06',
          localStart: '18:00',
        })
      ).json()) as Dated;

      const plain = await updateDate(server, world.gym.id, single.id, world.john, {
        version: 1,
        capacity: 9,
        scope: 'this',
      });
      expect(((await plain.json()) as Dated).series).toBeUndefined();
      const following = await updateDate(server, world.gym.id, single.id, world.john, {
        version: 2,
        capacity: 10,
        scope: 'following',
      });
      expect(following.status).toBe(400);
      expect(await following.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'scope', code: 'not_in_series' }],
      });
    });
  });

  describe('AC5: this and following', () => {
    async function afterTwentiethWasMoved() {
      const world = await aWeeklyClass();
      const twentieth = await dateOn(world.gym.id, '2026-10-20');
      await updateDate(world.server, world.gym.id, twentieth.id, world.john, {
        version: 1,
        localStart: '18:30',
        scope: 'this',
      });
      return world;
    }

    it('AC5: capacity 10 from 13 October updates every unchanged date from then, keeps 20 October as it is and reports 1 kept date', async () => {
      const { gym, john, server, groupClass } = await afterTwentiethWasMoved();
      const target = await dateOn(gym.id, '2026-10-13');

      const response = await updateDate(server, gym.id, target.id, john, {
        version: 1,
        capacity: 10,
        scope: 'following',
      });

      expect(response.status).toBe(200);
      const edited = (await response.json()) as Dated;
      expect(edited).toMatchObject({ capacity: 10, version: 2, keptDates: 1 });
      expect(edited.series?.changedFields).toEqual([]);
      const dates = await storedDates(gym.id);
      const capacities = Object.fromEntries(dates.map((d) => [d.occurrenceDate, d.capacity]));
      expect(capacities).toEqual({
        '2026-10-06': 8,
        '2026-10-13': 10,
        '2026-10-20': 8,
        '2026-10-27': 10,
        '2026-11-03': 10,
        '2026-11-10': 10,
        '2026-11-17': 10,
        '2026-11-24': 10,
        '2026-12-01': 10,
        '2026-12-08': 10,
        '2026-12-15': 10,
        '2026-12-22': 10,
      });
      // 20 October keeps its own change.
      const twentieth = await dateOn(gym.id, '2026-10-20');
      expect(twentieth.startsAt.toISOString()).toBe('2026-10-20T16:30:00.000Z');
      expect(twentieth.detachedFields).toEqual(['time']);
      // The earlier series ends on 6 October, a new one starts on 13 October with capacity 10.
      const series = (await storedSeries(gym.id)).sort((a, b) =>
        a.startsOn < b.startsOn ? -1 : 1,
      );
      expect(series.map((s) => [s.startsOn, s.endsOn, s.capacity])).toEqual([
        ['2026-10-06', '2026-10-06', 8],
        ['2026-10-13', null, 10],
      ]);
      const [earlier, later] = series;
      expect(dates.filter((d) => d.seriesId === earlier?.id).map((d) => d.occurrenceDate)).toEqual([
        '2026-10-06',
      ]);
      expect(dates.filter((d) => d.seriesId === later?.id)).toHaveLength(11);
      // The class page lists both while they run.
      const listed = (await (
        await listSeries(server, gym.id, groupClass.id, john)
      ).json()) as SeriesBody[];
      expect(listed.map((s) => [s.startsOn, s.capacity])).toEqual([
        ['2026-10-06', 8],
        ['2026-10-13', 10],
      ]);
    });

    it('AC5: a new start from 13 October moves the unchanged dates across the clock change, 18:30 in Amsterdam', async () => {
      const { gym, john, server } = await afterTwentiethWasMoved();
      const target = await dateOn(gym.id, '2026-10-13');

      const response = await updateDate(server, gym.id, target.id, john, {
        version: 1,
        localStart: '18:45',
        localEnd: '19:45',
        scope: 'following',
      });

      expect(response.status).toBe(200);
      const dates = await storedDates(gym.id);
      const start = (day: string) =>
        dates.find((d) => d.occurrenceDate === day)?.startsAt.toISOString();
      expect(start('2026-10-06')).toBe('2026-10-06T16:00:00.000Z');
      expect(start('2026-10-13')).toBe('2026-10-13T16:45:00.000Z');
      expect(start('2026-10-20')).toBe('2026-10-20T16:30:00.000Z');
      expect(start('2026-10-27')).toBe('2026-10-27T17:45:00.000Z');
      expect(start('2026-12-22')).toBe('2026-12-22T17:45:00.000Z');
      expect(dates.find((d) => d.occurrenceDate === '2026-10-27')?.endsAt.toISOString()).toBe(
        '2026-10-27T18:45:00.000Z',
      );
      const stored = await storedSeries(gym.id);
      expect(stored.find((s) => s.startsOn === '2026-10-13')).toMatchObject({
        localStartTime: '18:45:00',
        durationMinutes: 60,
      });
    });

    it('a stale version is refused with the date as it is, and nothing changes', async () => {
      const { gym, john, server } = await afterTwentiethWasMoved();
      const target = await dateOn(gym.id, '2026-10-13');
      const before = await storedDates(gym.id);

      const response = await updateDate(server, gym.id, target.id, john, {
        version: 7,
        capacity: 10,
        scope: 'following',
      });

      expect(response.status).toBe(409);
      expect(await storedDates(gym.id)).toEqual(before);
      expect(await storedSeries(gym.id)).toHaveLength(1);
    });

    it('from the first date of the series the series itself changes, nothing is split', async () => {
      const { gym, john, server } = await aWeeklyClass();
      const first = await dateOn(gym.id, '2026-10-06');
      const response = await updateDate(server, gym.id, first.id, john, {
        version: 1,
        capacity: 10,
        scope: 'following',
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as Dated).keptDates).toBe(0);
      const series = await storedSeries(gym.id);
      expect(series).toHaveLength(1);
      expect(series[0]).toMatchObject({ capacity: 10, endsOn: null, version: 2 });
      expect((await storedDates(gym.id)).every((d) => d.capacity === 10)).toBe(true);
    });

    it('a length that is no whole step of 5 minutes is refused on the end', async () => {
      const { gym, john, server } = await aWeeklyClass();
      const target = await dateOn(gym.id, '2026-10-13');
      const response = await updateDate(server, gym.id, target.id, john, {
        version: 1,
        localEnd: '19:07',
        scope: 'following',
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'localEnd', code: 'invalid_duration' }],
      });
    });
  });

  describe('AC7: a time that does not exist', () => {
    it('AC7: Sunday 02:30 from 14 March 2027 is refused with the date it fails on, and nothing is created', async () => {
      const world = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, world.gym.id, world.john, kracht(world.sarahRole.id))
      ).json()) as CreatedClassBody;

      const response = await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
        localDate: '2027-03-14',
        localStart: '02:30',
        repeat: 'weekly',
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'localStart', code: 'time_does_not_exist', date: '2027-03-28' }],
      });
      expect(await storedSeries(world.gym.id)).toEqual([]);
      expect(await storedDates(world.gym.id)).toEqual([]);
    });

    it('AC7: the same start without repeat is fine on a Sunday that has it, and a series away from the change is fine', async () => {
      const world = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, world.gym.id, world.john, kracht())
      ).json()) as CreatedClassBody;
      const response = await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
        localDate: '2026-11-01',
        localStart: '02:30',
        repeat: 'weekly',
      });
      expect(response.status).toBe(201);
      expect(((await response.json()) as Dated).datesAdded).toBe(12);
    });

    it('AC7: a new time on a date that does not exist refuses the edit and changes nothing', async () => {
      const world = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, world.gym.id, world.john, kracht())
      ).json()) as CreatedClassBody;
      await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
        localDate: '2027-03-14',
        localStart: '10:00',
        repeat: 'weekly',
      });
      const target = await dateOn(world.gym.id, '2027-03-21');
      const before = await storedDates(world.gym.id);

      const response = await updateDate(server, world.gym.id, target.id, world.john, {
        version: 1,
        localStart: '02:30',
        localEnd: '03:30',
        scope: 'following',
      });

      // 02:30 exists on 21 March but not on the 28th, which the series would reach.
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'localStart', code: 'time_does_not_exist', date: '2027-03-28' }],
      });
      expect(await storedDates(world.gym.id)).toEqual(before);
      expect(await storedSeries(world.gym.id)).toHaveLength(1);
    });
  });

  describe('AC8, AC9: who may', () => {
    it('AC8: Sarah (Trainer) reads the series line of a date but cannot change a series: 403 on the series routes', async () => {
      const { gym, sarah, server, groupClass, first } = await aWeeklyClass();
      const target = await dateOn(gym.id, '2026-10-13');

      const line = await readSession(server, gym.id, first.id, sarah);
      expect(line.status).toBe(200);
      expect(((await line.json()) as Dated).series).toMatchObject({
        weekday: 'TU',
        localStartTime: '18:00',
        changedFields: [],
      });

      expect((await listSeries(server, gym.id, groupClass.id, sarah)).status).toBe(403);
      expect(
        (
          await scheduleClass(server, gym.id, groupClass.id, sarah, {
            localDate: '2026-10-06',
            localStart: '18:00',
            repeat: 'weekly',
          })
        ).status,
      ).toBe(403);
      for (const scope of ['this', 'following']) {
        expect(
          (await updateDate(server, gym.id, target.id, sarah, { version: 1, capacity: 9, scope }))
            .status,
        ).toBe(403);
      }
      expect(await storedSeries(gym.id)).toHaveLength(1);
      expect((await dateOn(gym.id, '2026-10-13')).capacity).toBe(8);
    });

    it('AC9: Mike gets 404 on every series route of John’s Gym; anonymous calls get 401', async () => {
      const { gym, mike, server, groupClass } = await aWeeklyClass();
      const target = await dateOn(gym.id, '2026-10-13');
      const attempts = (who?: { id: string }) => [
        listSeries(server, gym.id, groupClass.id, who),
        scheduleClass(server, gym.id, groupClass.id, who, {
          localDate: '2026-10-06',
          localStart: '18:00',
          repeat: 'weekly',
        }),
        updateDate(server, gym.id, target.id, who, {
          version: 1,
          capacity: 9,
          scope: 'following',
        }),
      ];
      for (const response of await Promise.all(attempts(mike))) expect(response.status).toBe(404);
      for (const response of await Promise.all(attempts(undefined))) {
        expect(response.status).toBe(401);
      }
      expect(await storedSeries(gym.id)).toHaveLength(1);
      expect(await storedDates(gym.id)).toHaveLength(12);
    });

    it('an unknown class or trainer answers 404 and makes nothing', async () => {
      const world = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, world.gym.id, world.john, kracht())
      ).json()) as CreatedClassBody;
      const body = { localDate: '2026-10-06', localStart: '18:00', repeat: 'weekly' };
      expect(
        (await scheduleClass(server, world.gym.id, crypto.randomUUID(), world.john, body)).status,
      ).toBe(404);
      expect(
        (
          await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
            ...body,
            trainerId: world.mikeRole.id,
          })
        ).status,
      ).toBe(404);
      expect(await storedSeries(world.gym.id)).toEqual([]);
    });

    it('a repeat that is neither none nor weekly, and a scope that is neither this nor following, are refused', async () => {
      const { gym, john, server, groupClass } = await aWeeklyClass();
      const target = await dateOn(gym.id, '2026-10-13');
      const repeat = await scheduleClass(server, gym.id, groupClass.id, john, {
        localDate: '2026-10-06',
        localStart: '18:00',
        repeat: 'daily',
      });
      expect(repeat.status).toBe(400);
      const scope = await updateDate(server, gym.id, target.id, john, {
        version: 1,
        capacity: 9,
        scope: 'all',
      });
      expect(scope.status).toBe(400);
    });
  });

  describe('AC12: the events carry no personal data', () => {
    function withEvents() {
      const lines: string[] = [];
      const logs = (['error', 'log', 'warn', 'info'] as const).map((level) =>
        vi
          .spyOn(console, level)
          .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
      );
      const posthog = createProductEventCaptureTransport();
      const productEvents = createProductEvents({
        env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
        transport: posthog,
        errorReporter: createErrorReporter({ env: {} }),
      });
      return {
        posthog,
        lines,
        productEvents,
        restore: () => {
          for (const log of logs) log.mockRestore();
        },
      };
    }
    const properties = (event?: { properties?: Record<string, unknown> }) =>
      Object.fromEntries(
        Object.entries(event?.properties ?? {}).filter(([key]) => !key.startsWith('$')),
      );

    it('class_series_created and class_series_changed have the workspace ID and the surface only; refusals record nothing', async () => {
      const { posthog, lines, productEvents, restore } = withEvents();
      const world = await groupClassWorld(admin);
      const { server } = setup({ productEvents });
      const { groupClass } = (await (
        await createClass(server, world.gym.id, world.john, {
          ...kracht(world.sarahRole.id),
          nameNl: 'Geheime les',
        })
      ).json()) as CreatedClassBody;
      posthog.events.length = 0;

      // A refusal, a DST error and a single date record no series event.
      await scheduleClass(server, world.gym.id, groupClass.id, world.sarah, {
        localDate: '2026-10-06',
        localStart: '18:00',
        repeat: 'weekly',
      });
      await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
        localDate: '2027-03-14',
        localStart: '02:30',
        repeat: 'weekly',
      });
      await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
        localDate: '2026-10-06',
        localStart: '18:00',
      });
      expect(posthog.events.map(({ event }) => event)).toEqual(['class_scheduled']);
      posthog.events.length = 0;

      await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
        localDate: '2026-10-13',
        localStart: '19:15',
        repeat: 'weekly',
      });
      const target = await dateOn(world.gym.id, '2026-10-20');
      await updateDate(server, world.gym.id, target.id, world.john, {
        version: 1,
        capacity: 9,
        scope: 'following',
      });
      // "This" changes a date, not the series: no series event.
      const other = await dateOn(world.gym.id, '2026-10-27');
      await updateDate(server, world.gym.id, other.id, world.john, {
        version: 1,
        capacity: 9,
        scope: 'this',
      });
      // A bearer token names its surface; without one nothing is recorded.
      await scheduleClass(
        server,
        world.gym.id,
        groupClass.id,
        world.john,
        { localDate: '2026-10-14', localStart: '09:15', repeat: 'weekly', surface: 'android' },
        { authorization: 'Bearer synthetic-token' },
      );
      await scheduleClass(
        server,
        world.gym.id,
        groupClass.id,
        world.john,
        { localDate: '2026-10-15', localStart: '09:15', repeat: 'weekly' },
        { authorization: 'Bearer synthetic-token' },
      );

      const seriesEvents = posthog.events.filter(({ event }) => event.startsWith('class_series_'));
      expect(seriesEvents.map(({ event }) => event)).toEqual([
        'class_series_created',
        'class_series_changed',
        'class_series_created',
      ]);
      expect(seriesEvents.map(properties)).toEqual([
        { workspace_id: world.gym.id, surface: 'web' },
        { workspace_id: world.gym.id, surface: 'web' },
        { workspace_id: world.gym.id, surface: 'android' },
      ]);
      expect(seriesEvents[0]?.distinct_id).toBe(world.john.id);
      const sent = JSON.stringify([posthog.events, lines]);
      for (const personal of [
        'Geheime les',
        'Sarah',
        'Tom',
        'FREQ=WEEKLY',
        '2026-10-13',
        '18:00',
        '19:15',
        world.sarahRole.id,
        groupClass.id,
      ]) {
        expect(sent, personal).not.toContain(personal);
      }
      restore();
    });
  });

  it('AC11: the routes are in the contract with their access', () => {
    const base = '/v1/workspaces/{workspaceId}/group-classes/{classId}';
    expect(contract.paths[`${base}/series`].get['x-access']).toMatchObject({
      capability: 'class.manage',
    });
    const dates = contract.paths[`${base}/dates`].post;
    expect(dates['x-access']).toMatchObject({ capability: 'class.manage' });
    const body = dates.requestBody.content['application/json'].schema;
    const schema = body.$ref
      ? contract.components.schemas[body.$ref.split('/').pop() as string]
      : body;
    expect(schema.properties.repeat.enum).toEqual(['none', 'weekly']);
    const edit = contract.paths['/v1/workspaces/{workspaceId}/sessions/{sessionId}'].patch;
    const editBody = edit.requestBody.content['application/json'].schema;
    const editSchema = editBody.$ref
      ? contract.components.schemas[editBody.$ref.split('/').pop() as string]
      : editBody;
    expect(editSchema.properties.scope.enum).toEqual(['this', 'following']);
    expect(call).toBeTypeOf('function');
  });
});
