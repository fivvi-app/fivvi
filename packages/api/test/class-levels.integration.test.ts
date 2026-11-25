import { readFileSync } from 'node:fs';
import { classSeries, createDatabase, type DatabaseClient, sessions } from '@fivvi/database';
import { addClient, addParticipants, addSession } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type ClassBody,
  type CreatedClassBody,
  call,
  createClass,
  groupClassWorld,
  kracht,
  listClasses,
  listSeries,
  myDay,
  mySessions,
  readClass,
  readSession,
  type SeriesBody,
  type SessionBody,
  scheduleClass,
  setupGroupClassApi,
  updateClass,
  updateDate,
  updateSeries,
} from './group-classes-world.ts';

// F067 Class Levels (spec #587), through the API: the first ticket (#756) gives a class, a class on
// a date, one date and My day a level; the second (#759) gives weekly series one. Synthetic people:
// John (Owner of John's Gym, also trains), Sarah and Tom (Trainers), Anna de Vries (a client),
// Mike (Owner of Fit Studio). Class "Reformer Power" with Sarah, 8 places, 60 minutes; Tuesday
// 6 October 2026 at 18:00, a week after "now" (Monday 28 September).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const LEVELS = ['all_levels', 'beginner', 'intermediate', 'advanced'] as const;

interface DayItem {
  sessionId: string;
  type: string;
  className?: string;
  level?: string;
}

