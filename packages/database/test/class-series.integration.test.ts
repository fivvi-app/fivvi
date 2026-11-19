import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ClassSeriesView,
  classSeries,
  createClassSeries,
  createDatabase,
  createSeriesDates,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  findClassSeries,
  findSession,
  listActiveClassSeries,
  listSeriesDates,
  locations,
  moveDatesToSeries,
  sessions,
  updateClassSeries,
  updateSeriesDates,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addClassSeries,
  addGroupClass,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The weekly series of a class and their dates (F022, spec #428): what the database holds the line
// on, and what the repository stores and reads as the app role. Row-level security is covered by
// the RLS suite, which has a factory for `class_series` (`rls.integration.test.ts`).

describe('F022 class series', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 4 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  async function asOwner<T>(
    accountId: string,
    workspaceId: string,
    run: (scope: WorkspaceScope) => Promise<T>,
  ): Promise<T> {
    const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
      { accountId, workspaceId, admit: () => 'team' },
      run,
    );
    if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
    return entry.value;
  }

  async function violated(insert: (db: DatabaseExecutor) => Promise<unknown>) {
    try {
      await admin.db.transaction(async (tx) => {
        await insert(tx);
        throw new Error('rollback');
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
      if (cause?.code) return cause.constraint ?? cause.code;
      if ((error as Error).message !== 'rollback') throw error;
    }
    return undefined;
  }

  async function gym() {
    const workspace = await createWorkspace(admin.db);
    const john = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: workspace.id, accountId: john.id, role: 'owner' });
    const [location] = await admin.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, workspace.id));
    return { workspace, john, locationId: location?.id ?? '' };
  }

  describe('the tables', () => {
    it('a series points at a class of its own workspace only', async () => {
      const { workspace } = await gym();
      const other = await gym();
      const theirs = await addGroupClass(admin.db, { workspaceId: other.workspace.id });

      expect(
        await violated((tx) =>
          addClassSeries(tx, { workspaceId: workspace.id, groupClassId: theirs.id }),
        ),
      ).toBe('class_series_group_class_fk');
    });

    it('a series holds one weekly rule, a capacity of 1 to 100 and an end that is not before its start', async () => {
      const { workspace } = await gym();
      const insert = (options: Parameters<typeof addClassSeries>[1]) =>
        violated((tx) => addClassSeries(tx, options));

      expect(await insert({ workspaceId: workspace.id })).toBeUndefined();
      for (const rrule of [
        'FREQ=DAILY',
        'FREQ=WEEKLY;BYDAY=TU,TH',
        'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
      ]) {
        expect(await insert({ workspaceId: workspace.id, rrule }), rrule).toBe(
          'class_series_rrule_weekly',
        );
      }
      expect(await insert({ workspaceId: workspace.id, capacity: 0 })).toBe(
        'class_series_capacity_valid',
      );
      expect(await insert({ workspaceId: workspace.id, durationMinutes: 62 })).toBe(
        'class_series_duration_valid',
      );
      expect(
        await insert({ workspaceId: workspace.id, startsOn: '2026-10-06', endsOn: '2026-10-05' }),
      ).toBe('class_series_ends_after_starts');
    });

    it('a series has one date per local day, and a date of a series needs its day', async () => {
      const { workspace } = await gym();
      const series = await addClassSeries(admin.db, { workspaceId: workspace.id });
      const date = (occurrenceDate: string, startsAt: string) =>
        violated((tx) =>
          addSession(tx, {
            workspaceId: workspace.id,
            type: 'group',
            groupClassId: series.groupClassId,
            participant: false,
            startsAt: new Date(startsAt),
            series: { id: series.id, occurrenceDate },
          }),
        );
      expect(await date('2026-10-06', '2026-10-06T16:00:00Z')).toBeUndefined();
      await addSession(admin.db, {
        workspaceId: workspace.id,
        type: 'group',
        groupClassId: series.groupClassId,
        participant: false,
        startsAt: new Date('2026-10-13T16:00:00Z'),
        series: { id: series.id, occurrenceDate: '2026-10-13' },
      });
      expect(await date('2026-10-13', '2026-10-13T16:00:00Z')).toBe(
        'sessions_series_id_occurrence_date_unique',
      );
    });

    it('a date names only the fields that can differ from its series', async () => {
      const { workspace } = await gym();
      const series = await addClassSeries(admin.db, { workspaceId: workspace.id });
      const withFields = (detachedFields: string[]) =>
        violated((tx) =>
          addSession(tx, {
            workspaceId: workspace.id,
            type: 'group',
            groupClassId: series.groupClassId,
            participant: false,
            series: { id: series.id, occurrenceDate: '2026-10-06', detachedFields },
          }),
        );
      expect(await withFields(['time', 'capacity'])).toBeUndefined();
      expect(await withFields(['name'])).toBe('sessions_detached_fields_valid');
    });

    it('a date points at a series of its own workspace only', async () => {
      const { workspace } = await gym();
      const other = await gym();
      const theirs = await addClassSeries(admin.db, { workspaceId: other.workspace.id });
      expect(
        await violated((tx) =>
          addSession(tx, {
            workspaceId: workspace.id,
            type: 'group',
            participant: false,
            series: { id: theirs.id, occurrenceDate: '2026-10-06' },
          }),
        ),
      ).toBe('sessions_series_fk');
    });
  });

  describe('the repository', () => {
    async function aSeries() {
      const world = await gym();
      const groupClass = await addGroupClass(admin.db, { workspaceId: world.workspace.id });
      const series = await asOwner(world.john.id, world.workspace.id, (scope) =>
        createClassSeries(scope, {
          groupClassId: groupClass.id,
          rrule: 'FREQ=WEEKLY;BYDAY=TU',
          localStartTime: '18:00',
          durationMinutes: 60,
          timeZone: 'Europe/Amsterdam',
          trainerProfileId: null,
          capacity: 8,
          startsOn: '2026-10-06',
          endsOn: null,
          materializedUntil: '2026-12-28',
        }),
      );
      return { ...world, groupClass, series };
    }

    const seriesDate = (locationId: string, occurrenceDate: string, startsAt: string) => ({
      locationId,
      occurrenceDate,
      startsAt: new Date(startsAt),
      endsAt: new Date(new Date(startsAt).getTime() + 3_600_000),
      trainerProfileId: null,
      capacity: 8,
      createdByTeamMemberId: null,
    });

    it('stores a series and reads it back with its time as HH:mm', async () => {
      const { workspace, john, groupClass, series } = await aSeries();
      expect(series).toMatchObject({
        groupClassId: groupClass.id,
        rrule: 'FREQ=WEEKLY;BYDAY=TU',
        localStartTime: '18:00',
        durationMinutes: 60,
        timeZone: 'Europe/Amsterdam',
        capacity: 8,
        startsOn: '2026-10-06',
        endsOn: null,
        materializedUntil: '2026-12-28',
        version: 1,
        trainer: null,
      });
      expect(
        await asOwner(john.id, workspace.id, (scope) => findClassSeries(scope, series.id)),
      ).toEqual(series);
    });

    it('makes the dates of a series in one go, lists them, and puts a date on its series', async () => {
      const { workspace, john, locationId, groupClass, series } = await aSeries();
      const count = await asOwner(john.id, workspace.id, (scope) =>
        createSeriesDates(scope, series.id, groupClass.id, [
          seriesDate(locationId, '2026-10-06', '2026-10-06T16:00:00Z'),
          seriesDate(locationId, '2026-10-13', '2026-10-13T16:00:00Z'),
        ]),
      );
      expect(count.map((d) => d.occurrenceDate)).toEqual(['2026-10-06', '2026-10-13']);
      const dates = await asOwner(john.id, workspace.id, (scope) =>
        listSeriesDates(scope, series.id),
      );
      expect(dates.map((d) => [d.occurrenceDate, d.detachedFields, d.status])).toEqual([
        ['2026-10-06', [], 'scheduled'],
        ['2026-10-13', [], 'scheduled'],
      ]);
      const shown = await asOwner(john.id, workspace.id, (scope) =>
        findSession(scope, dates[0]?.id ?? ''),
      );
      expect(shown?.series).toEqual({
        id: series.id,
        rrule: 'FREQ=WEEKLY;BYDAY=TU',
        localStartTime: '18:00',
        occurrenceDate: '2026-10-06',
        detachedFields: [],
      });
    });

    it('changes a series, raising its version, and lists only the series still running', async () => {
      const { workspace, john, groupClass, series } = await aSeries();
      const ended = await asOwner(john.id, workspace.id, (scope) =>
        updateClassSeries(scope, series.id, { endsOn: '2026-10-06' }),
      );
      expect(ended).toMatchObject({ endsOn: '2026-10-06', version: 2 });
      const active = (today: string) =>
        asOwner(john.id, workspace.id, async (scope) =>
          (await listActiveClassSeries(scope, groupClass.id, today)).map(
            (s: ClassSeriesView) => s.id,
          ),
        );
      expect(await active('2026-10-06')).toEqual([series.id]);
      expect(await active('2026-10-07')).toEqual([]);
    });

    it('moves dates to another series and rewrites the fields of the ones that follow, raising their versions', async () => {
      const { workspace, john, locationId, groupClass, series } = await aSeries();
      const later = await asOwner(john.id, workspace.id, (scope) =>
        createClassSeries(scope, {
          groupClassId: groupClass.id,
          rrule: 'FREQ=WEEKLY;BYDAY=TU',
          localStartTime: '18:00',
          durationMinutes: 60,
          timeZone: 'Europe/Amsterdam',
          trainerProfileId: null,
          capacity: 10,
          startsOn: '2026-10-13',
          endsOn: null,
          materializedUntil: '2026-12-28',
        }),
      );
      await asOwner(john.id, workspace.id, (scope) =>
        createSeriesDates(scope, series.id, groupClass.id, [
          seriesDate(locationId, '2026-10-06', '2026-10-06T16:00:00Z'),
          seriesDate(locationId, '2026-10-13', '2026-10-13T16:00:00Z'),
        ]),
      );
      const dates = await asOwner(john.id, workspace.id, (scope) =>
        listSeriesDates(scope, series.id),
      );
      const second = dates[1];
      if (!second) throw new Error('no second date');
      await asOwner(john.id, workspace.id, async (scope) => {
        await moveDatesToSeries(scope, [second.id], later.id);
        await updateSeriesDates(scope, [
          {
            sessionId: second.id,
            startsAt: new Date('2026-10-13T16:30:00Z'),
            endsAt: new Date('2026-10-13T17:30:00Z'),
            trainerProfileId: null,
            capacity: 10,
            detachedFields: [],
          },
        ]);
      });
      expect(
        await asOwner(john.id, workspace.id, (scope) => listSeriesDates(scope, series.id)),
      ).toHaveLength(1);
      const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, second.id));
      expect(row).toMatchObject({
        seriesId: later.id,
        occurrenceDate: '2026-10-13',
        capacity: 10,
        startsAt: new Date('2026-10-13T16:30:00Z'),
        version: 2,
      });
    });

    it('a series of another workspace is not found', async () => {
      const { series } = await aSeries();
      const other = await gym();
      expect(
        await asOwner(other.john.id, other.workspace.id, (scope) =>
          findClassSeries(scope, series.id),
        ),
      ).toBeUndefined();
      const [row] = await admin.db.select().from(classSeries).where(eq(classSeries.id, series.id));
      expect(row?.id).toBe(series.id);
    });
  });
});
