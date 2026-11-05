import { createDatabase, type DatabaseClient, groupClasses, sessions } from '@fivvi/database';
import { addSession } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CreatedClassBody,
  createClass,
  groupClassWorld,
  kracht,
  readClass,
  readSession,
  type SessionBody,
  scheduleClass,
  setupGroupClassApi,
  updateDate,
} from './group-classes-world.ts';

// F021 (spec #427), first ticket (#448): reading and editing one date of a class through F020's
// session routes (CO-04). Synthetic people as in `group-classes.integration.test.ts`.

describe('F021 edit one date of a class', () => {
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

  /** Kracht with Sarah, 8, 60 minutes, planned on Tuesday 6 October 2026 at 18:00 (16:00 to 17:00 UTC). */
  async function aDate() {
    const world = await groupClassWorld(admin);
    const { server } = setupGroupClassApi(admin, app);
    const { groupClass } = (await (
      await createClass(server, world.gym.id, world.john, kracht(world.sarahRole.id))
    ).json()) as CreatedClassBody;
    const date = (await (
      await scheduleClass(server, world.gym.id, groupClass.id, world.john, {
        localDate: '2026-10-06',
        localStart: '18:00',
      })
    ).json()) as SessionBody;
    return { ...world, server, groupClass, date };
  }

  const stored = async (sessionId: string) => {
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, sessionId));
    return row;
  };

  it('AC4: John changes the start to 18:30 and the capacity to 10: only this date changes, the class stays at 8', async () => {
    const { gym, john, server, groupClass, date } = await aDate();
    const other = (await (
      await scheduleClass(server, gym.id, groupClass.id, john, {
        localDate: '2026-10-13',
        localStart: '18:00',
      })
    ).json()) as SessionBody;

    const response = await updateDate(server, gym.id, date.id, john, {
      version: 1,
      localStart: '18:30',
      capacity: 10,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...date,
      startsAt: '2026-10-06T16:30:00.000Z',
      endsAt: '2026-10-06T17:00:00.000Z',
      capacity: 10,
      version: 2,
    });
    // The class and the other date did not change.
    expect(await (await readClass(server, gym.id, groupClass.id, john)).json()).toEqual(groupClass);
    expect(await (await readSession(server, gym.id, other.id, john)).json()).toEqual(other);
    expect((await stored(other.id))?.version).toBe(1);
  });

  it('AC4: a new end, and a new date, move only what they name', async () => {
    const { gym, john, server, date } = await aDate();

    const longer = await updateDate(server, gym.id, date.id, john, {
      version: 1,
      localEnd: '19:30',
    });
    expect(await longer.json()).toMatchObject({
      startsAt: '2026-10-06T16:00:00.000Z',
      endsAt: '2026-10-06T17:30:00.000Z',
      capacity: 8,
      version: 2,
    });

    const moved = await updateDate(server, gym.id, date.id, john, {
      version: 2,
      localDate: '2026-10-07',
    });
    expect(await moved.json()).toMatchObject({
      startsAt: '2026-10-07T16:00:00.000Z',
      endsAt: '2026-10-07T17:30:00.000Z',
      version: 3,
    });
  });

  it('AC4: an end before the start is refused, with the field, and nothing changes', async () => {
    const { gym, john, server, date } = await aDate();

    for (const body of [
      { version: 1, localEnd: '17:30' },
      { version: 1, localEnd: '18:00' },
      { version: 1, localStart: '19:30' },
    ]) {
      const response = await updateDate(server, gym.id, date.id, john, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'localEnd', code: 'end_before_start' }],
      });
    }
    expect(await stored(date.id)).toMatchObject({
      startsAt: new Date('2026-10-06T16:00:00.000Z'),
      endsAt: new Date('2026-10-06T17:00:00.000Z'),
      version: 1,
    });
  });

  it('refuses a date, start, end or capacity that is none, naming the field', async () => {
    const { gym, john, server, date } = await aDate();

    for (const [change, path, code] of [
      [{ localDate: '2026-02-30' }, 'localDate', 'invalid_date'],
      [{ localStart: '25:00' }, 'localStart', 'invalid_time'],
      [{ localStart: '9am' }, 'localStart', 'invalid_format'],
      [{ localEnd: '24:00' }, 'localEnd', 'invalid_time'],
      [{ capacity: 0 }, 'capacity', 'too_small'],
      [{ capacity: 101 }, 'capacity', 'too_big'],
    ] as const) {
      const response = await updateDate(server, gym.id, date.id, john, { version: 1, ...change });
      expect(response.status).toBe(400);
      const body = (await response.json()) as { issues: { path: string; code: string }[] };
      expect(body.issues[0]?.path).toBe(path);
      expect(body.issues[0]?.code).toBe(code);
    }
    // Neither a missing version nor a change that changes nothing is a save.
    expect((await updateDate(server, gym.id, date.id, john, { capacity: 5 })).status).toBe(400);
    expect((await updateDate(server, gym.id, date.id, john, { version: 1 })).status).toBe(400);
    expect((await stored(date.id))?.version).toBe(1);
  });

  it('AC9: the daylight saving rules apply to an edit: a start or end the clocks skip is refused, a repeated time takes the first', async () => {
    const world = await groupClassWorld(admin);
    const { server } = setupGroupClassApi(admin, app);
    const { gym, john } = world;
    const { groupClass } = (await (
      await createClass(server, gym.id, john, kracht())
    ).json()) as CreatedClassBody;
    const spring = (await (
      await scheduleClass(server, gym.id, groupClass.id, john, {
        localDate: '2027-03-28',
        localStart: '10:00',
      })
    ).json()) as SessionBody;
    const autumn = (await (
      await scheduleClass(server, gym.id, groupClass.id, john, {
        localDate: '2026-10-25',
        localStart: '10:00',
      })
    ).json()) as SessionBody;

    const skippedStart = await updateDate(server, gym.id, spring.id, john, {
      version: 1,
      localStart: '02:30',
    });
    expect(skippedStart.status).toBe(400);
    expect(await skippedStart.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'localStart', code: 'time_does_not_exist' }],
    });
    const skippedEnd = await updateDate(server, gym.id, spring.id, john, {
      version: 1,
      localEnd: '02:30',
    });
    expect(await skippedEnd.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'localEnd', code: 'time_does_not_exist' }],
    });

    const repeated = await updateDate(server, gym.id, autumn.id, john, {
      version: 1,
      localStart: '02:30',
      localEnd: '04:00',
    });
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ startsAt: '2026-10-25T00:30:00.000Z' });
  });

  it('a save from an old version answers 409 with the date as it is now, and changes nothing', async () => {
    const { gym, john, server, date } = await aDate();
    await updateDate(server, gym.id, date.id, john, { version: 1, capacity: 9 });

    const response = await updateDate(server, gym.id, date.id, john, { version: 1, capacity: 12 });

    expect(response.status).toBe(409);
    const conflict = (await response.json()) as { code: string; session: SessionBody };
    expect(conflict).toEqual({
      code: 'class_date_changed',
      session: { ...date, capacity: 9, version: 2 },
    });
    expect((await stored(date.id))?.capacity).toBe(9);
  });

  it('answers 404 for a session that is no group date: a private session, or one that does not exist', async () => {
    const { gym, john, server } = await aDate();
    const privateSession = await addSession(admin.db, { workspaceId: gym.id });

    for (const sessionId of [privateSession.id, crypto.randomUUID()]) {
      const response = await updateDate(server, gym.id, sessionId, john, {
        version: 1,
        capacity: 5,
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
    }
    expect((await stored(privateSession.id))?.version).toBe(1);
  });

  it('AC8: another workspace’s date answers 404 and is not changed', async () => {
    const { server, date } = await aDate();
    const elsewhere = await groupClassWorld(admin);

    const response = await updateDate(server, elsewhere.gym.id, date.id, elsewhere.john, {
      version: 1,
      capacity: 5,
    });
    const read = await readSession(server, elsewhere.gym.id, date.id, elsewhere.john);

    expect(response.status).toBe(404);
    expect(read.status).toBe(404);
    expect((await stored(date.id))?.capacity).toBe(8);
  });

  it('AC5: a date with no trainer is read with no trainer; the class’s usual trainer is not filled in later', async () => {
    const { gym, john, server } = await aDate();
    const { groupClass } = (await (
      await createClass(server, gym.id, john, { ...kracht(), nameNl: 'Bootcamp' })
    ).json()) as CreatedClassBody;
    const date = (await (
      await scheduleClass(server, gym.id, groupClass.id, john, {
        localDate: '2026-10-06',
        localStart: '18:00',
      })
    ).json()) as SessionBody;

    await admin.db
      .update(groupClasses)
      .set({ defaultTrainerProfileId: null })
      .where(eq(groupClasses.id, groupClass.id));
    const read = (await (await readSession(server, gym.id, date.id, john)).json()) as SessionBody;

    expect(read).not.toHaveProperty('trainer');
  });
});
