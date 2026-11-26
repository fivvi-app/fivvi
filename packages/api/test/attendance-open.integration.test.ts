import { readFileSync } from 'node:fs';
import { createDatabase, type DatabaseClient, trainerProfiles } from '@fivvi/database';
import { addClient, addParticipants, addSession } from '@fivvi/database/testing';
import { zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  groupClassWorld,
  myDay,
  mySessions,
  setupGroupClassApi,
} from './group-classes-world.ts';

// F025 (spec #460), ticket #545: attendance in the read models, through the API. Synthetic people as
// in the spec: John (Owner of John's Gym, also trains), Sarah (Trainer), the clients Anna de Vries,
// Bram Jansen, Chris Bakker and others. Europe/Amsterdam, summer time. Tuesday 22 September 2026:
// Sarah's private session with Anna 09:00-10:00 and "Kracht" with Sarah 18:00-19:00 with 7
// participants (the test helper adds them).

const amsterdam = (local: string) => zonedTime(local);
const TUESDAY = '2026-09-22';
const WEDNESDAY = '2026-09-23';

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface Summary {
  attended: number;
  noShow: number;
  open: number;
  cancelled: number;
}

interface Item {
  sessionId?: string;
  id?: string;
  type: string;
  attendanceOpen?: boolean;
  attendance?: Summary;
}