describe('F067 the class level through the API', () => {
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

  /** The reformer class as John's form sends it, with a level unless it says otherwise. */
  const reformer = (trainerId: string, level?: string | null) => ({
    ...kracht(trainerId),
    nameNl: 'Reformer Power',
    nameEn: 'Reformer Power',
    ...(level === undefined ? {} : { level }),
  });

  async function aWorld(overrides = {}) {
    const world = await groupClassWorld(admin);
    const { server } = setupGroupClassApi(admin, app, overrides);
    return { ...world, server };
  }

  /** John's Gym with "Reformer Power" at `advanced` and one date on Tuesday 6 October. */
  async function aClassWithADate(level: string | null = 'advanced') {
    const w = await aWorld();
    const { groupClass } = (await (
      await createClass(w.server, w.gym.id, w.john, reformer(w.sarahRole.id, level))
    ).json()) as CreatedClassBody;
    const date = (await (
      await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        localDate: '2026-10-06',
        localStart: '18:00',
      })
    ).json()) as SessionBody;
    return { ...w, groupClass, date };
  }

  const storedDate = async (sessionId: string) => {
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, sessionId));
    return row;
  };

  describe('AC1: class and its dates', () => {
    it('AC1: class and its dates: John creates Reformer Power with Gevorderd and schedules it; the class and the date carry advanced', async () => {
      const w = await aWorld();

      const created = await createClass(
        w.server,
        w.gym.id,
        w.john,
        reformer(w.sarahRole.id, 'advanced'),
      );

      expect(created.status).toBe(201);
      const { groupClass } = (await created.json()) as CreatedClassBody;
      expect(groupClass.level).toBe('advanced');
      const scheduled = await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        localDate: '2026-10-06',
        localStart: '18:00',
      });
      expect(scheduled.status).toBe(201);
      const date = (await scheduled.json()) as SessionBody;
      expect(date.level).toBe('advanced');
      expect((await storedDate(date.id))?.level).toBe('advanced');
      // Every read of the class and of the date returns it.
      expect(
        ((await (await readClass(w.server, w.gym.id, groupClass.id, w.john)).json()) as ClassBody)
          .level,
      ).toBe('advanced');
      expect(
        ((await (await listClasses(w.server, w.gym.id, w.john)).json()) as ClassBody[]).map(
          (each) => each.level,
        ),
      ).toEqual(['advanced']);
      expect(
        ((await (await readSession(w.server, w.gym.id, date.id, w.john)).json()) as SessionBody)
          .level,
      ).toBe('advanced');
    });

    it('AC1: the quick create with its first date: the class and the first date carry the level', async () => {
      const w = await aWorld();

      const response = await createClass(w.server, w.gym.id, w.john, {
        ...reformer(w.sarahRole.id, 'advanced'),
        firstDate: { localDate: '2026-10-06', localStart: '18:00' },
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as CreatedClassBody;
      expect(body.groupClass.level).toBe('advanced');
      expect(body.firstDate?.level).toBe('advanced');
      expect((await storedDate(body.firstDate?.id ?? ''))?.level).toBe('advanced');
    });

    it('AC1: the date chosen with its own level takes it, the class keeps its own', async () => {
      const w = await aClassWithADate();

      const response = await scheduleClass(w.server, w.gym.id, w.groupClass.id, w.john, {
        localDate: '2026-10-13',
        localStart: '18:00',
        level: 'beginner',
      });

      expect(((await response.json()) as SessionBody).level).toBe('beginner');
      expect(
        ((await (await readClass(w.server, w.gym.id, w.groupClass.id, w.john)).json()) as ClassBody)
          .level,
      ).toBe('advanced');
    });

    it('AC1: a date is planned as Geen with null, and a class without a level leaves the field out', async () => {
      const w = await aClassWithADate();
      const geen = await scheduleClass(w.server, w.gym.id, w.groupClass.id, w.john, {
        localDate: '2026-10-13',
        localStart: '18:00',
        level: null,
      });
      expect(await geen.json()).not.toHaveProperty('level');

      const plain = await createClass(w.server, w.gym.id, w.john, reformer(w.sarahRole.id));
      const { groupClass } = (await plain.json()) as CreatedClassBody;
      expect(groupClass).not.toHaveProperty('level');
      const date = (await (
        await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
          localDate: '2026-10-20',
          localStart: '18:00',
        })
      ).json()) as SessionBody;
      expect(date).not.toHaveProperty('level');
      expect((await storedDate(date.id))?.level).toBeNull();
    });

    it('AC1: changing the level of the class leaves the dates already planned with their copy', async () => {
      const w = await aClassWithADate();

      const response = await updateClass(w.server, w.gym.id, w.groupClass.id, w.john, {
        level: 'beginner',
      });

      expect(((await response.json()) as ClassBody).level).toBe('beginner');
      expect((await storedDate(w.date.id))?.level).toBe('advanced');
      const next = (await (
        await scheduleClass(w.server, w.gym.id, w.groupClass.id, w.john, {
          localDate: '2026-10-13',
          localStart: '18:00',
        })
      ).json()) as SessionBody;
      expect(next.level).toBe('beginner');
    });

    it('AC1: My day returns the level of Sarah’s date, and My sessions too', async () => {
      const w = await aClassWithADate();

      const day = (await (await myDay(w.server, '2026-10-06', w.sarah)).json()) as {
        items: DayItem[];
      };
      const range = (await (
        await mySessions(w.server, '2026-10-06', '2026-10-07', w.sarah)
      ).json()) as {
        items: DayItem[];
      };

      for (const items of [day.items, range.items]) {
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
          sessionId: w.date.id,
          type: 'group',
          className: 'Reformer Power',
          level: 'advanced',
        });
      }
    });

    it('AC1: a date without a level leaves it out of My day, and a private session never has one', async () => {
      const w = await aClassWithADate(null);
      const priv = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: (await addClient(admin.db, { workspaceId: w.gym.id })).id,
        trainerProfileId: w.date.trainer
          ? ((await admin.db.select().from(sessions).where(eq(sessions.id, w.date.id)))[0]
              ?.trainerProfileId ?? null)
          : null,
        startsAt: new Date('2026-10-06T14:00:00.000Z'),
      });

      const day = (await (await myDay(w.server, '2026-10-06', w.sarah)).json()) as {
        items: DayItem[];
      };

      expect(day.items.map((item) => item.sessionId)).toContain(priv.id);
      expect(day.items.every((item) => !('level' in item))).toBe(true);
    });

    it('AC1: the workspace calendar returns the level of the date, and leaves it out for Geen and a private session', async () => {
      const w = await aClassWithADate('advanced');
      const withoutLevel = (await (
        await createClass(w.server, w.gym.id, w.john, {
          ...reformer(w.sarahRole.id),
          nameNl: 'Kracht',
          nameEn: 'Strength',
        })
      ).json()) as CreatedClassBody;
      const geen = (await (
        await scheduleClass(w.server, w.gym.id, withoutLevel.groupClass.id, w.john, {
          localDate: '2026-10-07',
          localStart: '18:00',
        })
      ).json()) as SessionBody;
      const priv = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: (await addClient(admin.db, { workspaceId: w.gym.id })).id,
        startsAt: new Date('2026-10-08T14:00:00.000Z'),
      });

      const response = await call(
        w.server,
        'GET',
        `/v1/workspaces/${w.gym.id}/calendar?from=2026-10-05&to=2026-10-11`,
        w.john,
      );

      expect(response.status).toBe(200);
      const { items } = (await response.json()) as { items: { id: string; level?: string }[] };
      const byId = (id: string) => items.find((item) => item.id === id);
      expect(byId(w.date.id)?.level).toBe('advanced');
      expect(byId(geen.id)).toBeDefined();
      expect(byId(geen.id)).not.toHaveProperty('level');
      expect(byId(priv.id)).toBeDefined();
      expect(byId(priv.id)).not.toHaveProperty('level');
    });
  });

  describe('#763 the workspace calendar read', () => {
    it('AC11, AC12: the calendar read returns the level to Sarah (Trainer), 404 to Mike in another workspace and 401 to anonymous', async () => {
      const w = await aClassWithADate('advanced');
      const path = `/v1/workspaces/${w.gym.id}/calendar?from=2026-10-05&to=2026-10-11`;

      const asSarah = await call(w.server, 'GET', path, w.sarah);
      const asMike = await call(w.server, 'GET', path, w.mike);
      const anonymous = await call(w.server, 'GET', path, undefined);

      expect(asSarah.status).toBe(200);
      const { items } = (await asSarah.json()) as { items: { id: string; level?: string }[] };
      expect(items.find((item) => item.id === w.date.id)?.level).toBe('advanced');
      expect(asMike.status).toBe(404);
      expect(await asMike.json()).toEqual({ code: 'not_found' });
      expect(anonymous.status).toBe(401);
    });
  });

  describe('AC3: one date', () => {
    it('AC3: one date: John changes one date to beginner; only that date changes, the class and the other date keep advanced', async () => {
      const w = await aClassWithADate();
      const other = (await (
        await scheduleClass(w.server, w.gym.id, w.groupClass.id, w.john, {
          localDate: '2026-10-13',
          localStart: '18:00',
        })
      ).json()) as SessionBody;

      const response = await updateDate(w.server, w.gym.id, w.date.id, w.john, {
        version: 1,
        level: 'beginner',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...w.date, level: 'beginner', version: 2 });
      expect(await (await readSession(w.server, w.gym.id, other.id, w.john)).json()).toEqual(other);
      expect(
        ((await (await readClass(w.server, w.gym.id, w.groupClass.id, w.john)).json()) as ClassBody)
          .level,
      ).toBe('advanced');
    });

    it('AC3: null clears the level of the date: Geen leaves the field out, and the class keeps its own', async () => {
      const w = await aClassWithADate();

      const response = await updateDate(w.server, w.gym.id, w.date.id, w.john, {
        version: 1,
        level: null,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).not.toHaveProperty('level');
      expect((await storedDate(w.date.id))?.level).toBeNull();
    });

    it('AC3: the level goes with other fields of the edit, and a time change alone keeps it', async () => {
      const w = await aClassWithADate();

      const both = await updateDate(w.server, w.gym.id, w.date.id, w.john, {
        version: 1,
        level: 'intermediate',
        capacity: 10,
      });
      expect(await both.json()).toMatchObject({ level: 'intermediate', capacity: 10, version: 2 });
      const time = await updateDate(w.server, w.gym.id, w.date.id, w.john, {
        version: 2,
        localStart: '18:30',
      });
      expect(await time.json()).toMatchObject({ level: 'intermediate', version: 3 });
    });

    it('AC3: a date of a series is marked as changed on its own: the level is among its changedFields', async () => {
      const w = await aWorld();
      const { groupClass } = (await (
        await createClass(w.server, w.gym.id, w.john, reformer(w.sarahRole.id, 'advanced'))
      ).json()) as CreatedClassBody;
      const first = (await (
        await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
          localDate: '2026-10-06',
          localStart: '18:00',
          repeat: 'weekly',
        })
      ).json()) as SessionBody;

      const response = await updateDate(w.server, w.gym.id, first.id, w.john, {
        version: 1,
        level: 'beginner',
      });

      expect(await response.json()).toMatchObject({
        level: 'beginner',
        series: { changedFields: ['level'] },
      });
      expect((await storedDate(first.id))?.detachedFields).toEqual(['level']);
    });
  });

  describe('AC4: not on the list, 422', () => {
    it('AC4: not on the list, 422: every route that takes a level answers 422 on level and stores nothing', async () => {
      const w = await aClassWithADate();
      const { server, gym, john, groupClass, date } = w;
      const weekly = (await (
        await scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-13',
          localStart: '19:00',
          repeat: 'weekly',
        })
      ).json()) as SessionBody;
      const [stored] = await admin.db
        .select()
        .from(classSeries)
        .where(eq(classSeries.organizationId, gym.id));
      const seriesId = stored?.id ?? '';

      const responses = await Promise.all([
        createClass(server, gym.id, john, reformer(w.sarahRole.id, 'expert')),
        updateClass(server, gym.id, groupClass.id, john, { level: 'expert' }),
        scheduleClass(server, gym.id, groupClass.id, john, {
          localDate: '2026-10-20',
          localStart: '18:00',
          level: 'expert',
        }),
        updateDate(server, gym.id, date.id, john, { version: 1, level: 'expert' }),
        updateSeries(server, gym.id, groupClass.id, seriesId, john, {
          version: 1,
          level: 'expert',
        }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({
          code: 'validation_failed',
          issues: [{ path: 'level', code: 'invalid_value' }],
        });
      }
      // Nothing was stored.
      expect((await storedDate(date.id))?.level).toBe('advanced');
      expect((await storedDate(date.id))?.version).toBe(1);
      expect(weekly.level).toBe('advanced');
      expect(
        ((await (await readClass(server, gym.id, groupClass.id, john)).json()) as ClassBody).level,
      ).toBe('advanced');
      expect((await (await listClasses(server, gym.id, john)).json()) as ClassBody[]).toHaveLength(
        1,
      );
    });

    it('AC4: every value of the list is taken, and null clears the class’s level', async () => {
      const w = await aClassWithADate();

      for (const level of LEVELS) {
        const response = await updateClass(w.server, w.gym.id, w.groupClass.id, w.john, { level });
        expect(((await response.json()) as ClassBody).level).toBe(level);
      }
      const cleared = await updateClass(w.server, w.gym.id, w.groupClass.id, w.john, {
        level: null,
      });
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).not.toHaveProperty('level');
    });

    it('AC4: a wrong type is no value of the list either, and another invalid field next to it stays a 400', async () => {
      const w = await aClassWithADate();

      const number = await updateClass(w.server, w.gym.id, w.groupClass.id, w.john, { level: 3 });
      const mixed = await updateClass(w.server, w.gym.id, w.groupClass.id, w.john, {
        level: 'expert',
        capacity: 0,
      });

      expect(number.status).toBe(422);
      expect(mixed.status).toBe(400);
    });
  });

  describe('AC8: Sarah (Trainer)', () => {
    it('AC8: Trainer reads, 403 on change: Sarah reads the level on the class and date routes and in My day', async () => {
      const w = await aClassWithADate();

      const list = (await (await listClasses(w.server, w.gym.id, w.sarah)).json()) as ClassBody[];
      const one = (await (
        await readClass(w.server, w.gym.id, w.groupClass.id, w.sarah)
      ).json()) as ClassBody;
      const date = (await (
        await readSession(w.server, w.gym.id, w.date.id, w.sarah)
      ).json()) as SessionBody;
      const day = (await (await myDay(w.server, '2026-10-06', w.sarah)).json()) as {
        items: DayItem[];
      };

      expect(list.map((each) => each.level)).toEqual(['advanced']);
      expect(one.level).toBe('advanced');
      expect(date.level).toBe('advanced');
      expect(day.items[0]?.level).toBe('advanced');
    });

    it('AC8: every change of a level answers 403 for Sarah under class.manage, and nothing changes', async () => {
      const w = await aClassWithADate();
      const weekly = (await (
        await scheduleClass(w.server, w.gym.id, w.groupClass.id, w.john, {
          localDate: '2026-10-13',
          localStart: '19:00',
          repeat: 'weekly',
        })
      ).json()) as SessionBody;
      const [series] = await admin.db
        .select()
        .from(classSeries)
        .where(eq(classSeries.organizationId, w.gym.id));
      const level = { level: 'beginner' };

      const responses = await Promise.all([
        createClass(w.server, w.gym.id, w.sarah, reformer(w.sarahRole.id, 'beginner')),
        updateClass(w.server, w.gym.id, w.groupClass.id, w.sarah, level),
        scheduleClass(w.server, w.gym.id, w.groupClass.id, w.sarah, {
          localDate: '2026-10-20',
          localStart: '18:00',
          ...level,
        }),
        updateDate(w.server, w.gym.id, w.date.id, w.sarah, { version: 1, ...level }),
        updateSeries(w.server, w.gym.id, w.groupClass.id, series?.id ?? '', w.sarah, {
          version: 1,
          ...level,
        }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ code: 'forbidden' });
      }
      expect((await storedDate(w.date.id))?.level).toBe('advanced');
      expect((await storedDate(weekly.id))?.level).toBe('advanced');
      expect(
        ((await (await readClass(w.server, w.gym.id, w.groupClass.id, w.john)).json()) as ClassBody)
          .level,
      ).toBe('advanced');
    });
  });

  describe('AC10: no email on a level change', () => {
    it('AC10: no email on a level change: a date with bookings keeps them and nobody is mailed', async () => {
      const mail = {
        sendPrivateSession: vi.fn(),
        sendClassCancelled: vi.fn(),
        sendTrainerChange: vi.fn(),
        sendTrainerInvitation: vi.fn(),
        sendDemoRequest: vi.fn(),
      };
      const w = await aWorld(mail);
      const { groupClass } = (await (
        await createClass(w.server, w.gym.id, w.john, reformer(w.sarahRole.id, 'advanced'))
      ).json()) as CreatedClassBody;
      const date = (await (
        await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
          localDate: '2026-10-06',
          localStart: '18:00',
        })
      ).json()) as SessionBody;
      const anna = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Anna de Vries' });
      const mark = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Mark Jansen' });
      await addParticipants(admin.db, {
        workspaceId: w.gym.id,
        session: date,
        clients: [anna, mark],
      });

      const response = await updateDate(w.server, w.gym.id, date.id, w.john, {
        version: 1,
        level: 'beginner',
      });
      const classChange = await updateClass(w.server, w.gym.id, groupClass.id, w.john, {
        level: 'all_levels',
      });

      expect(response.status).toBe(200);
      expect(classChange.status).toBe(200);
      for (const sender of Object.values(mail)) expect(sender).not.toHaveBeenCalled();
      const read = (await (await readSession(w.server, w.gym.id, date.id, w.john)).json()) as Omit<
        SessionBody,
        'participants'
      > & {
        participants: { name: string; attendanceStatus: string }[];
      };
      expect(read.status).toBe('scheduled');
      expect(read.participants.map((p) => [p.name, p.attendanceStatus])).toEqual([
        ['Anna de Vries', 'booked'],
        ['Mark Jansen', 'booked'],
      ]);
    });
  });

  describe('AC11: other workspace 404, anonymous 401', () => {
    it('AC11: other workspace 404, anonymous 401: Mike gets 404 on John’s Gym’s class and date routes, anonymous calls 401', async () => {
      const w = await aClassWithADate();
      const classes = `/v1/workspaces/${w.gym.id}/group-classes`;
      const sessionPath = `/v1/workspaces/${w.gym.id}/sessions/${w.date.id}`;
      const calls = (who?: { id: string }) => [
        call(w.server, 'GET', classes, who),
        call(w.server, 'POST', classes, who, reformer(w.sarahRole.id, 'beginner')),
        call(w.server, 'GET', `${classes}/${w.groupClass.id}`, who),
        call(w.server, 'PATCH', `${classes}/${w.groupClass.id}`, who, { level: 'beginner' }),
        call(w.server, 'POST', `${classes}/${w.groupClass.id}/dates`, who, {
          localDate: '2026-10-13',
          localStart: '18:00',
          level: 'beginner',
        }),
        call(w.server, 'GET', sessionPath, who),
        call(w.server, 'PATCH', sessionPath, who, { version: 1, level: 'beginner' }),
        call(
          w.server,
          'PATCH',
          `${classes}/${w.groupClass.id}/series/00000000-0000-4000-8000-000000000000`,
          who,
          { version: 1, level: 'beginner' },
        ),
      ];

      for (const response of await Promise.all(calls(w.mike))) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: 'not_found' });
      }
      for (const response of await Promise.all(calls(undefined))) {
        expect(response.status).toBe(401);
      }
      expect((await storedDate(w.date.id))?.level).toBe('advanced');
    });
  });

  describe('AC12: the contract', () => {
    it('AC12: the routes take and return the level in the OpenAPI contract', () => {
      const schemas = contract.components.schemas;
      expect(schemas.ClassLevel.enum).toEqual([...LEVELS]);
      const request = (name: string) => schemas[name].properties.level;
      for (const name of [
        'CreateGroupClassRequest',
        'UpdateGroupClassRequest',
        'ScheduleGroupClassDateRequest',
        'UpdateGroupClassDateRequest',
        'UpdateClassSeriesRequest',
      ]) {
        // Optional and nullable: null is *Geen*.
        expect(request(name).enum).toEqual([...LEVELS, null]);
        expect(schemas[name].required ?? []).not.toContain('level');
      }
      for (const name of [
        'GroupClass',
        'Session',
        'PersonalSession',
        'ClassSeries',
        'WorkspaceCalendarSession',
      ]) {
        expect(JSON.stringify(schemas[name].properties.level)).toContain(
          '#/components/schemas/ClassLevel',
        );
        expect(schemas[name].required ?? []).not.toContain('level');
      }
      expect(schemas.SessionSeries.properties.changedFields.items.enum).toContain('level');
    });

    it('AC12: the five routes document the 422 and no route filters by level', () => {
      const paths = contract.paths;
      const classes = '/v1/workspaces/{workspaceId}/group-classes';
      const operations = [
        paths[classes].post,
        paths[`${classes}/{classId}`].patch,
        paths[`${classes}/{classId}/dates`].post,
        paths[`${classes}/{classId}/series/{seriesId}`].patch,
        paths['/v1/workspaces/{workspaceId}/sessions/{sessionId}'].patch,
      ];
      for (const operation of operations) expect(operation.responses['422']).toBeDefined();
      // The timetable and the calendar have no level filter (AC9 of the spec: information only).
      const calendar = JSON.stringify(paths['/v1/workspaces/{workspaceId}/calendar']);
      expect(calendar).not.toContain('"name":"level"');
    });
  });

  describe('series (#759)', () => {
    const TWELVE = 12;

    /** Reformer Power at `advanced`, weekly from Tuesday 6 October 2026 at 18:00. */
    async function aWeeklyClass(level: string | null = 'advanced', overrides = {}) {
      const w = await aWorld(overrides);
      const { groupClass } = (await (
        await createClass(w.server, w.gym.id, w.john, reformer(w.sarahRole.id, level))
      ).json()) as CreatedClassBody;
      const scheduled = await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        localDate: '2026-10-06',
        localStart: '18:00',
        repeat: 'weekly',
      });
      const first = (await scheduled.json()) as SessionBody & { datesAdded: number };
      const datesOf = () =>
        admin.db
          .select()
          .from(sessions)
          .where(eq(sessions.organizationId, w.gym.id))
          .orderBy(asc(sessions.startsAt));
      const seriesOf = () =>
        admin.db
          .select()
          .from(classSeries)
          .where(eq(classSeries.organizationId, w.gym.id))
          .orderBy(asc(classSeries.startsOn));
      return { ...w, groupClass, first, datesOf, seriesOf };
    }

    it('AC1: series: John schedules Reformer Power with Gevorderd weekly; the series and all 12 dates carry it', async () => {
      const w = await aWeeklyClass();

      expect(w.first).toMatchObject({ level: 'advanced', datesAdded: TWELVE });
      const [series] = await w.seriesOf();
      expect(series?.level).toBe('advanced');
      const dates = await w.datesOf();
      expect(dates).toHaveLength(TWELVE);
      expect(dates.every((date) => date.level === 'advanced')).toBe(true);
      const listed = (await (
        await listSeries(w.server, w.gym.id, w.groupClass.id, w.john)
      ).json()) as SeriesBody[];
      expect(listed.map((each) => each.level)).toEqual(['advanced']);
    });

    it('AC1: series: the quick create with a weekly first date gives the series and its dates the level', async () => {
      const w = await aWorld();

      const response = await createClass(w.server, w.gym.id, w.john, {
        ...reformer(w.sarahRole.id, 'advanced'),
        firstDate: { localDate: '2026-10-06', localStart: '18:00', repeat: 'weekly' },
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as CreatedClassBody;
      expect(body.datesAdded).toBe(TWELVE);
      const dates = await admin.db
        .select()
        .from(sessions)
        .where(eq(sessions.organizationId, w.gym.id));
      expect(dates.map((date) => date.level)).toEqual(Array(TWELVE).fill('advanced'));
      const [series] = await admin.db
        .select()
        .from(classSeries)
        .where(eq(classSeries.organizationId, w.gym.id));
      expect(series?.level).toBe('advanced');
    });

    it('AC1: series: a weekly date with a level of its own gives the series and its dates that level, the class keeps its own', async () => {
      const w = await aWorld();
      const { groupClass } = (await (
        await createClass(w.server, w.gym.id, w.john, reformer(w.sarahRole.id, 'advanced'))
      ).json()) as CreatedClassBody;

      const response = await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        localDate: '2026-10-06',
        localStart: '18:00',
        repeat: 'weekly',
        level: 'beginner',
      });

      expect(((await response.json()) as SessionBody).level).toBe('beginner');
      const [series] = await admin.db
        .select()
        .from(classSeries)
        .where(eq(classSeries.organizationId, w.gym.id));
      expect(series?.level).toBe('beginner');
      expect(
        ((await (await readClass(w.server, w.gym.id, groupClass.id, w.john)).json()) as ClassBody)
          .level,
      ).toBe('advanced');
    });

    it('AC2: this and following, skipping changed dates: Deze en volgende changes the series and the following dates, not the earlier ones, and counts the date that kept its own', async () => {
      const w = await aWeeklyClass();
      const dates = await w.datesOf();
      const byDay = (day: string) => {
        const date = dates.find((each) => each.occurrenceDate === day);
        if (!date) throw new Error(`no date on ${day}`);
        return date;
      };
      // 3 November was changed on its own earlier.
      await updateDate(w.server, w.gym.id, byDay('2026-11-03').id, w.john, {
        version: 1,
        level: 'all_levels',
      });

      const response = await updateDate(w.server, w.gym.id, byDay('2026-10-20').id, w.john, {
        version: 1,
        level: 'beginner',
        scope: 'following',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ level: 'beginner', keptDates: 1 });
      const after = Object.fromEntries(
        (await w.datesOf()).map((date) => [date.occurrenceDate, date]),
      );
      // Earlier dates stay as they were.
      for (const day of ['2026-10-06', '2026-10-13']) expect(after[day]?.level).toBe('advanced');
      // Following dates change, the one changed on its own stays.
      for (const day of ['2026-10-20', '2026-10-27', '2026-11-10', '2026-12-22']) {
        expect(after[day]?.level).toBe('beginner');
      }
      expect(after['2026-11-03']?.level).toBe('all_levels');
      expect(after['2026-11-03']?.detachedFields).toEqual(['level']);
      // The series is split at the chosen date: the earlier one keeps advanced, the later one has the new level.
      expect((await w.seriesOf()).map((series) => [series.startsOn, series.level])).toEqual([
        ['2026-10-06', 'advanced'],
        ['2026-10-20', 'beginner'],
      ]);
    });

    it('AC2: the whole series changes from its first date that has not started, and the answer counts the dates that kept their own', async () => {
      const w = await aWeeklyClass();
      const dates = await w.datesOf();
      const tenth = dates.find((date) => date.occurrenceDate === '2026-11-10');
      await updateDate(w.server, w.gym.id, tenth?.id ?? '', w.john, { version: 1, level: null });
      const [series] = await w.seriesOf();

      const response = await updateSeries(
        w.server,
        w.gym.id,
        w.groupClass.id,
        series?.id ?? '',
        w.john,
        { version: 1, level: 'intermediate' },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ level: 'intermediate', keptDates: 1 });
      const after = await w.datesOf();
      expect(after.filter((date) => date.level === 'intermediate')).toHaveLength(TWELVE - 1);
      // The date set to Geen on its own stays Geen.
      expect(after.find((date) => date.occurrenceDate === '2026-11-10')?.level).toBeNull();
    });

    it('AC2: null on the series clears the level (Geen) of the series and of the dates that follow it', async () => {
      const w = await aWeeklyClass();
      const [series] = await w.seriesOf();

      const response = await updateSeries(
        w.server,
        w.gym.id,
        w.groupClass.id,
        series?.id ?? '',
        w.john,
        { version: 1, level: null },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).not.toHaveProperty('level');
      expect((await w.datesOf()).every((date) => date.level === null)).toBe(true);
    });

    it('AC3: one date stays: a date changed on its own keeps its level when the series is edited on another field', async () => {
      const w = await aWeeklyClass();
      const dates = await w.datesOf();
      const twentieth = dates.find((date) => date.occurrenceDate === '2026-10-20');
      await updateDate(w.server, w.gym.id, twentieth?.id ?? '', w.john, {
        version: 1,
        level: 'beginner',
      });
      const [series] = await w.seriesOf();

      const response = await updateSeries(
        w.server,
        w.gym.id,
        w.groupClass.id,
        series?.id ?? '',
        w.john,
        { version: 1, capacity: 12 },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ keptDates: 1, level: 'advanced' });
      const after = Object.fromEntries(
        (await w.datesOf()).map((date) => [date.occurrenceDate, date]),
      );
      expect(after['2026-10-20']).toMatchObject({ level: 'beginner', capacity: 8 });
      expect(after['2026-10-27']).toMatchObject({ level: 'advanced', capacity: 12 });
    });

    it('AC3: the count before saving includes a date with a level of its own', async () => {
      const w = await aWeeklyClass();
      const dates = await w.datesOf();
      const date = (day: string) => dates.find((each) => each.occurrenceDate === day)?.id ?? '';
      await updateDate(w.server, w.gym.id, date('2026-11-03'), w.john, {
        version: 1,
        level: 'beginner',
      });

      const response = await call(
        w.server,
        'GET',
        `/v1/workspaces/${w.gym.id}/sessions/${date('2026-10-13')}/kept-dates`,
        w.john,
      );

      expect(await response.json()).toMatchObject({ keptDates: 1 });
    });

    it('AC4: a value outside the list answers 422 on the series routes, and a series keeps its level', async () => {
      const w = await aWeeklyClass();
      const [series] = await w.seriesOf();

      const edit = await updateSeries(
        w.server,
        w.gym.id,
        w.groupClass.id,
        series?.id ?? '',
        w.john,
        { version: 1, level: 'expert' },
      );
      const schedule = await scheduleClass(w.server, w.gym.id, w.groupClass.id, w.john, {
        localDate: '2026-10-07',
        localStart: '18:00',
        repeat: 'weekly',
        level: 'expert',
      });

      expect(edit.status).toBe(422);
      expect(schedule.status).toBe(422);
      expect((await w.seriesOf())[0]?.level).toBe('advanced');
      expect(await w.datesOf()).toHaveLength(TWELVE);
    });

    it('AC8, AC11: Sarah gets 403 on changing a series’ level, Mike 404, anonymous 401', async () => {
      const w = await aWeeklyClass();
      const [series] = await w.seriesOf();
      const path = `/v1/workspaces/${w.gym.id}/group-classes/${w.groupClass.id}/series/${series?.id}`;
      const body = { version: 1, level: 'beginner' };

      const sarah = await call(w.server, 'PATCH', path, w.sarah, body);
      const mike = await call(w.server, 'PATCH', path, w.mike, body);
      const anonymous = await call(w.server, 'PATCH', path, undefined, body);
      const sarahReads = await call(
        w.server,
        'GET',
        `/v1/workspaces/${w.gym.id}/group-classes/${w.groupClass.id}/series`,
        w.sarah,
      );
      const mikeReads = await call(
        w.server,
        'GET',
        `/v1/workspaces/${w.gym.id}/group-classes/${w.groupClass.id}/series`,
        w.mike,
      );

      expect(sarah.status).toBe(403);
      expect(mike.status).toBe(404);
      expect(anonymous.status).toBe(401);
      // Reading the series stays the Owner's (F022): Sarah reads the level on the date itself.
      expect(sarahReads.status).toBe(403);
      expect(mikeReads.status).toBe(404);
      expect((await w.seriesOf())[0]?.level).toBe('advanced');
    });

    it('AC12: the series carries the level in the OpenAPI contract', () => {
      expect(JSON.stringify(contract.components.schemas.ClassSeries.properties.level)).toContain(
        '#/components/schemas/ClassLevel',
      );
      expect(contract.components.schemas.UpdatedClassSeries.allOf?.[0]?.$ref).toBe(
        '#/components/schemas/ClassSeries',
      );
    });
  });
});
