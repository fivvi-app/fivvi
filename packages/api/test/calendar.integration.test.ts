import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  teamMembers,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClassSeries,
  addClient,
  addGroupClass,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { fixedClock, zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F014 (spec #458), first ticket (#528): the workspace calendar and day through the API. Synthetic
// people: John owns John's Gym and trains there; Sarah and Tom are Trainers of John's Gym; Sarah
// also owns Sarah Personal Training, where Anna de Vries is a client; Lisa Smit is a client of John's
// Gym with an account; Mike owns Fit Studio. The week of 21-27 September 2026 as the spec has it,
// Europe/Amsterdam (summer time).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const NOW = '2026-09-22T08:00'; // Tuesday, Amsterdam

interface Item {
  id: string;
  type: 'private' | 'group' | 'open_gym';
  status: 'scheduled' | 'cancelled';
  startsAt: string;
  endsAt: string;
  timeZone: string;
  capacity: number;
  version: number;
  booked?: number;
  className?: string;
  clientName?: string;
  clients?: { clientId: string; name: string }[];
  location: { id: string; name: string };
  trainer?: { id: string; name: string };
  series?: {
    weekday: string;
    localStartTime: string;
    occurrenceDate: string;
    changedFields: string[];
  };
}

interface CalendarBody {
  from: string;
  to: string;
  timeZone: string;
  items: Item[];
}

interface DayBody {
  date: string;
  timeZone: string;
  items: Item[];
  attention: Item[];
}

describe('F014 the workspace calendar and day through the API', () => {
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

  function api(
    options: { now?: string; productEvents?: ReturnType<typeof createProductEvents> } = {},
  ) {
    return createApp({
      ...NO_DEPENDENCIES,
      // The sign-in session is a boundary of its own (F001's tests cover it): a header names who calls.
      findSignedInAccount: async (headers) => {
        const id = headers.get('x-test-account');
        if (!id) return undefined;
        const [row] = await admin.db
          .select({
            id: authUsers.id,
            email: authUsers.email,
            name: authUsers.name,
            preferredLocale: authUsers.preferredLocale,
          })
          .from(authUsers)
          .where(eq(authUsers.id, id));
        return row satisfies SignedInAccount | undefined;
      },
      tenantScopes: createTenantScopes(() => app.db),
      clock: fixedClock(zonedTime(options.now ?? NOW)),
      ...(options.productEvents ? { productEvents: options.productEvents } : {}),
    });
  }

  const get = (
    server: ReturnType<typeof api>,
    path: string,
    who?: { id: string },
    headers: Record<string, string> = {},
  ) =>
    server.request(path, { headers: { ...(who ? { 'x-test-account': who.id } : {}), ...headers } });

  const calendar = (
    workspaceId: string,
    query: string,
    who: { id: string } | undefined,
    headers: Record<string, string> = {},
    server = api(),
  ) => get(server, `/v1/workspaces/${workspaceId}/calendar?${query}`, who, headers);

  const day = (
    workspaceId: string,
    query: string,
    who: { id: string } | undefined,
    headers: Record<string, string> = {},
    server = api(),
  ) => get(server, `/v1/workspaces/${workspaceId}/day${query ? `?${query}` : ''}`, who, headers);

  const WEEK = 'from=2026-09-21&to=2026-09-27';

  /** The trainer profile of an account in a workspace: what a session's trainer is. */
  async function profileOf(workspaceId: string, accountId: string): Promise<string> {
    const [row] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .innerJoin(teamMembers, eq(teamMembers.id, trainerProfiles.teamMemberId))
      .where(
        and(eq(trainerProfiles.organizationId, workspaceId), eq(teamMembers.accountId, accountId)),
      );
    if (!row) throw new Error('The account does not train in the workspace.');
    return row.id;
  }

  /** The week of 21-27 September 2026 of John's Gym as the spec has it, and what must never show. */
  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const studio = await createWorkspace(admin.db, { label: 'fit-studio' });
    const named = async (label: string, name: string) => {
      const account = await createAccount(admin.db, { label });
      await admin.db.update(authUsers).set({ name }).where(eq(authUsers.id, account.id));
      return account;
    };
    const john = await named('john', 'John');
    const sarah = await named('sarah', 'Sarah');
    const tom = await named('tom', 'Tom');
    const mike = await named('mike', 'Mike');
    const lisaAccount = await named('lisa', 'Lisa Account');
    await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
      trainsHere: true,
    });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: tom.id });
    await addTeamRole(admin.db, {
      workspaceId: own.id,
      accountId: sarah.id,
      role: 'owner',
      trainsHere: true,
    });
    await addTeamRole(admin.db, {
      workspaceId: studio.id,
      accountId: mike.id,
      role: 'owner',
      trainsHere: true,
    });
    const sarahGym = await profileOf(gym.id, sarah.id);
    const sarahOwn = await profileOf(own.id, sarah.id);
    const tomGym = await profileOf(gym.id, tom.id);
    const mark = await addClient(admin.db, { workspaceId: gym.id, name: 'Mark Jansen' });
    const lisa = await addClient(admin.db, {
      workspaceId: gym.id,
      accountId: lisaAccount.id,
      name: 'Lisa Smit',
    });
    const anna = await addClient(admin.db, { workspaceId: own.id, name: 'Anna de Vries' });

    const at = (local: string) => zonedTime(`2026-09-${local}`);
    const krachtClass = await addGroupClass(admin.db, {
      workspaceId: gym.id,
      nameNl: 'Kracht',
      nameEn: 'Strength',
    });
    const boxingClass = await addGroupClass(admin.db, { workspaceId: gym.id, nameNl: 'Boxing' });
    // Kracht: every Tuesday 10:00 with Sarah, 8 places; the 22nd and the 29th are its dates.
    const series = await addClassSeries(admin.db, {
      workspaceId: gym.id,
      groupClassId: krachtClass.id,
      localStartTime: '10:00',
      trainerProfileId: sarahGym,
      startsOn: '2026-09-22',
      materializedUntil: '2026-10-06',
    });
    const kracht = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'group',
      groupClassId: krachtClass.id,
      capacity: 8,
      participant: false,
      trainerProfileId: sarahGym,
      startsAt: at('22T10:00'),
      series: { id: series.id, occurrenceDate: '2026-09-22' },
    });
    const krachtNext = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'group',
      groupClassId: krachtClass.id,
      capacity: 8,
      participant: false,
      trainerProfileId: sarahGym,
      startsAt: at('29T10:00'),
      series: { id: series.id, occurrenceDate: '2026-09-29' },
    });
    const boxing = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'group',
      groupClassId: boxingClass.id,
      capacity: 12,
      participant: false,
      trainerProfileId: null,
      startsAt: at('24T19:15'),
    });
    const markSession = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: mark.id,
      trainerProfileId: sarahGym,
      startsAt: at('22T07:00'),
    });
    const lisaSession = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: lisa.id,
      trainerProfileId: tomGym,
      startsAt: at('22T11:00'),
    });
    const cancelled = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'group',
      groupClassId: krachtClass.id,
      capacity: 8,
      participant: false,
      status: 'cancelled',
      trainerProfileId: sarahGym,
      startsAt: at('22T18:00'),
    });
    // Sarah's own business: never in John's Gym's calendar, not even as a busy marker.
    const annaSession = await addSession(admin.db, {
      workspaceId: own.id,
      clientId: anna.id,
      trainerProfileId: sarahOwn,
      startsAt: at('22T09:00'),
    });
    return {
      gym,
      own,
      studio,
      john,
      sarah,
      tom,
      mike,
      lisaAccount,
      mark,
      lisa,
      anna,
      tomGym,
      sarahGym,
      kracht,
      krachtNext,
      boxing,
      markSession,
      lisaSession,
      cancelled,
      annaSession,
    };
  }

  const ids = (body: { items: Item[] }) => body.items.map((item) => item.id);

  describe('the calendar route', () => {
    it("AC2: only this workspace's sessions, nothing of the trainer's other workspace", async () => {
      const w = await world();

      const response = await calendar(w.gym.id, WEEK, w.john);

      expect(response.status).toBe(200);
      const body = (await response.json()) as CalendarBody;
      expect(body).toMatchObject({
        from: '2026-09-21',
        to: '2026-09-27',
        timeZone: 'Europe/Amsterdam',
      });
      // In time order: Mark 07:00, Kracht 10:00, Lisa 11:00, the cancelled Kracht 18:00, Boxing on Thursday.
      expect(ids(body)).toEqual([
        w.markSession.id,
        w.kracht.id,
        w.lisaSession.id,
        w.cancelled.id,
        w.boxing.id,
      ]);
      const sent = JSON.stringify(body);
      for (const other of [w.annaSession.id, 'Anna de Vries', w.own.marker, w.own.id]) {
        expect(sent).not.toContain(other);
      }
      // Sarah, a Trainer of both workspaces, sees the same: her other workspace is not in it.
      const asSarah = (await (await calendar(w.gym.id, WEEK, w.sarah)).json()) as CalendarBody;
      expect(ids(asSarah)).toEqual(ids(body));
      // And her own workspace's calendar holds Anna's session alone.
      const own = (await (await calendar(w.own.id, WEEK, w.sarah)).json()) as CalendarBody;
      expect(ids(own)).toEqual([w.annaSession.id]);
    });

    it('shows each block with its type, status, UTC instants and the workspace zone, trainer and location', async () => {
      const w = await world();

      const body = (await (
        await calendar(w.gym.id, WEEK, w.john, { 'accept-language': 'nl-NL' })
      ).json()) as CalendarBody;

      const byId = (id: string) => body.items.find((item) => item.id === id);
      expect(byId(w.markSession.id)).toMatchObject({
        type: 'private',
        status: 'scheduled',
        startsAt: '2026-09-22T05:00:00.000Z',
        endsAt: '2026-09-22T06:00:00.000Z',
        timeZone: 'Europe/Amsterdam',
        capacity: 1,
        version: 1,
        clientName: 'Mark Jansen',
        clients: [{ clientId: w.mark.id, name: 'Mark Jansen' }],
        trainer: { name: 'Sarah' },
        location: { name: w.gym.marker },
      });
      expect(byId(w.kracht.id)).toMatchObject({
        type: 'group',
        capacity: 8,
        booked: 0,
        className: 'Kracht',
        trainer: { name: 'Sarah' },
      });
      expect(byId(w.kracht.id)).not.toHaveProperty('clientName');
      expect(byId(w.boxing.id)).toMatchObject({ className: 'Boxing', capacity: 12 });
      expect(byId(w.boxing.id)).not.toHaveProperty('trainer');
      expect(byId(w.cancelled.id)).toMatchObject({ status: 'cancelled' });
    });

    it('shows the series line and what was changed on one date (F022), the class in the viewer’s language', async () => {
      const w = await world();

      const body = (await (
        await calendar(w.gym.id, WEEK, w.john, { 'accept-language': 'en' })
      ).json()) as CalendarBody;

      const kracht = body.items.find((item) => item.id === w.kracht.id);
      expect(kracht?.className).toBe('Strength');
      expect(kracht?.series).toMatchObject({
        weekday: 'TU',
        localStartTime: '10:00',
        occurrenceDate: '2026-09-22',
        changedFields: [],
      });
      expect(body.items.find((item) => item.id === w.markSession.id)).not.toHaveProperty('series');
    });

    it('names both clients of a duo, joined, with the clients apart', async () => {
      const w = await world();
      const eva = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Eva Kok' });
      const duo = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.mark.id,
        secondClientId: eva.id,
        trainerProfileId: w.sarahGym,
        startsAt: zonedTime('2026-09-23T09:00'),
      });

      const body = (await (await calendar(w.gym.id, WEEK, w.john)).json()) as CalendarBody;

      const item = body.items.find((candidate) => candidate.id === duo.id);
      expect(item).toMatchObject({ clientName: 'Mark Jansen & Eva Kok', capacity: 2 });
      expect(item?.clients?.map((client) => client.name)).toEqual(['Mark Jansen', 'Eva Kok']);
    });

    it('AC3: trainer and type filters', async () => {
      const w = await world();
      const filtered = async (suffix: string) =>
        ids((await (await calendar(w.gym.id, `${WEEK}${suffix}`, w.john)).json()) as CalendarBody);

      const sarah = await teamMemberOf(w.gym.id, w.sarah.id);
      const tom = await teamMemberOf(w.gym.id, w.tom.id);
      // Tom only: Lisa remains.
      expect(await filtered(`&trainerIds=${tom}`)).toEqual([w.lisaSession.id]);
      // Classes only: the class dates remain, the cancelled one included.
      expect(await filtered('&types=group')).toEqual([w.kracht.id, w.cancelled.id, w.boxing.id]);
      // Private sessions only.
      expect(await filtered('&types=private')).toEqual([w.markSession.id, w.lisaSession.id]);
      // Cancelled off hides the cancelled date; on (and by default) shows it.
      expect(await filtered('&types=group&includeCancelled=false')).toEqual([
        w.kracht.id,
        w.boxing.id,
      ]);
      expect(await filtered('&types=group&includeCancelled=true')).toEqual([
        w.kracht.id,
        w.cancelled.id,
        w.boxing.id,
      ]);
      // Two trainers and a type together.
      expect(await filtered(`&trainerIds=${sarah}&trainerIds=${tom}&types=private`)).toEqual([
        w.markSession.id,
        w.lisaSession.id,
      ]);
      // A trainer who has nothing: an empty list, not an error.
      expect(await filtered(`&trainerIds=${crypto.randomUUID()}`)).toEqual([]);
    });

    it('answers 400 on a filter that is none', async () => {
      const w = await world();
      for (const suffix of [
        '&types=yoga',
        '&types=open_gym',
        '&trainerIds=sarah',
        '&includeCancelled=maybe',
      ]) {
        const response = await calendar(w.gym.id, `${WEEK}${suffix}`, w.john);
        expect(response.status).toBe(400);
      }
    });

    it('reads the range by days on the workspace wall clock: at most 42, the 25-hour day whole', async () => {
      const w = await world();
      const early = await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.sarahGym,
        startsAt: zonedTime('2026-10-25T00:30'),
      });
      const late = await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.sarahGym,
        startsAt: zonedTime('2026-10-25T23:30'),
      });
      const outside = await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.sarahGym,
        startsAt: zonedTime('2026-10-26T00:30'),
      });

      const sunday = (await (
        await calendar(w.gym.id, 'from=2026-10-25&to=2026-10-25', w.john)
      ).json()) as CalendarBody;

      expect(ids(sunday)).toEqual([early.id, late.id]);
      expect(ids(sunday)).not.toContain(outside.id);
      const sixWeeks = await calendar(w.gym.id, 'from=2026-09-21&to=2026-11-01', w.john);
      expect(sixWeeks.status).toBe(200);
      const tooLong = await calendar(w.gym.id, 'from=2026-09-21&to=2026-11-02', w.john);
      expect(tooLong.status).toBe(400);
      expect(await tooLong.json()).toMatchObject({
        issues: [{ path: 'to', code: 'range_too_long' }],
      });
      const backwards = await calendar(w.gym.id, 'from=2026-09-27&to=2026-09-21', w.john);
      expect(await backwards.json()).toMatchObject({
        issues: [{ path: 'to', code: 'before_from' }],
      });
      const notADate = await calendar(w.gym.id, 'from=2026-02-30&to=2026-03-02', w.john);
      expect(await notADate.json()).toMatchObject({
        issues: [{ path: 'from', code: 'invalid_date' }],
      });
    });

    it('AC12: a Trainer reads the whole week with calendar.read and not calendar.manage', async () => {
      const w = await world();

      const response = await calendar(w.gym.id, WEEK, w.sarah);

      expect(response.status).toBe(200);
      // The whole workspace, Tom's session included.
      expect(ids((await response.json()) as CalendarBody)).toContain(w.lisaSession.id);
      type Places = { workspaceId: string; capabilities: string[] }[];
      const capabilitiesOf = async (who: { id: string }) =>
        ((await (await get(api(), '/v1/me/workspaces', who)).json()) as Places).find(
          (place) => place.workspaceId === w.gym.id,
        )?.capabilities;
      const trainer = await capabilitiesOf(w.sarah);
      expect(trainer).toContain('calendar.read');
      expect(trainer).not.toContain('calendar.manage');
      expect(await capabilitiesOf(w.john)).toEqual(
        expect.arrayContaining(['calendar.read', 'calendar.manage']),
      );
      // The day of the dashboard is the Owner's.
      expect((await day(w.gym.id, 'date=2026-09-22', w.sarah)).status).toBe(403);
    });

    it('AC14: another workspace’s Owner gets 404, a client account is refused, anonymous 401', async () => {
      const w = await world();

      for (const path of [
        (who: { id: string } | undefined) => calendar(w.gym.id, WEEK, who),
        (who: { id: string } | undefined) => day(w.gym.id, 'date=2026-09-22', who),
      ]) {
        expect((await path(w.mike)).status).toBe(404);
        expect((await path(w.lisaAccount)).status).toBe(403);
        expect((await path(undefined)).status).toBe(401);
      }
      // A workspace that does not exist, and an ID that is none, answer like one that is not yours.
      expect((await calendar(crypto.randomUUID(), WEEK, w.john)).status).toBe(404);
      expect((await calendar('not-an-id', WEEK, w.john)).status).toBe(404);
    });

    it('AC15: a pilot-shaped week (about 15 classes and 30 private sessions) in one request within budget', async () => {
      const w = await world();
      const pilot = await createWorkspace(admin.db, { label: 'pilot-gym' });
      const owner = await createAccount(admin.db, { label: 'pilot-owner' });
      await addTeamRole(admin.db, { workspaceId: pilot.id, accountId: owner.id, role: 'owner' });
      const trainers = [];
      for (const label of ['pilot-a', 'pilot-b', 'pilot-c']) {
        const account = await createAccount(admin.db, { label });
        await addTeamRole(admin.db, { workspaceId: pilot.id, accountId: account.id });
        trainers.push(await profileOf(pilot.id, account.id));
      }
      const klass = await addGroupClass(admin.db, { workspaceId: pilot.id });
      const clientIds = [];
      for (let index = 0; index < 10; index += 1) {
        clientIds.push((await addClient(admin.db, { workspaceId: pilot.id })).id);
      }
      for (let index = 0; index < 15; index += 1) {
        await addSession(admin.db, {
          workspaceId: pilot.id,
          type: 'group',
          groupClassId: klass.id,
          capacity: 12,
          participant: false,
          trainerProfileId: trainers[index % 3] ?? null,
          startsAt: zonedTime(
            `2026-09-${21 + (index % 7)}T${String(7 + (index % 5) * 2).padStart(2, '0')}:00`,
          ),
        });
      }
      for (let index = 0; index < 30; index += 1) {
        await addSession(admin.db, {
          workspaceId: pilot.id,
          clientId: clientIds[index % 10] ?? '',
          trainerProfileId: trainers[index % 3] ?? null,
          startsAt: zonedTime(
            `2026-09-${21 + (index % 6)}T${String(8 + (index % 10)).padStart(2, '0')}:30`,
          ),
        });
      }
      const server = api();

      const started = performance.now();
      const response = await calendar(pilot.id, WEEK, owner, {}, server);
      const elapsed = performance.now() - started;

      expect(response.status).toBe(200);
      expect(((await response.json()) as CalendarBody).items).toHaveLength(45);
      expect(elapsed).toBeLessThan(500);
      // John's Gym's own week is not touched by it.
      expect(
        ids((await (await calendar(w.gym.id, WEEK, w.john)).json()) as CalendarBody),
      ).toHaveLength(5);
    });
  });

  describe('the day route', () => {
    it("AC10: today's rows and class dates without a trainer", async () => {
      const w = await world();

      const response = await day(w.gym.id, 'date=2026-09-22', w.john, {
        'accept-language': 'nl-NL',
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as DayBody;
      expect(body).toMatchObject({ date: '2026-09-22', timeZone: 'Europe/Amsterdam' });
      // 07:00 Mark (Sarah), 10:00 Kracht 0/8 (Sarah), 11:00 Lisa (Tom), the cancelled 18:00: no Anna.
      expect(ids(body)).toEqual([w.markSession.id, w.kracht.id, w.lisaSession.id, w.cancelled.id]);
      expect(body.items[0]).toMatchObject({
        clientName: 'Mark Jansen',
        trainer: { name: 'Sarah' },
      });
      expect(body.items[1]).toMatchObject({ className: 'Kracht', booked: 0, capacity: 8 });
      // Aandacht nodig: "Boxing, do 24 sep 19:15: nog geen trainer".
      expect(body.attention).toHaveLength(1);
      expect(body.attention[0]).toMatchObject({
        id: w.boxing.id,
        type: 'group',
        className: 'Boxing',
        startsAt: '2026-09-24T17:15:00.000Z',
        timeZone: 'Europe/Amsterdam',
      });
      expect(JSON.stringify(body)).not.toContain('Anna de Vries');
    });

    it('takes the date from the workspace clock when none is given, and 400 for a date that is none', async () => {
      const w = await world();

      const today = (await (await day(w.gym.id, '', w.john)).json()) as DayBody;
      const thursday = (await (await day(w.gym.id, 'date=2026-09-24', w.john)).json()) as DayBody;
      const empty = (await (await day(w.gym.id, 'date=2026-09-26', w.john)).json()) as DayBody;

      expect(today.date).toBe('2026-09-22');
      expect(ids(today)).toHaveLength(4);
      expect(ids(thursday)).toEqual([w.boxing.id]);
      expect(empty.items).toEqual([]);
      expect(empty.attention).toHaveLength(1);
      expect((await day(w.gym.id, 'date=2026-02-30', w.john)).status).toBe(400);
    });

    it('lists no class date that has a trainer, has begun, is cancelled or is past the 14 days', async () => {
      const w = await world();
      const far = await addSession(admin.db, {
        workspaceId: w.gym.id,
        type: 'group',
        participant: false,
        trainerProfileId: null,
        startsAt: zonedTime('2026-10-06T10:00'),
      });
      const begun = await addSession(admin.db, {
        workspaceId: w.gym.id,
        type: 'group',
        participant: false,
        trainerProfileId: null,
        startsAt: zonedTime('2026-09-22T07:30'),
      });
      const cancelledNoTrainer = await addSession(admin.db, {
        workspaceId: w.gym.id,
        type: 'group',
        participant: false,
        status: 'cancelled',
        trainerProfileId: null,
        startsAt: zonedTime('2026-09-25T10:00'),
      });

      const body = (await (await day(w.gym.id, 'date=2026-09-22', w.john)).json()) as DayBody;

      expect(body.attention.map((item) => item.id)).toEqual([w.boxing.id]);
      for (const left of [far.id, begun.id, cancelledNoTrainer.id]) {
        expect(body.attention.map((item) => item.id)).not.toContain(left);
      }
    });

    it('names the class in the viewer’s language', async () => {
      const w = await world();
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        type: 'group',
        groupClassId: (
          await addGroupClass(admin.db, {
            workspaceId: w.gym.id,
            nameNl: 'Hardlopen',
            nameEn: 'Running',
          })
        ).id,
        participant: false,
        trainerProfileId: null,
        startsAt: zonedTime('2026-09-23T18:00'),
      });

      const english = (await (
        await day(w.gym.id, 'date=2026-09-23', w.john, { 'accept-language': 'en' })
      ).json()) as DayBody;
      const dutch = (await (
        await day(w.gym.id, 'date=2026-09-23', w.john, { 'accept-language': 'nl-NL' })
      ).json()) as DayBody;

      expect(english.attention.map((item) => item.className)).toContain('Running');
      expect(dutch.attention.map((item) => item.className)).toContain('Hardlopen');
    });
  });

  describe('the contract', () => {
    it('AC16: both routes are in the committed contract with x-access for the team (read) and the Owner (manage)', () => {
      const base = '/v1/workspaces/{workspaceId}';
      const access = (capability: string, roles: string[]) => ({
        type: 'workspace',
        capability,
        roles,
        client: 'none',
      });
      expect(contract.paths[`${base}/calendar`].get).toMatchObject({
        operationId: 'getWorkspaceCalendar',
        'x-access': access('calendar.read', ['owner', 'trainer']),
      });
      expect(contract.paths[`${base}/day`].get).toMatchObject({
        operationId: 'getWorkspaceDay',
        'x-access': access('calendar.manage', ['owner']),
      });
    });
  });

  describe('the product events', () => {
    function capture() {
      const lines: string[] = [];
      const log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      };
      const spies = (['error', 'log', 'warn', 'info'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(log),
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
          for (const spy of spies) spy.mockRestore();
        },
      };
    }

    it('AC17: events carry no personal data: the workspace ID and the platform only', async () => {
      const { posthog, lines, productEvents, restore } = capture();
      const w = await world();
      const server = api({ productEvents });
      const app = { authorization: 'Bearer token' };

      const responses = [
        await calendar(w.gym.id, WEEK, w.john, {}, server),
        await calendar(w.gym.id, `${WEEK}&surface=ios`, w.sarah, app, server),
        await calendar(w.gym.id, `${WEEK}&surface=android`, w.john, app, server),
        // A bearer token that names no surface, a refusal and a validation error record nothing.
        await calendar(w.gym.id, WEEK, w.john, app, server),
        await calendar(w.gym.id, WEEK, w.mike, {}, server),
        await calendar(w.gym.id, 'from=2026-02-30&to=2026-03-02', w.john, {}, server),
        await calendar(w.gym.id, WEEK, undefined, {}, server),
      ];

      expect(responses.map((response) => response.status)).toEqual([
        200, 200, 200, 200, 404, 400, 401,
      ]);
      expect(posthog.events.map(({ event }) => event)).toEqual([
        'workspace_calendar_viewed',
        'workspace_calendar_viewed',
        'workspace_calendar_viewed',
      ]);
      expect(posthog.events.map(({ properties }) => properties)).toEqual([
        expect.objectContaining({ workspace_id: w.gym.id, platform: 'web' }),
        expect.objectContaining({ workspace_id: w.gym.id, platform: 'ios' }),
        expect.objectContaining({ workspace_id: w.gym.id, platform: 'android' }),
      ]);
      for (const event of posthog.events) {
        const keys = Object.keys(event.properties ?? {}).filter((key) => !key.startsWith('$'));
        expect(keys.toSorted()).toEqual(['platform', 'workspace_id']);
      }
      const sent = JSON.stringify([
        posthog.events.map(({ timestamp: _sentAt, ...event }) => event),
        lines,
      ]);
      for (const personal of [
        'Mark Jansen',
        'Lisa Smit',
        'Kracht',
        'Boxing',
        w.sarah.email,
        w.markSession.id,
      ]) {
        expect(sent).not.toContain(personal);
      }
      restore();
    });

    it('AC17: session_moved_by_drag is in the catalog with the workspace ID and the platform only', async () => {
      const { posthog, productEvents, restore } = capture();
      const workspaceId = crypto.randomUUID();
      const distinctId = crypto.randomUUID();

      productEvents.track({
        event: 'session_moved_by_drag',
        distinctId,
        properties: { workspace_id: workspaceId, platform: 'web' },
      });
      await productEvents.flush();

      expect(posthog.events.map(({ event }) => event)).toEqual(['session_moved_by_drag']);
      const keys = Object.keys(posthog.events[0]?.properties ?? {}).filter(
        (key) => !key.startsWith('$'),
      );
      expect(keys.toSorted()).toEqual(['platform', 'workspace_id']);
      // A property outside the catalog is refused outside production.
      const untyped = productEvents as unknown as { track: (event: object) => void };
      expect(() =>
        untyped.track({
          event: 'session_moved_by_drag',
          distinctId,
          properties: {
            workspace_id: workspaceId,
            platform: 'web',
            session_id: crypto.randomUUID(),
          },
        }),
      ).toThrow();
      restore();
    });
  });

  /** The team-member ID of an account in a workspace: what the API calls a trainer. */
  async function teamMemberOf(workspaceId: string, accountId: string): Promise<string> {
    const [row] = await admin.db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.organizationId, workspaceId), eq(teamMembers.accountId, accountId)),
      );
    if (!row) throw new Error('The account has no team role in the workspace.');
    return row.id;
  }
});
