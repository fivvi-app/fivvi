import { readFileSync } from 'node:fs';
import {
  createDatabase,
  type DatabaseClient,
  groupClasses,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import { addGroupClass } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type ClassBody,
  type CreatedClassBody,
  call,
  createClass,
  groupClassWorld,
  kracht,
  listClasses,
  readClass,
  readSession,
  type SessionBody,
  scheduleClass,
  setupGroupClassApi,
  updateClass,
} from './group-classes-world.ts';

// F021 (spec #427), first ticket (#448): group classes through the API. Synthetic people: John (Owner
// of John's Gym, also trains), Sarah and Tom (Trainers), Mike (Owner of Fit Studio). Workspace time
// zone Europe/Amsterdam. The API runs as the app role, so RLS applies.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

describe('F021 group classes through the API', () => {
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
  const storedClasses = (workspaceId: string) =>
    admin.db.select().from(groupClasses).where(eq(groupClasses.organizationId, workspaceId));
  const storedSessions = (workspaceId: string) =>
    admin.db.select().from(sessions).where(eq(sessions.organizationId, workspaceId));

  it('AC1: John creates "Kracht" / "Strength", description in Dutch only, Sarah, 8, 60 minutes: stored for John’s Gym and in the list', async () => {
    const { gym, john, sarahRole } = await groupClassWorld(admin);
    const { server } = setup();

    const response = await createClass(server, gym.id, john, kracht(sarahRole.id));

    expect(response.status).toBe(201);
    const created = (await response.json()) as CreatedClassBody;
    expect(created).toEqual({
      groupClass: {
        id: expect.any(String),
        nameNl: 'Kracht',
        nameEn: 'Strength',
        descriptionNl: 'Een uur krachttraining',
        descriptionEn: null,
        capacity: 8,
        durationMinutes: 60,
        defaultTrainer: { id: sarahRole.id, name: 'Sarah' },
      },
    });
    const stored = await storedClasses(gym.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ organizationId: gym.id, nameNl: 'Kracht', archivedAt: null });

    const list = (await (await listClasses(server, gym.id, john)).json()) as ClassBody[];
    expect(list.map(({ id }) => id)).toEqual([created.groupClass.id]);
    const one = await readClass(server, gym.id, created.groupClass.id, john);
    expect(one.status).toBe(200);
    expect(await one.json()).toEqual(created.groupClass);
  });

  it('keeps the texts as written, trims them, and stores a blank optional text as none', async () => {
    const { gym, john } = await groupClassWorld(admin);
    const { server } = setup();

    const response = await createClass(server, gym.id, john, {
      nameNl: '  Yoga  ',
      nameEn: '   ',
      descriptionNl: '',
      descriptionEn: ' Calm ',
      capacity: 12,
      durationMinutes: 75,
    });

    expect(response.status).toBe(201);
    expect(((await response.json()) as CreatedClassBody).groupClass).toMatchObject({
      nameNl: 'Yoga',
      nameEn: null,
      descriptionNl: null,
      descriptionEn: 'Calm',
    });
  });

  it('AC1: the list is sorted by Dutch name and holds only the workspace’s own classes', async () => {
    const { gym, other, john, mike } = await groupClassWorld(admin);
    const { server } = setup();
    await addGroupClass(admin.db, { workspaceId: gym.id, nameNl: 'Yoga' });
    await addGroupClass(admin.db, { workspaceId: gym.id, nameNl: 'Bootcamp' });
    await addGroupClass(admin.db, { workspaceId: gym.id, nameNl: 'kracht' });
    await addGroupClass(admin.db, { workspaceId: other.id, nameNl: 'Zumba' });

    const list = (await (await listClasses(server, gym.id, john)).json()) as ClassBody[];
    const theirs = (await (await listClasses(server, other.id, mike)).json()) as ClassBody[];

    expect(list.map(({ nameNl }) => nameNl)).toEqual(['Bootcamp', 'kracht', 'Yoga']);
    expect(theirs.map(({ nameNl }) => nameNl)).toEqual(['Zumba']);
  });

  describe('AC2: field validation', () => {
    it.each([
      ['an empty Dutch name', { nameNl: '' }, 'nameNl'],
      ['a blank Dutch name', { nameNl: '   ' }, 'nameNl'],
      ['a Dutch name of 81 characters', { nameNl: 'x'.repeat(81) }, 'nameNl'],
      ['an English name of 81 characters', { nameEn: 'x'.repeat(81) }, 'nameEn'],
      [
        'a Dutch description of 501 characters',
        { descriptionNl: 'x'.repeat(501) },
        'descriptionNl',
      ],
      [
        'an English description of 501 characters',
        { descriptionEn: 'x'.repeat(501) },
        'descriptionEn',
      ],
      ['capacity 0', { capacity: 0 }, 'capacity'],
      ['capacity 101', { capacity: 101 }, 'capacity'],
      ['a capacity of 2.5', { capacity: 2.5 }, 'capacity'],
      ['a duration of 7 minutes', { durationMinutes: 7 }, 'durationMinutes'],
      ['a duration of 10 minutes', { durationMinutes: 10 }, 'durationMinutes'],
      ['a duration of 245 minutes', { durationMinutes: 245 }, 'durationMinutes'],
      ['a duration of 62 minutes (not in steps of 5)', { durationMinutes: 62 }, 'durationMinutes'],
      ['a trainer who is no ID', { trainerId: 'sarah' }, 'trainerId'],
    ])('refuses %s with a field error and stores nothing', async (_name, change, path) => {
      const { gym, john } = await groupClassWorld(admin);
      const { server } = setup();

      const response = await createClass(server, gym.id, john, { ...kracht(), ...change });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string; issues: { path: string }[] };
      expect(body.code).toBe('validation_failed');
      // A duration can be wrong in two ways at once (7 is under 15 and not in steps of 5).
      expect([...new Set(body.issues.map((issue) => issue.path))]).toEqual([path]);
      expect(await storedClasses(gym.id)).toEqual([]);
    });

    it('lists every field that is wrong at once', async () => {
      const { gym, john } = await groupClassWorld(admin);
      const { server } = setup();

      const response = await createClass(server, gym.id, john, {
        nameNl: '',
        capacity: 0,
        durationMinutes: 7,
      });

      const body = (await response.json()) as { issues: { path: string }[] };
      expect([...new Set(body.issues.map((issue) => issue.path))].sort()).toEqual([
        'capacity',
        'durationMinutes',
        'nameNl',
      ]);
    });

    it('accepts the limits themselves: 80 characters, capacity 1 and 100, 15 and 240 minutes', async () => {
      const { gym, john } = await groupClassWorld(admin);
      const { server } = setup();
      for (const change of [
        { nameNl: 'x'.repeat(80), descriptionNl: 'y'.repeat(500) },
        { capacity: 1, durationMinutes: 15 },
        { capacity: 100, durationMinutes: 240 },
      ]) {
        expect((await createClass(server, gym.id, john, { ...kracht(), ...change })).status).toBe(
          201,
        );
      }
    });

    it('@isolation refuses a trainer who does not train in the workspace, or who is in another workspace, with 404 and stores nothing', async () => {
      const { gym, john, mikeRole } = await groupClassWorld(admin);
      const { server } = setup();

      for (const trainerId of [crypto.randomUUID(), mikeRole.id]) {
        const response = await createClass(server, gym.id, john, { ...kracht(), trainerId });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: 'not_found' });
      }
      expect(await storedClasses(gym.id)).toEqual([]);
    });

    it('a team member who does not train is no trainer: an Owner without a trainer profile is refused', async () => {
      const { gym, john, johnRole } = await groupClassWorld(admin);
      await admin.db.delete(trainerProfiles).where(eq(trainerProfiles.teamMemberId, johnRole.id));
      const { server } = setup();

      const response = await createClass(server, gym.id, john, kracht(johnRole.id));

      expect(response.status).toBe(404);
    });
  });

  it('AC5: a class without a trainer is "Trainer nodig": the answer has no trainer', async () => {
    const { gym, john } = await groupClassWorld(admin);
    const { server } = setup();

    const response = await createClass(server, gym.id, john, kracht());

    expect(response.status).toBe(201);
    const { groupClass } = (await response.json()) as CreatedClassBody;
    expect(groupClass).not.toHaveProperty('defaultTrainer');
    expect(await (await listClasses(server, gym.id, john)).json()).toEqual([groupClass]);
  });

  describe('update a class', () => {
    it('changes the fields given and keeps the rest; a blank English text clears it; null makes it Trainer nodig', async () => {
      const { gym, john, tomRole, sarahRole } = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, gym.id, john, kracht(sarahRole.id))
      ).json()) as CreatedClassBody;

      const renamed = await updateClass(server, gym.id, groupClass.id, john, {
        nameNl: 'Krachttraining',
        nameEn: '',
        capacity: 10,
        trainerId: tomRole.id,
      });

      expect(renamed.status).toBe(200);
      expect(await renamed.json()).toEqual({
        ...groupClass,
        nameNl: 'Krachttraining',
        nameEn: null,
        capacity: 10,
        defaultTrainer: { id: tomRole.id, name: 'Tom' },
      });

      const noTrainer = await updateClass(server, gym.id, groupClass.id, john, { trainerId: null });
      expect(noTrainer.status).toBe(200);
      expect(await noTrainer.json()).not.toHaveProperty('defaultTrainer');
      expect((await storedClasses(gym.id))[0]?.defaultTrainerProfileId).toBeNull();
    });

    it('AC2: refuses the same wrong values as the create, and an empty change, and changes nothing', async () => {
      const { gym, john } = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, gym.id, john, kracht())
      ).json()) as CreatedClassBody;

      for (const [change, path] of [
        [{ nameNl: '' }, 'nameNl'],
        [{ capacity: 101 }, 'capacity'],
        [{ durationMinutes: 7 }, 'durationMinutes'],
        [{}, 'nameNl'],
      ] as const) {
        const response = await updateClass(server, gym.id, groupClass.id, john, change);
        expect(response.status).toBe(400);
        const body = (await response.json()) as { issues: { path: string }[] };
        expect([...new Set(body.issues.map((issue) => issue.path))]).toEqual([path]);
      }
      expect(await (await readClass(server, gym.id, groupClass.id, john)).json()).toEqual(
        groupClass,
      );
    });

    it('@isolation answers 404 for a class that does not exist, or is another workspace’s', async () => {
      const { gym, other, john } = await groupClassWorld(admin);
      const { server } = setup();
      const theirs = await addGroupClass(admin.db, { workspaceId: other.id });

      for (const classId of [crypto.randomUUID(), theirs.id]) {
        expect((await updateClass(server, gym.id, classId, john, { capacity: 5 })).status).toBe(
          404,
        );
        expect((await readClass(server, gym.id, classId, john)).status).toBe(404);
        expect(
          (
            await scheduleClass(server, gym.id, classId, john, {
              localDate: '2026-10-06',
              localStart: '18:00',
            })
          ).status,
        ).toBe(404);
      }
      const [stored] = await admin.db
        .select({ capacity: groupClasses.capacity })
        .from(groupClasses)
        .where(eq(groupClasses.id, theirs.id));
      expect(stored?.capacity).toBe(8);
    });
  });

  describe('schedule a class on a date', () => {
    it('AC3: Kracht on Tuesday 6 October 2026 at 18:00 is stored as a group session with Sarah, 8, the default location, 16:00 to 17:00 UTC', async () => {
      const { gym, john, sarahRole } = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, gym.id, john, kracht(sarahRole.id))
      ).json()) as CreatedClassBody;

      const response = await scheduleClass(server, gym.id, groupClass.id, john, {
        localDate: '2026-10-06',
        localStart: '18:00',
      });

      expect(response.status).toBe(201);
      const session = (await response.json()) as SessionBody;
      expect(session).toEqual({
        id: expect.any(String),
        type: 'group',
        status: 'scheduled',
        startsAt: '2026-10-06T16:00:00.000Z',
        endsAt: '2026-10-06T17:00:00.000Z',
        timeZone: 'Europe/Amsterdam',
        capacity: 8,
        version: 1,
        location: expect.objectContaining({ name: gym.marker, isDefault: true }),
        trainer: { id: sarahRole.id, name: 'Sarah' },
        groupClass: { id: groupClass.id, nameNl: 'Kracht', nameEn: 'Strength' },
        participants: [],
      });
      const [stored] = await storedSessions(gym.id);
      expect(stored).toMatchObject({
        id: session.id,
        organizationId: gym.id,
        type: 'group',
        groupClassId: groupClass.id,
        capacity: 8,
      });
      // The date opens through F020's session read.
      const read = await readSession(server, gym.id, session.id, john);
      expect(read.status).toBe(200);
      expect(await read.json()).toEqual(session);
    });

    it('AC5: a class without a trainer gives a date without a trainer', async () => {
      const { gym, john } = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, gym.id, john, kracht())
      ).json()) as CreatedClassBody;

      const response = await scheduleClass(server, gym.id, groupClass.id, john, {
        localDate: '2026-10-06',
        localStart: '18:00',
      });

      expect(response.status).toBe(201);
      const session = (await response.json()) as SessionBody;
      expect(session).not.toHaveProperty('trainer');
      expect((await storedSessions(gym.id))[0]?.trainerProfileId).toBeNull();
    });

    it('takes a trainer and a capacity of its own for the date, and null makes the date Trainer nodig', async () => {
      const { gym, john, sarahRole, tomRole } = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, gym.id, john, kracht(sarahRole.id))
      ).json()) as CreatedClassBody;
      const date = (body: object) =>
        scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-06',
          localStart: '18:00',
          ...body,
        });

      const withTom = (await (
        await date({ trainerId: tomRole.id, capacity: 12 })
      ).json()) as SessionBody;
      const without = (await (await date({ trainerId: null })).json()) as SessionBody;

      expect(withTom).toMatchObject({ trainer: { id: tomRole.id }, capacity: 12 });
      expect(without).not.toHaveProperty('trainer');
      // The class is unchanged by its dates.
      expect(await (await readClass(server, gym.id, groupClass.id, john)).json()).toEqual(
        groupClass,
      );
    });

    it('AC9: a later change of the class does not change a date already planned', async () => {
      const { gym, john, sarahRole, tomRole } = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, gym.id, john, kracht(sarahRole.id))
      ).json()) as CreatedClassBody;
      const planned = (await (
        await scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-06',
          localStart: '18:00',
        })
      ).json()) as SessionBody;

      await updateClass(server, gym.id, groupClass.id, john, {
        capacity: 20,
        durationMinutes: 90,
        trainerId: tomRole.id,
      });

      const read = (await (
        await readSession(server, gym.id, planned.id, john)
      ).json()) as SessionBody;
      expect(read).toMatchObject({
        capacity: 8,
        endsAt: '2026-10-06T17:00:00.000Z',
        trainer: { id: sarahRole.id },
      });
      // The next date copies the class as it is now.
      const next = (await (
        await scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-13',
          localStart: '18:00',
        })
      ).json()) as SessionBody;
      expect(next).toMatchObject({
        capacity: 20,
        endsAt: '2026-10-13T17:30:00.000Z',
        trainer: { id: tomRole.id },
      });
    });

    describe('AC9: the daylight saving rules of F020 apply unchanged', () => {
      async function aClass() {
        const world = await groupClassWorld(admin);
        const { server } = setup();
        const { groupClass } = (await (
          await createClass(server, world.gym.id, world.john, kracht())
        ).json()) as CreatedClassBody;
        return { ...world, server, groupClass };
      }

      it('refuses 28 March 2027 at 02:30, the time the clocks skip, with a field error on the start', async () => {
        const { gym, john, server, groupClass } = await aClass();

        const response = await scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2027-03-28',
          localStart: '02:30',
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          code: 'validation_failed',
          issues: [{ path: 'localStart', code: 'time_does_not_exist' }],
        });
        expect(await storedSessions(gym.id)).toEqual([]);
      });

      it('25 October 2026 at 02:30 happens twice: the date starts at the first, 00:30 UTC', async () => {
        const { gym, john, server, groupClass } = await aClass();

        const response = await scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-25',
          localStart: '02:30',
        });

        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ startsAt: '2026-10-25T00:30:00.000Z' });
      });

      it('refuses a date and a start that are none, and a capacity outside 1 to 100', async () => {
        const { gym, john, server, groupClass } = await aClass();
        const date = (body: object) =>
          scheduleClass(server, gym.id, groupClass.id, john, {
            localDate: '2026-10-06',
            localStart: '18:00',
            ...body,
          });

        for (const [body, path] of [
          [{ localDate: '2026-02-30' }, 'localDate'],
          [{ localStart: '25:00' }, 'localStart'],
          [{ localStart: '9am' }, 'localStart'],
          [{ capacity: 0 }, 'capacity'],
          [{ capacity: 101 }, 'capacity'],
        ] as const) {
          const response = await date(body);
          expect(response.status).toBe(400);
          expect(
            ((await response.json()) as { issues: { path: string }[] }).issues.map((i) => i.path),
          ).toEqual([path]);
        }
        expect(await storedSessions(gym.id)).toEqual([]);
      });

      it('answers 404 for a trainer who does not train in the workspace', async () => {
        const { gym, john, mikeRole, server, groupClass } = await aClass();

        const response = await scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-06',
          localStart: '18:00',
          trainerId: mikeRole.id,
        });

        expect(response.status).toBe(404);
        expect(await storedSessions(gym.id)).toEqual([]);
      });
    });
  });

  describe('AC6: the quick create makes the class and its date in one transaction', () => {
    it('stores a class "Mobility" with one date, and the class is in the list', async () => {
      const { gym, john, sarahRole } = await groupClassWorld(admin);
      const { server } = setup();

      const response = await createClass(server, gym.id, john, {
        nameNl: 'Mobility',
        trainerId: sarahRole.id,
        capacity: 10,
        durationMinutes: 45,
        firstDate: { localDate: '2026-10-06', localStart: '18:00' },
      });

      expect(response.status).toBe(201);
      const created = (await response.json()) as CreatedClassBody;
      expect(created.groupClass).toMatchObject({ nameNl: 'Mobility', durationMinutes: 45 });
      expect(created.firstDate).toMatchObject({
        type: 'group',
        startsAt: '2026-10-06T16:00:00.000Z',
        endsAt: '2026-10-06T16:45:00.000Z',
        capacity: 10,
        trainer: { id: sarahRole.id },
        groupClass: { id: created.groupClass.id, nameNl: 'Mobility' },
      });
      expect(await storedClasses(gym.id)).toHaveLength(1);
      expect(await storedSessions(gym.id)).toHaveLength(1);
      expect(
        ((await (await listClasses(server, gym.id, john)).json()) as ClassBody[]).map(
          ({ nameNl }) => nameNl,
        ),
      ).toEqual(['Mobility']);
    });

    it('a failing date leaves no class: a time the clocks skip answers 400 and nothing is stored', async () => {
      const { gym, john } = await groupClassWorld(admin);
      const { server } = setup();

      const response = await createClass(server, gym.id, john, {
        ...kracht(),
        firstDate: { localDate: '2027-03-28', localStart: '02:30' },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'firstDate.localStart', code: 'time_does_not_exist' }],
      });
      expect(await storedClasses(gym.id)).toEqual([]);
      expect(await storedSessions(gym.id)).toEqual([]);
    });

    it('a date the database refuses leaves no class: the class and the date stand or fall together', async () => {
      const { gym, john } = await groupClassWorld(admin);
      const { server } = setup();
      // The class is stored before the date, and the date's insert fails at the database: the
      // class must not stay. (A trigger of this workspace only, dropped right after.)
      const trigger = `fail_group_session_${gym.id.replaceAll('-', '')}`;
      await admin.db.execute(
        sql.raw(`create function ${trigger}() returns trigger language plpgsql as $$
          begin
            if new.organization_id = '${gym.id}' then raise exception 'the date was refused'; end if;
            return new;
          end $$`),
      );
      await admin.db.execute(
        sql.raw(
          `create trigger ${trigger} before insert on sessions for each row execute function ${trigger}()`,
        ),
      );
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const response = await createClass(server, gym.id, john, {
          ...kracht(),
          firstDate: { localDate: '2026-10-06', localStart: '18:00' },
        });

        expect(response.status).toBe(500);
        expect(await storedClasses(gym.id)).toEqual([]);
        expect(await storedSessions(gym.id)).toEqual([]);
      } finally {
        errors.mockRestore();
        await admin.db.execute(sql.raw(`drop trigger ${trigger} on sessions`));
        await admin.db.execute(sql.raw(`drop function ${trigger}()`));
      }
    });

    it('a date is not needed: without firstDate only the class is made', async () => {
      const { gym, john } = await groupClassWorld(admin);
      const { server } = setup();

      const created = (await (
        await createClass(server, gym.id, john, kracht())
      ).json()) as CreatedClassBody;

      expect(created).not.toHaveProperty('firstDate');
      expect(await storedSessions(gym.id)).toEqual([]);
    });
  });

  describe('AC7: a Trainer reads and cannot manage', () => {
    it('@permission Sarah lists and reads classes and opens a class date, and gets 403 on create, edit and schedule', async () => {
      const { gym, john, sarah, sarahRole } = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, gym.id, john, kracht(sarahRole.id))
      ).json()) as CreatedClassBody;
      const date = (await (
        await scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-06',
          localStart: '18:00',
        })
      ).json()) as SessionBody;

      expect((await listClasses(server, gym.id, sarah)).status).toBe(200);
      expect(await (await readClass(server, gym.id, groupClass.id, sarah)).json()).toEqual(
        groupClass,
      );
      const opened = await readSession(server, gym.id, date.id, sarah);
      expect(opened.status).toBe(200);
      expect(await opened.json()).toEqual(date);

      const forbidden = { code: 'forbidden' };
      const create = await createClass(server, gym.id, sarah, kracht());
      expect(create.status).toBe(403);
      expect(await create.json()).toEqual(forbidden);
      const edit = await updateClass(server, gym.id, groupClass.id, sarah, { capacity: 5 });
      expect(edit.status).toBe(403);
      const schedule = await scheduleClass(server, gym.id, groupClass.id, sarah, {
        localDate: '2026-10-13',
        localStart: '18:00',
      });
      expect(schedule.status).toBe(403);
      const editDate = await call(
        server,
        'PATCH',
        `/v1/workspaces/${gym.id}/sessions/${date.id}`,
        sarah,
        { version: 1, capacity: 5 },
      );
      expect(editDate.status).toBe(403);
      expect(await storedClasses(gym.id)).toHaveLength(1);
      expect(await storedSessions(gym.id)).toHaveLength(1);
      expect((await storedClasses(gym.id))[0]?.capacity).toBe(8);
    });
  });

  describe('AC8: other workspaces and anonymous callers', () => {
    it('@isolation @permission Mike gets 404 on every John’s Gym class and class-date route; anonymous callers get 401', async () => {
      const { gym, john, mike } = await groupClassWorld(admin);
      const { server } = setup();
      const { groupClass } = (await (
        await createClass(server, gym.id, john, kracht())
      ).json()) as CreatedClassBody;
      const date = (await (
        await scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-06',
          localStart: '18:00',
        })
      ).json()) as SessionBody;
      const body = { localDate: '2026-10-13', localStart: '18:00' };
      const routes: [string, string, unknown][] = [
        ['GET', `/v1/workspaces/${gym.id}/group-classes`, undefined],
        ['POST', `/v1/workspaces/${gym.id}/group-classes`, kracht()],
        ['GET', `/v1/workspaces/${gym.id}/group-classes/${groupClass.id}`, undefined],
        ['PATCH', `/v1/workspaces/${gym.id}/group-classes/${groupClass.id}`, { capacity: 5 }],
        ['POST', `/v1/workspaces/${gym.id}/group-classes/${groupClass.id}/dates`, body],
        ['GET', `/v1/workspaces/${gym.id}/sessions/${date.id}`, undefined],
        ['PATCH', `/v1/workspaces/${gym.id}/sessions/${date.id}`, { version: 1, capacity: 5 }],
      ];

      for (const [method, path, payload] of routes) {
        const asMike = await call(server, method, path, mike, payload);
        expect([method, path, asMike.status]).toEqual([method, path, 404]);
        expect(await asMike.json()).toEqual({ code: 'not_found' });
        const anonymous = await call(server, method, path, undefined, payload);
        expect([method, path, anonymous.status]).toEqual([method, path, 401]);
      }
      expect(await storedClasses(gym.id)).toHaveLength(1);
      expect(await storedSessions(gym.id)).toHaveLength(1);
    });

    it('@permission a client of the workspace gets 403 on the team’s class routes', async () => {
      const { gym, annaAccount } = await groupClassWorld(admin);
      const { server } = setup();

      expect((await listClasses(server, gym.id, annaAccount)).status).toBe(403);
      expect((await createClass(server, gym.id, annaAccount, kracht())).status).toBe(403);
    });
  });

  describe('AC11: the events carry no personal data', () => {
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

    it('class_created and class_scheduled have the workspace ID and the surface only; refusals record nothing', async () => {
      const { posthog, lines, productEvents, restore } = withEvents();
      const { gym, john, sarah, sarahRole } = await groupClassWorld(admin);
      const { server } = setup({ productEvents });

      // A refusal, an invalid body, a DST error and an unknown class record nothing.
      await createClass(server, gym.id, sarah, kracht());
      await createClass(server, gym.id, john, {});
      await createClass(server, gym.id, john, {
        ...kracht(),
        firstDate: { localDate: '2027-03-28', localStart: '02:30' },
      });
      await scheduleClass(server, gym.id, crypto.randomUUID(), john, {
        localDate: '2026-10-06',
        localStart: '18:00',
      });
      expect(posthog.events).toEqual([]);

      // The web sends no bearer token; the app names its surface. A bearer token without one records nothing.
      const web = (await (
        await createClass(server, gym.id, john, kracht(sarahRole.id))
      ).json()) as CreatedClassBody;
      const scheduled = (await (
        await scheduleClass(server, gym.id, web.groupClass.id, john, {
          localDate: '2026-10-06',
          localStart: '18:00',
        })
      ).json()) as SessionBody;
      await createClass(
        server,
        gym.id,
        john,
        {
          ...kracht(),
          nameNl: 'Geheime les',
          surface: 'ios',
          firstDate: { localDate: '2026-10-07', localStart: '19:15' },
        },
        { authorization: 'Bearer synthetic-token' },
      );
      await createClass(server, gym.id, john, kracht(), {
        authorization: 'Bearer synthetic-token',
      });

      expect(posthog.events.map(({ event }) => event)).toEqual([
        'class_created',
        'class_scheduled',
        'class_created',
        'class_scheduled',
      ]);
      expect(posthog.events.map(properties)).toEqual([
        { workspace_id: gym.id, surface: 'web' },
        { workspace_id: gym.id, surface: 'web' },
        { workspace_id: gym.id, surface: 'ios' },
        { workspace_id: gym.id, surface: 'ios' },
      ]);
      expect(posthog.events[0]?.distinct_id).toBe(john.id);
      const sent = JSON.stringify([posthog.events, lines]);
      for (const personal of [
        'Kracht',
        'Strength',
        'Geheime les',
        'Sarah',
        sarah.email,
        john.email,
        web.groupClass.id,
        scheduled.id,
        '2026-10-06',
        '19:15',
      ]) {
        expect(sent).not.toContain(personal);
      }
      restore();
    });
  });

  it('AC10: the routes are in the committed contract with x-access for the Owner (manage) or the team (read)', () => {
    const base = '/v1/workspaces/{workspaceId}/group-classes';
    const one = `${base}/{classId}`;
    const manage = (capability: string, roles: string[]) => ({
      type: 'workspace',
      capability,
      roles,
      client: 'none',
    });
    const expected: [string, string, string, ReturnType<typeof manage>][] = [
      [base, 'get', 'listGroupClasses', manage('class.read', ['owner', 'trainer'])],
      [base, 'post', 'createGroupClass', manage('class.manage', ['owner'])],
      [one, 'get', 'getGroupClass', manage('class.read', ['owner', 'trainer'])],
      [one, 'patch', 'updateGroupClass', manage('class.manage', ['owner'])],
      [`${one}/dates`, 'post', 'scheduleGroupClassDate', manage('class.manage', ['owner'])],
      [
        '/v1/workspaces/{workspaceId}/sessions/{sessionId}',
        'patch',
        'updateGroupClassDate',
        manage('class.manage', ['owner']),
      ],
    ];
    for (const [path, method, operationId, access] of expected) {
      const operation = contract.paths[path][method];
      expect(operation.operationId).toBe(operationId);
      expect(operation['x-access']).toEqual(access);
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['401', '403', '404']),
      );
    }
    // Instants and the zone, a class reference by name; no contact detail anywhere.
    expect(Object.keys(contract.components.schemas.Session.properties)).toContain('groupClass');
    expect(Object.keys(contract.components.schemas.GroupClass.properties).join()).not.toMatch(
      /mail/i,
    );
  });
});
