import { readFileSync } from 'node:fs';
import {
  classSeries,
  createDatabase,
  type DatabaseClient,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import { addClient, addSession } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CreatedClassBody,
  createClass,
  groupClassWorld,
  kracht,
  listSeries,
  readKeptDates,
  type SeriesBody,
  scheduleClass,
  setupGroupClassApi,
  updateDate,
  updateSeries,
} from './group-classes-world.ts';

// F022 (spec #428), #1524: a whole weekly series is edited through the API, from the first date
// that has not started. Synthetic people: John (Owner of John's Gym, also trains), Sarah and Tom
// (Trainers), Mike (Owner of Fit Studio). Class "Kracht" with Sarah, capacity 8, 60 minutes, every
// Tuesday 18:00 from 6 October 2026; "now" is Monday 28 September, or Wednesday 14 October 10:00
// (Amsterdam) where the first two dates have started.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const amsterdam = (local: string) => zonedTime(local).toISOString();
const WEDNESDAY_THE_14TH = '2026-10-14T08:00:00.000Z';

interface SeriesEdited extends SeriesBody {
  keptDates: number;
}

describe('F022 editing a whole series through the API', () => {
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

  const storedSeries = (workspaceId: string) =>
    admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.organizationId, workspaceId))
      .orderBy(asc(classSeries.startsOn));
  const storedDates = (workspaceId: string) =>
    admin.db
      .select()
      .from(sessions)
      .where(eq(sessions.organizationId, workspaceId))
      .orderBy(asc(sessions.startsAt));
  const profileOf = async (teamMemberId: string) => {
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, teamMemberId));
    if (!profile) throw new Error('No trainer profile.');
    return profile.id;
  };

  /** Kracht with Sarah, scheduled every `localDate` weekday from `localDate` at 18:00. */
  async function aWeeklyClass(options: { now?: string; localDate?: string } = {}, overrides = {}) {
    const world = await groupClassWorld(admin);
    const { server, clock } = setupGroupClassApi(admin, app, overrides);
    const { groupClass } = (await (
      await createClass(server, world.gym.id, world.john, kracht(world.sarahRole.id))
    ).json()) as CreatedClassBody;
    await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
      localDate: options.localDate ?? '2026-10-06',
      localStart: '18:00',
      repeat: 'weekly',
    });
    if (options.now) clock.set(options.now);
    const [series] = await storedSeries(world.gym.id);
    if (!series) throw new Error('No series.');
    return {
      ...world,
      server,
      clock,
      groupClass,
      series,
      tomProfile: await profileOf(world.tomRole.id),
      sarahProfile: await profileOf(world.sarahRole.id),
    };
  }

  const dateOn = async (workspaceId: string, day: string) => {
    const row = (await storedDates(workspaceId)).find((r) => r.occurrenceDate === day);
    if (!row) throw new Error(`no date on ${day}`);
    return row;
  };

  const WHOLE = { localStartTime: '19:00', durationMinutes: 60, capacity: 10 };

  it('AC1: John changes Kracht to 19:00, 60 minutes, capacity 10 and Tom: upcoming dates take it, 20 October keeps its own change, the started dates do not change', async () => {
    const w = await aWeeklyClass({ now: WEDNESDAY_THE_14TH });
    const twentieth = await dateOn(w.gym.id, '2026-10-20');
    await updateDate(w.server, w.gym.id, twentieth.id, w.john, {
      version: 1,
      localStart: '18:30',
      localEnd: '19:30',
      scope: 'this',
    });

    const response = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      version: 1,
      ...WHOLE,
      trainerId: w.tomRole.id,
    });

    expect(response.status).toBe(200);
    const edited = (await response.json()) as SeriesEdited;
    expect(edited).toMatchObject({
      startsOn: '2026-10-20',
      localStartTime: '19:00',
      durationMinutes: 60,
      capacity: 10,
      trainer: { id: w.tomRole.id, name: 'Tom' },
      keptDates: 1,
    });
    const dates = await storedDates(w.gym.id);
    const by = Object.fromEntries(dates.map((d) => [d.occurrenceDate, d]));
    // Started: 6 and 13 October are as they were.
    for (const day of ['2026-10-06', '2026-10-13']) {
      expect(by[day]).toMatchObject({ capacity: 8, trainerProfileId: w.sarahProfile });
      expect(by[day]?.endsAt.getTime() - (by[day]?.startsAt.getTime() ?? 0)).toBe(3_600_000);
      expect(by[day]?.startsAt.toISOString()).toBe(amsterdam(`${day}T18:00`));
    }
    // Its own change: 20 October is as John left it.
    expect(by['2026-10-20']?.startsAt.toISOString()).toBe(amsterdam('2026-10-20T18:30'));
    expect(by['2026-10-20']?.capacity).toBe(8);
    expect(by['2026-10-20']?.detachedFields).toEqual(['time']);
    // Upcoming dates without changes of their own, across the clock change.
    for (const day of ['2026-10-27', '2026-11-03', '2026-11-24', '2026-12-22']) {
      expect(by[day]?.startsAt.toISOString()).toBe(amsterdam(`${day}T19:00`));
      expect(by[day]).toMatchObject({ capacity: 10, trainerProfileId: w.tomProfile });
      expect(by[day]?.version).toBe(2);
    }
    // The earlier series ends the week before; the new one has the dates from 20 October on.
    const series = await storedSeries(w.gym.id);
    expect(series.map((s) => [s.startsOn, s.endsOn, s.capacity])).toEqual([
      ['2026-10-06', '2026-10-13', 8],
      ['2026-10-20', null, 10],
    ]);
    expect(edited.id).toBe(series[1]?.id);
    expect(by['2026-10-20']?.seriesId).toBe(edited.id);
    expect(by['2026-10-13']?.seriesId).toBe(w.series.id);
    // The calendar is kept filled ahead from the series that runs.
    expect(dates.filter((d) => d.seriesId === edited.id).length).toBeGreaterThanOrEqual(12);
    const listed = (await (
      await listSeries(w.server, w.gym.id, w.groupClass.id, w.john)
    ).json()) as SeriesBody[];
    // The earlier series ended before today: the class page lists the one that runs.
    expect(listed.map((s) => [s.startsOn, s.capacity])).toEqual([['2026-10-20', 10]]);
  });

  it('AC1: before the first date has started the series itself changes: no split, a new version, every date', async () => {
    const w = await aWeeklyClass();

    const response = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      version: 1,
      capacity: 12,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: w.series.id,
      startsOn: '2026-10-06',
      capacity: 12,
      version: 2,
      keptDates: 0,
      trainer: { id: w.sarahRole.id },
    });
    expect((await storedSeries(w.gym.id)).map((s) => s.endsOn)).toEqual([null]);
    expect((await storedDates(w.gym.id)).every((d) => d.capacity === 12)).toBe(true);
  });

  it('AC1: a date that has started today is not changed, a date later today is', async () => {
    const w = await aWeeklyClass({ now: '2026-10-13T15:00:00.000Z' });
    // 17:00 Amsterdam on the 13th: the date at 18:00 has not started.
    const response = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      version: 1,
      capacity: 9,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ startsOn: '2026-10-13', capacity: 9 });
    expect((await dateOn(w.gym.id, '2026-10-06')).capacity).toBe(8);
    expect((await dateOn(w.gym.id, '2026-10-13')).capacity).toBe(9);

    // The next edit runs after 18:00 on the 13th: that date has started and stays at 9.
    w.clock.set('2026-10-13T16:30:00.000Z');
    const [, later] = await storedSeries(w.gym.id);
    const again = await updateSeries(w.server, w.gym.id, w.groupClass.id, later?.id ?? '', w.john, {
      version: 1,
      capacity: 5,
    });
    expect(again.status).toBe(200);
    expect((await dateOn(w.gym.id, '2026-10-13')).capacity).toBe(9);
    expect((await dateOn(w.gym.id, '2026-10-20')).capacity).toBe(5);
  });

  it('AC2: trainerId null makes the upcoming dates Trainer nodig', async () => {
    const w = await aWeeklyClass({ now: WEDNESDAY_THE_14TH });

    const response = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      version: 1,
      trainerId: null,
    });

    expect(response.status).toBe(200);
    const edited = (await response.json()) as SeriesEdited;
    expect(edited.trainer).toBeUndefined();
    const dates = await storedDates(w.gym.id);
    expect(dates.filter((d) => d.occurrenceDate && d.occurrenceDate >= '2026-10-20')).toSatisfy(
      (upcoming: { trainerProfileId: string | null }[]) =>
        upcoming.every((d) => d.trainerProfileId === null),
    );
    expect((await dateOn(w.gym.id, '2026-10-13')).trainerProfileId).toBe(w.sarahProfile);
  });

  it('AC2: Tom has a private session at 19:30 on 27 October: Kracht with Tom at 19:00 is a trainer_conflict, nothing changes, and it saves with allowConflicts', async () => {
    const w = await aWeeklyClass({ now: WEDNESDAY_THE_14TH });
    const anna = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Anna de Vries' });
    const other = await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: anna.id,
      trainerProfileId: w.tomProfile,
      startsAt: new Date(amsterdam('2026-10-27T19:30')),
    });
    const edit = { version: 1, localStartTime: '19:00', trainerId: w.tomRole.id };

    const refused = await updateSeries(
      w.server,
      w.gym.id,
      w.groupClass.id,
      w.series.id,
      w.john,
      edit,
    );

    expect(refused.status).toBe(409);
    const body = (await refused.json()) as {
      code: string;
      conflicts: { sessionId: string }[];
    };
    expect(body.code).toBe('trainer_conflict');
    expect(body.conflicts.map((c) => c.sessionId)).toEqual([other.id]);
    expect((await storedSeries(w.gym.id)).map((s) => [s.version, s.endsOn])).toEqual([[1, null]]);
    expect((await dateOn(w.gym.id, '2026-10-27')).startsAt.toISOString()).toBe(
      amsterdam('2026-10-27T18:00'),
    );

    const saved = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      ...edit,
      allowConflicts: true,
    });
    expect(saved.status).toBe(200);
    expect((await dateOn(w.gym.id, '2026-10-27')).startsAt.toISOString()).toBe(
      amsterdam('2026-10-27T19:00'),
    );
  });

  it('AC2: a trainer change alone to a trainer who is busy at the same time is a trainer_conflict, nothing changes, and it saves with allowConflicts', async () => {
    const w = await aWeeklyClass({ now: WEDNESDAY_THE_14TH });
    const anna = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Anna de Vries' });
    const other = await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: anna.id,
      trainerProfileId: w.tomProfile,
      startsAt: new Date(amsterdam('2026-10-27T18:30')),
    });
    const edit = { version: 1, trainerId: w.tomRole.id };

    const refused = await updateSeries(
      w.server,
      w.gym.id,
      w.groupClass.id,
      w.series.id,
      w.john,
      edit,
    );

    expect(refused.status).toBe(409);
    const body = (await refused.json()) as {
      code: string;
      conflicts: { sessionId: string }[];
    };
    expect(body.code).toBe('trainer_conflict');
    expect(body.conflicts.map((c) => c.sessionId)).toEqual([other.id]);
    expect((await storedSeries(w.gym.id)).map((s) => [s.version, s.endsOn])).toEqual([[1, null]]);
    expect((await dateOn(w.gym.id, '2026-10-27')).trainerProfileId).toBe(w.sarahProfile);

    const saved = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      ...edit,
      allowConflicts: true,
    });
    expect(saved.status).toBe(200);
    expect((await dateOn(w.gym.id, '2026-10-27')).trainerProfileId).toBe(w.tomProfile);
    expect((await dateOn(w.gym.id, '2026-10-27')).startsAt.toISOString()).toBe(
      amsterdam('2026-10-27T18:00'),
    );
  });

  it('AC1: a new length of 75 minutes: the series has 75, each upcoming date ends 75 minutes after its start, the started dates stay at 60', async () => {
    const w = await aWeeklyClass({ now: WEDNESDAY_THE_14TH });

    const response = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      version: 1,
      durationMinutes: 75,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ startsOn: '2026-10-20', durationMinutes: 75 });
    const dates = await storedDates(w.gym.id);
    const length = (d: (typeof dates)[number]) =>
      (d.endsAt.getTime() - d.startsAt.getTime()) / 60_000;
    for (const day of ['2026-10-06', '2026-10-13']) {
      const started = dates.find((d) => d.occurrenceDate === day);
      expect(started && length(started)).toBe(60);
    }
    const upcoming = dates.filter((d) => d.occurrenceDate && d.occurrenceDate >= '2026-10-20');
    expect(upcoming.length).toBeGreaterThanOrEqual(12);
    expect(upcoming.map(length)).toEqual(upcoming.map(() => 75));
    expect((await dateOn(w.gym.id, '2026-10-27')).startsAt.toISOString()).toBe(
      amsterdam('2026-10-27T18:00'),
    );
    expect((await storedSeries(w.gym.id)).map((s) => [s.startsOn, s.durationMinutes])).toEqual([
      ['2026-10-06', 60],
      ['2026-10-20', 75],
    ]);
  });

  it('AC2: a capacity change alone never warns, even when the trainer is busy', async () => {
    const w = await aWeeklyClass({ now: WEDNESDAY_THE_14TH });
    const anna = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Anna de Vries' });
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: anna.id,
      trainerProfileId: w.sarahProfile,
      startsAt: new Date(amsterdam('2026-10-27T18:30')),
    });

    const response = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      version: 1,
      capacity: 6,
    });

    expect(response.status).toBe(200);
  });

  it('AC3: a start the clocks skip answers time_does_not_exist with the date, and nothing changes', async () => {
    // Sundays from 7 March 2027: the clocks go forward at 02:00 on 28 March.
    const w = await aWeeklyClass({ localDate: '2027-03-07' });

    const response = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      version: 1,
      localStartTime: '02:30',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'localStartTime', code: 'time_does_not_exist', date: '2027-03-28' }],
    });
    expect((await storedSeries(w.gym.id)).map((s) => [s.version, s.localStartTime])).toEqual([
      [1, '18:00:00'],
    ]);
  });

  it('AC3: a length that is no step answers invalid_duration; nothing to change answers 400', async () => {
    const w = await aWeeklyClass();
    const path = [w.server, w.gym.id, w.groupClass.id, w.series.id, w.john] as const;

    const length = await updateSeries(...path, { version: 1, durationMinutes: 62 });
    expect(length.status).toBe(400);
    expect(await length.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'durationMinutes', code: 'invalid_duration' }],
    });

    const nothing = await updateSeries(...path, { version: 1 });
    expect(nothing.status).toBe(400);
  });

  it('AC3: a series with no date left to change answers 400 on seriesId', async () => {
    const w = await aWeeklyClass({ now: '2027-01-20T08:00:00.000Z' });
    // 12 dates, the last on 22 December: all have started, and the calendar was not filled further.
    const response = await updateSeries(w.server, w.gym.id, w.groupClass.id, w.series.id, w.john, {
      version: 1,
      capacity: 9,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'seriesId', code: 'no_upcoming_dates' }],
    });
  });

  it('AC3: a stale version answers 409 with the series as it is now, and writes nothing', async () => {
    const w = await aWeeklyClass();
    const path = [w.server, w.gym.id, w.groupClass.id, w.series.id, w.john] as const;
    expect((await updateSeries(...path, { version: 1, capacity: 9 })).status).toBe(200);

    const stale = await updateSeries(...path, { version: 1, capacity: 3 });

    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'series_changed',
      series: { id: w.series.id, version: 2, capacity: 9 },
    });
    expect((await dateOn(w.gym.id, '2026-10-13')).capacity).toBe(9);
  });

  it('AC3: a Trainer gets 403, anonymous 401, Mike 404, and a series of another class or an unknown trainer 404', async () => {
    const w = await aWeeklyClass();
    const edit = { version: 1, capacity: 9 };
    const as = (who?: { id: string }, workspace = w.gym.id, body: unknown = edit) =>
      updateSeries(w.server, workspace, w.groupClass.id, w.series.id, who, body);

    expect((await as(w.sarah)).status).toBe(403);
    expect((await as(undefined)).status).toBe(401);
    expect((await as(w.mike)).status).toBe(404);
    const otherClass = (await (
      await createClass(w.server, w.gym.id, w.john, { ...kracht(), nameNl: 'Yoga' })
    ).json()) as CreatedClassBody;
    const wrongClass = await updateSeries(
      w.server,
      w.gym.id,
      otherClass.groupClass.id,
      w.series.id,
      w.john,
      edit,
    );
    expect(wrongClass.status).toBe(404);
    expect((await as(w.john, w.gym.id, { version: 1, trainerId: w.mikeRole.id })).status).toBe(404);
    expect(
      (
        await updateSeries(
          w.server,
          w.gym.id,
          w.groupClass.id,
          '00000000-0000-4000-8000-000000000000',
          w.john,
          edit,
        )
      ).status,
    ).toBe(404);
    expect((await storedDates(w.gym.id)).every((d) => d.capacity === 8)).toBe(true);
  });

  it('records class_series_changed with the workspace ID and the surface only, for an app with a bearer token', async () => {
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const w = await aWeeklyClass({}, { productEvents });
    posthog.events.length = 0;

    await updateSeries(
      w.server,
      w.gym.id,
      w.groupClass.id,
      w.series.id,
      w.john,
      { version: 1, capacity: 9, surface: 'ios' },
      { authorization: 'Bearer synthetic-token' },
    );

    const events = posthog.events.filter(({ event }) => event === 'class_series_changed');
    expect(events).toHaveLength(1);
    const properties = Object.fromEntries(
      Object.entries(events[0]?.properties ?? {}).filter(([key]) => !key.startsWith('$')),
    );
    expect(properties).toEqual({ workspace_id: w.gym.id, surface: 'ios' });
  });

  describe('#1521 the dates that keep their own changes, counted before saving "this and following"', () => {
    /** Kracht with 20 October changed on its own (18:30, capacity 6): John is on the 13th. */
    async function withTwentiethChanged() {
      const w = await aWeeklyClass();
      const twentieth = await dateOn(w.gym.id, '2026-10-20');
      await updateDate(w.server, w.gym.id, twentieth.id, w.john, {
        version: 1,
        localStart: '18:30',
        localEnd: '19:30',
        capacity: 6,
        scope: 'this',
      });
      return { ...w, thirteenth: await dateOn(w.gym.id, '2026-10-13') };
    }
    const keptOf = async (response: Response) =>
      ((await response.json()) as { keptDates: number }).keptDates;

    it('AC1: from 13 October with 20 October changed on its own the count is 1, as the save then says', async () => {
      const w = await withTwentiethChanged();

      const response = await readKeptDates(w.server, w.gym.id, w.thirteenth.id, w.john);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ sessionId: w.thirteenth.id, keptDates: 1 });
      const saved = await updateDate(w.server, w.gym.id, w.thirteenth.id, w.john, {
        version: w.thirteenth.version,
        capacity: 9,
        scope: 'following',
      });
      expect(((await saved.json()) as { keptDates: number }).keptDates).toBe(1);
    });

    it('AC1: with no date changed on its own the count is 0', async () => {
      const w = await aWeeklyClass();
      const thirteenth = await dateOn(w.gym.id, '2026-10-13');

      const response = await readKeptDates(w.server, w.gym.id, thirteenth.id, w.john);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ sessionId: thirteenth.id, keptDates: 0 });
    });

    it('AC1: counts only the dates from the chosen one on, not the date itself and not earlier ones', async () => {
      const w = await withTwentiethChanged();
      const twentieth = await dateOn(w.gym.id, '2026-10-20');
      const twentySeventh = await dateOn(w.gym.id, '2026-10-27');

      // From the changed date itself: it takes the change, so nothing else is left to keep.
      expect(await keptOf(await readKeptDates(w.server, w.gym.id, twentieth.id, w.john))).toBe(0);
      expect(await keptOf(await readKeptDates(w.server, w.gym.id, twentySeventh.id, w.john))).toBe(
        0,
      );
      expect(await keptOf(await readKeptDates(w.server, w.gym.id, w.thirteenth.id, w.john))).toBe(
        1,
      );
    });

    it('AC1: the read writes nothing', async () => {
      const w = await withTwentiethChanged();
      const before = JSON.stringify(await storedDates(w.gym.id));

      await readKeptDates(w.server, w.gym.id, w.thirteenth.id, w.john);

      expect(JSON.stringify(await storedDates(w.gym.id))).toBe(before);
    });

    it('AC1: a Trainer gets 403, anonymous 401, Mike (another workspace) 404, an unknown date 404', async () => {
      const w = await withTwentiethChanged();
      const read = (who?: { id: string }, workspace = w.gym.id, sessionId = w.thirteenth.id) =>
        readKeptDates(w.server, workspace, sessionId, who);

      expect((await read(w.sarah)).status).toBe(403);
      expect((await read(undefined)).status).toBe(401);
      // Mike is the Owner of Fit Studio: John's date is not found through his workspace either.
      expect((await read(w.mike, w.other.id)).status).toBe(404);
      expect((await read(w.mike)).status).toBe(404);
      expect((await read(w.john, w.gym.id, '00000000-0000-4000-8000-000000000000')).status).toBe(
        404,
      );
    });

    it('AC1: a private session is 404 and a class date on its own, in no series, is 400 on sessionId', async () => {
      const w = await aWeeklyClass();
      const anna = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Anna de Vries' });
      const privateSession = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: anna.id,
        trainerProfileId: w.sarahProfile,
        startsAt: new Date(amsterdam('2026-11-03T12:00')),
      });
      const single = (await (
        await scheduleClass(w.server, w.gym.id, w.groupClass.id, w.john, {
          localDate: '2026-11-04',
          localStart: '18:00',
        })
      ).json()) as { id: string };

      expect((await readKeptDates(w.server, w.gym.id, privateSession.id, w.john)).status).toBe(404);
      const alone = await readKeptDates(w.server, w.gym.id, single.id, w.john);
      expect(alone.status).toBe(400);
      expect(await alone.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'sessionId', code: 'not_in_series' }],
      });
    });

    it('AC1: the contract has the read, owner only, and the clients name it', () => {
      const get =
        contract.paths['/v1/workspaces/{workspaceId}/sessions/{sessionId}/kept-dates'].get;
      expect(get.operationId).toBe('getKeptClassDates');
      expect(get['x-access']).toMatchObject({ capability: 'class.manage' });
      expect(Object.keys(get.responses)).toEqual(expect.arrayContaining(['200', '400', '404']));
    });
  });

  it('AC4: the contract has the route, owner only, with the 409 and the clients name it', () => {
    const path = '/v1/workspaces/{workspaceId}/group-classes/{classId}/series/{seriesId}';
    const patch = contract.paths[path].patch;
    expect(patch.operationId).toBe('updateGroupClassSeries');
    expect(patch['x-access']).toMatchObject({ capability: 'class.manage' });
    expect(Object.keys(patch.responses)).toEqual(expect.arrayContaining(['200', '400', '409']));
  });
});