describe('F025 attendance in My day, the calendar and the dashboard', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 8 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  async function world() {
    const people = await groupClassWorld(admin);
    const workspaceId = people.gym.id;
    const named = async (name: string) => addClient(admin.db, { workspaceId, name });
    const anna = await named('Anna de Vries');
    const roster = [
      anna,
      await named('Bram Jansen'),
      await named('Chris Bakker'),
      await named('Daan Visser'),
      await named('Eva Mulder'),
      await named('Fleur Bos'),
      await named('Mark Jansen'),
    ];
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, people.sarahRole.id));
    if (!profile) throw new Error('No trainer profile.');
    const privateSession = await addSession(admin.db, {
      workspaceId,
      clientId: anna.id,
      trainerProfileId: profile.id,
      startsAt: amsterdam(`${TUESDAY}T09:00`),
    });
    const kracht = await addSession(admin.db, {
      workspaceId,
      type: 'group',
      participant: false,
      trainerProfileId: profile.id,
      startsAt: amsterdam(`${TUESDAY}T18:00`),
      capacity: 8,
    });
    await addParticipants(admin.db, { workspaceId, session: kracht, clients: roster });
    const api = setupGroupClassApi(admin, app);
    const at = (date: string, local: string) => api.clock.set(amsterdam(`${date}T${local}`));
    return { ...people, workspaceId, anna, roster, privateSession, kracht, ...api, at };
  }
  type World = Awaited<ReturnType<typeof world>>;

  const mark = (
    w: World,
    sessionId: string,
    clientId: string,
    who: { id: string },
    status: 'attended' | 'no_show' | 'booked',
  ) =>
    call(
      w.server,
      'PUT',
      `/v1/workspaces/${w.workspaceId}/sessions/${sessionId}/participants/${clientId}/attendance`,
      who,
      { status, clientRequestId: crypto.randomUUID() },
    );
  const day = async (w: World, who: { id: string }, date?: string) => {
    const response = await call(
      w.server,
      'GET',
      `/v1/workspaces/${w.workspaceId}/day${date ? `?date=${date}` : ''}`,
      who,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as { items: Item[]; needsAttendance?: Item[] };
  };
  const calendar = async (w: World, who: { id: string }) => {
    const response = await call(
      w.server,
      'GET',
      `/v1/workspaces/${w.workspaceId}/calendar?from=${TUESDAY}&to=${TUESDAY}`,
      who,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as { items: Item[] };
  };
  const mine = async (w: World, date: string) => {
    const response = await myDay(w.server, date, w.sarah);
    expect(response.status).toBe(200);
    return (await response.json()) as { items: Item[] };
  };
  const byId = (items: Item[], id: string) =>
    items.find((item) => (item.sessionId ?? item.id) === id);

  it('AC2: Anna’s session is attendanceOpen in Sarah’s My day at 10:05, not at 09:50', async () => {
    const w = await world();
    w.at(TUESDAY, '09:50');
    expect(byId((await mine(w, TUESDAY)).items, w.privateSession.id)?.attendanceOpen).not.toBe(
      true,
    );

    w.at(TUESDAY, '10:05');
    expect(byId((await mine(w, TUESDAY)).items, w.privateSession.id)?.attendanceOpen).toBe(true);

    // Sarah taps *Niet verschenen*: the nudge is gone.
    expect((await mark(w, w.privateSession.id, w.anna.id, w.sarah, 'no_show')).status).toBe(200);
    expect(byId((await mine(w, TUESDAY)).items, w.privateSession.id)?.attendanceOpen).not.toBe(
      true,
    );
    // Back to booked: the nudge is back.
    await mark(w, w.privateSession.id, w.anna.id, w.sarah, 'booked');
    expect(byId((await mine(w, TUESDAY)).items, w.privateSession.id)?.attendanceOpen).toBe(true);
  });

  it('AC2: the week and month read (me/sessions) says the same, and a class carries its summary', async () => {
    const w = await world();
    w.at(TUESDAY, '19:10');
    await mark(w, w.kracht.id, w.roster[0]?.id ?? '', w.sarah, 'attended');
    await mark(w, w.kracht.id, w.roster[1]?.id ?? '', w.sarah, 'attended');
    await mark(w, w.kracht.id, w.roster[2]?.id ?? '', w.sarah, 'no_show');
    const response = await mySessions(w.server, TUESDAY, TUESDAY, w.sarah);
    expect(response.status).toBe(200);
    const { items } = (await response.json()) as { items: Item[] };
    const anna = byId(items, w.privateSession.id);
    const kracht = byId(items, w.kracht.id);
    expect(anna?.attendanceOpen).toBe(true);
    // A private session carries its one participant's status as a summary too; a class has one, and
    // is open while a participant is booked.
    expect(anna?.attendance).toEqual({ attended: 0, noShow: 0, open: 1, cancelled: 0 });
    expect(kracht?.attendanceOpen).toBe(true);
    expect(kracht?.attendance).toEqual({ attended: 2, noShow: 1, open: 4, cancelled: 0 });
  });

  it('AC2: a class that has not ended is not attendanceOpen in My day, but already carries its summary', async () => {
    const w = await world();
    w.at(TUESDAY, '18:30');
    const during = byId((await mine(w, TUESDAY)).items, w.kracht.id);
    expect(during?.attendanceOpen).not.toBe(true);
    expect(during?.attendance).toEqual({ attended: 0, noShow: 0, open: 7, cancelled: 0 });
  });

  it('AC11: yesterday’s sessions without attendance: at 23 September 08:00 the day route lists the two sessions of 22 September; once both are filled in the row is gone', async () => {
    const w = await world();
    w.at(WEDNESDAY, '08:00');
    const before = await day(w, w.john);
    expect(before.needsAttendance?.map((item) => item.id)).toEqual([
      w.privateSession.id,
      w.kracht.id,
    ]);
    // Each item says what it is as data, so the app words the row and links to the session.
    expect(before.needsAttendance?.map((item) => item.type)).toEqual(['private', 'group']);

    // John fills in Anna's session: one is left.
    expect((await mark(w, w.privateSession.id, w.anna.id, w.john, 'attended')).status).toBe(200);
    expect((await day(w, w.john)).needsAttendance?.map((item) => item.id)).toEqual([w.kracht.id]);

    // And the class, one participant at a time: still open until the last one is filled in.
    for (const client of w.roster.slice(0, 6)) {
      await mark(w, w.kracht.id, client.id, w.john, 'attended');
    }
    expect((await day(w, w.john)).needsAttendance?.map((item) => item.id)).toEqual([w.kracht.id]);
    await mark(w, w.kracht.id, w.roster[6]?.id ?? '', w.john, 'no_show');
    expect((await day(w, w.john)).needsAttendance ?? []).toEqual([]);
  });

  it('AC11: yesterday’s sessions without attendance are about yesterday on the clock, whatever day is shown', async () => {
    const w = await world();
    w.at(WEDNESDAY, '08:00');
    // Looking at another day does not move *yesterday*.
    expect((await day(w, w.john, TUESDAY)).needsAttendance).toHaveLength(2);
    // On the 22nd itself nothing has happened yet the day before.
    w.at(TUESDAY, '19:30');
    expect((await day(w, w.john)).needsAttendance ?? []).toEqual([]);
    // Two days later it is no longer yesterday.
    w.at('2026-09-24', '08:00');
    expect((await day(w, w.john)).needsAttendance ?? []).toEqual([]);
  });

  it('AC11: yesterday’s sessions without attendance are those that ended yesterday, also when they began the day before', async () => {
    const w = await world();
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, w.sarahRole.id));
    if (!profile) throw new Error('No trainer profile.');
    // Monday 21 September 23:30 to 00:30 on the 22nd: began the day before yesterday, ended yesterday.
    const overnight = await addSession(admin.db, {
      workspaceId: w.workspaceId,
      clientId: w.anna.id,
      trainerProfileId: profile.id,
      startsAt: amsterdam('2026-09-21T23:30'),
    });
    // Tuesday 22 September 23:30 to 00:30: began yesterday, ended today.
    const crossing = await addSession(admin.db, {
      workspaceId: w.workspaceId,
      clientId: w.anna.id,
      trainerProfileId: profile.id,
      startsAt: amsterdam(`${TUESDAY}T23:30`),
    });
    w.at(WEDNESDAY, '08:00');
    const ids = (await day(w, w.john)).needsAttendance?.map((item) => item.id);
    expect(ids).toEqual([overnight.id, w.privateSession.id, w.kracht.id]);
    expect(ids).not.toContain(crossing.id);
  });

  it('AC11: yesterday’s sessions without attendance show as attendanceOpen on the calendar and the day items, and a class has its summary', async () => {
    const w = await world();
    w.at(WEDNESDAY, '08:00');
    const week = await calendar(w, w.john);
    expect(byId(week.items, w.privateSession.id)?.attendanceOpen).toBe(true);
    expect(byId(week.items, w.kracht.id)?.attendanceOpen).toBe(true);
    expect(byId(week.items, w.kracht.id)?.attendance).toEqual({
      attended: 0,
      noShow: 0,
      open: 7,
      cancelled: 0,
    });
    await mark(w, w.privateSession.id, w.anna.id, w.john, 'attended');
    const after = await calendar(w, w.john);
    expect(byId(after.items, w.privateSession.id)?.attendanceOpen).not.toBe(true);

    // The day route's own items say the same for the day shown.
    const shown = await day(w, w.john, TUESDAY);
    expect(byId(shown.items, w.kracht.id)?.attendanceOpen).toBe(true);
    expect(byId(shown.items, w.privateSession.id)?.attendanceOpen).not.toBe(true);
  });

  it('AC3: a private session carries a summary of its one participant in the week, the day and My day, so the calendar needs no request per session', async () => {
    const w = await world();
    w.at(WEDNESDAY, '08:00');
    const open = { attended: 0, noShow: 0, open: 1, cancelled: 0 };
    expect(byId((await calendar(w, w.john)).items, w.privateSession.id)?.attendance).toEqual(open);
    expect(byId((await day(w, w.john, TUESDAY)).items, w.privateSession.id)?.attendance).toEqual(
      open,
    );

    // John taps *Aanwezig*: every read says it, and the session no longer waits for attendance.
    expect((await mark(w, w.privateSession.id, w.anna.id, w.john, 'attended')).status).toBe(200);
    const done = { attended: 1, noShow: 0, open: 0, cancelled: 0 };
    const shown = byId((await calendar(w, w.john)).items, w.privateSession.id);
    expect(shown?.attendance).toEqual(done);
    expect(shown?.attendanceOpen).not.toBe(true);
    expect(byId((await day(w, w.john, TUESDAY)).items, w.privateSession.id)?.attendance).toEqual(
      done,
    );
    expect(byId((await mine(w, TUESDAY)).items, w.privateSession.id)?.attendance).toEqual(done);

    // *Niet verschenen* counts as no_show.
    await mark(w, w.privateSession.id, w.anna.id, w.john, 'no_show');
    expect(byId((await calendar(w, w.john)).items, w.privateSession.id)?.attendance).toEqual({
      attended: 0,
      noShow: 1,
      open: 0,
      cancelled: 0,
    });
  });

  it('AC15: the contract names the new fields additively on the personal and workspace items and the day', () => {
    const schemas = contract.components.schemas;
    for (const name of ['PersonalSession', 'WorkspaceCalendarSession']) {
      const properties = schemas[name].properties;
      expect(properties.attendanceOpen.type).toBe('boolean');
      expect(properties.attendance.$ref).toBe('#/components/schemas/AttendanceSummary');
      expect(schemas[name].required).not.toContain('attendanceOpen');
      expect(schemas[name].required).not.toContain('attendance');
    }
    const dayProperties = schemas.WorkspaceDay.properties;
    expect(dayProperties.needsAttendance.type).toBe('array');
    expect(schemas.WorkspaceDay.required).not.toContain('needsAttendance');
  });
});
