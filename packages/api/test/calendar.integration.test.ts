import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  deleteTeamMember,
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
  hasSessions: boolean;
  busiest?: { startsAt: string; endsAt: string; timeZone: string; atOnce: number };
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
      krachtClass,
      boxingClass,
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

    it('F023 AC9: after Sarah is removed from the team her past session still carries her ID and name, like before', async () => {
      const w = await world();
      const [member] = await admin.db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(
          and(eq(teamMembers.organizationId, w.gym.id), eq(teamMembers.accountId, w.sarah.id)),
        );
      if (!member) throw new Error('Sarah is not in the team.');
      const before = (await (await calendar(w.gym.id, WEEK, w.john)).json()) as CalendarBody;

      // The repository's removal, as the route does it after the hand-over (F023): her profile stays as a former trainer.
      const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
        { accountId: w.john.id, workspaceId: w.gym.id, admit: () => 'team' },
        (scope) => deleteTeamMember(scope, member.id),
      );
      expect(entry).toMatchObject({ status: 'entered', value: true });

      const after = (await (await calendar(w.gym.id, WEEK, w.john)).json()) as CalendarBody;
      expect(ids(after)).toEqual(ids(before));
      const mark = after.items.find((item) => item.id === w.markSession.id);
      expect(mark?.trainer).toEqual({ id: member.id, name: 'Sarah' });
      // Every session of hers still names her; the one of Tom and the class without a trainer are as before.
      expect(after.items.find((item) => item.id === w.kracht.id)?.trainer).toEqual({
        id: member.id,
        name: 'Sarah',
      });
      expect(after.items.find((item) => item.id === w.lisaSession.id)?.trainer?.name).toBe('Tom');
      expect(after.items.find((item) => item.id === w.boxing.id)).not.toHaveProperty('trainer');
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

    it('F037 AC2 (date part): the groupClassId filter lists the dates of one class of this workspace only', async () => {
      const w = await world();
      const filtered = async (suffix: string, who = w.john) =>
        ids((await (await calendar(w.gym.id, `${WEEK}${suffix}`, who)).json()) as CalendarBody);
      const otherClass = await addGroupClass(admin.db, {
        workspaceId: w.own.id,
        nameNl: 'Kracht',
      });

      // Kracht's dates, the cancelled one too until it is left out; no date of Boxing, no private session.
      expect(await filtered(`&groupClassId=${w.krachtClass.id}`)).toEqual([
        w.kracht.id,
        w.cancelled.id,
      ]);
      expect(await filtered(`&groupClassId=${w.krachtClass.id}&includeCancelled=false`)).toEqual([
        w.kracht.id,
      ]);
      expect(await filtered(`&groupClassId=${w.boxingClass.id}`)).toEqual([w.boxing.id]);
      // A Trainer reads it too; another workspace's class, or none, gives an empty list.
      expect(await filtered(`&groupClassId=${w.krachtClass.id}`, w.sarah)).toEqual([
        w.kracht.id,
        w.cancelled.id,
      ]);
      expect(await filtered(`&groupClassId=${otherClass.id}`)).toEqual([]);
      expect(await filtered(`&groupClassId=${crypto.randomUUID()}`)).toEqual([]);
    });

    it('answers 400 on a filter that is none', async () => {
      const w = await world();
      for (const suffix of [
        '&groupClassId=kracht',
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
      // A first request warms the app up (modules, pool, plans), so the timing below is the route's.
      expect((await calendar(pilot.id, WEEK, owner, {}, server)).status).toBe(200);

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

    it('#1537: lists private sessions without a trainer too, with their type and client names as data', async () => {
      const w = await world();
      // A trainer who was removed clears the field (ON DELETE SET NULL): the sessions stay.
      const removed = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.mark.id,
        trainerProfileId: null,
        startsAt: zonedTime('2026-09-23T09:00'),
      });
      const duo = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.mark.id,
        secondClientId: w.lisa.id,
        trainerProfileId: null,
        startsAt: zonedTime('2026-09-25T08:00'),
      });

      const body = (await (await day(w.gym.id, 'date=2026-09-22', w.john)).json()) as DayBody;

      // In time order, a class date and the private sessions alike.
      expect(body.attention.map((item) => item.id)).toEqual([removed.id, w.boxing.id, duo.id]);
      expect(body.attention[0]).toMatchObject({
        type: 'private',
        clientName: 'Mark Jansen',
        clients: [{ clientId: w.mark.id, name: 'Mark Jansen' }],
      });
      expect(body.attention[0]?.className).toBeUndefined();
      expect(body.attention[0]?.trainer).toBeUndefined();
      expect(body.attention[1]).toMatchObject({ type: 'group', className: 'Boxing' });
      expect(body.attention[1]?.clientName).toBeUndefined();
      expect(body.attention[2]).toMatchObject({
        type: 'private',
        capacity: 2,
        clientName: 'Mark Jansen & Lisa Smit',
        clients: [
          { clientId: w.mark.id, name: 'Mark Jansen' },
          { clientId: w.lisa.id, name: 'Lisa Smit' },
        ],
      });
    });

    it('#1537: lists no private session that has a trainer, has begun, is cancelled, is past the 14 days or is in another workspace', async () => {
      const w = await world();
      const wanted = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.mark.id,
        trainerProfileId: null,
        startsAt: zonedTime('2026-09-23T09:00'),
      });
      const left = [
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.mark.id,
          status: 'cancelled',
          trainerProfileId: null,
          startsAt: zonedTime('2026-09-23T10:00'),
        }),
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.mark.id,
          trainerProfileId: null,
          startsAt: zonedTime('2026-09-22T07:30'),
        }),
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.mark.id,
          trainerProfileId: null,
          startsAt: zonedTime('2026-10-06T10:00'),
        }),
        // Another workspace's private session without a trainer: never in this one's list.
        await addSession(admin.db, {
          workspaceId: w.own.id,
          clientId: w.anna.id,
          trainerProfileId: null,
          startsAt: zonedTime('2026-09-23T11:00'),
        }),
      ];

      const body = (await (await day(w.gym.id, 'date=2026-09-22', w.john)).json()) as DayBody;

      expect(body.attention.map((item) => item.id)).toEqual([wanted.id, w.boxing.id]);
      for (const session of left) {
        expect(body.attention.map((item) => item.id)).not.toContain(session.id);
      }
      expect(JSON.stringify(body)).not.toContain('Anna de Vries');
    });

    describe('the busiest moment (#1538)', () => {
      /** A private session of Mark with Sarah that starts at `local` (Amsterdam wall clock). */
      const sessionAt = (w: Awaited<ReturnType<typeof world>>, local: string, options = {}) =>
        addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.mark.id,
          trainerProfileId: w.sarahGym,
          startsAt: zonedTime(local),
          ...options,
        });

      it('AC1: names the hour two sessions share at 18:00 with 2 at once, in UTC with the zone', async () => {
        const w = await world();
        // The cancelled Kracht of 18:00 is in the world already: it does not count.
        await sessionAt(w, '2026-09-22T18:00');
        await sessionAt(w, '2026-09-22T18:00', { trainerProfileId: w.tomGym, clientId: w.lisa.id });

        const body = (await (await day(w.gym.id, 'date=2026-09-22', w.john)).json()) as DayBody;

        expect(body.busiest).toEqual({
          startsAt: '2026-09-22T16:00:00.000Z',
          endsAt: '2026-09-22T17:00:00.000Z',
          timeZone: 'Europe/Amsterdam',
          atOnce: 2,
        });
      });

      it('AC1: a day without overlap names none: the field is left out', async () => {
        const w = await world();

        const body = (await (await day(w.gym.id, 'date=2026-09-22', w.john)).json()) as DayBody;
        const empty = (await (await day(w.gym.id, 'date=2026-09-26', w.john)).json()) as DayBody;

        expect(body.items).toHaveLength(4);
        expect(body).not.toHaveProperty('busiest');
        expect(empty).not.toHaveProperty('busiest');
      });

      it('does not count a cancelled session, one of another day or one of another workspace', async () => {
        const w = await world();
        // The cancelled Kracht of 18:00 and one session of 18:00 are not an overlap; nor are Sarah's
        // own business at the same time, the day before, or the day after.
        await sessionAt(w, '2026-09-22T18:00');
        await addSession(admin.db, {
          workspaceId: w.own.id,
          clientId: w.anna.id,
          trainerProfileId: await profileOf(w.own.id, w.sarah.id),
          startsAt: zonedTime('2026-09-22T18:00'),
        });
        await sessionAt(w, '2026-09-21T18:00');
        await sessionAt(w, '2026-09-23T18:00');

        const body = (await (await day(w.gym.id, 'date=2026-09-22', w.john)).json()) as DayBody;

        expect(body).not.toHaveProperty('busiest');
      });

      it('counts class dates, with or without a trainer, and names the part that overlaps', async () => {
        const w = await world();
        // Boxing has no trainer: 19:15-20:15 on Thursday; a private session from 19:45 overlaps it.
        await sessionAt(w, '2026-09-24T19:45');

        const body = (await (await day(w.gym.id, 'date=2026-09-24', w.john)).json()) as DayBody;

        expect(body.busiest).toMatchObject({
          startsAt: '2026-09-24T17:45:00.000Z',
          endsAt: '2026-09-24T18:15:00.000Z',
          atOnce: 2,
        });
      });

      it.each([
        ['2026-03-29', 'the day summer time begins (23 hours)', '2026-03-29T16:00:00.000Z'],
        ['2026-10-25', 'the day summer time ends (25 hours)', '2026-10-25T17:00:00.000Z'],
      ])('AC2: on %s, %s, 18:00 is the right UTC instant', async (date, _what, startsAt) => {
        const w = await world();
        await sessionAt(w, `${date}T18:00`);
        await sessionAt(w, `${date}T18:00`, { trainerProfileId: w.tomGym, clientId: w.lisa.id });

        const body = (await (await day(w.gym.id, `date=${date}`, w.john)).json()) as DayBody;

        expect(body.busiest).toEqual({
          startsAt,
          endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
          timeZone: 'Europe/Amsterdam',
          atOnce: 2,
        });
      });

      it('AC2: sessions that overlap across the clock change share the real hour', async () => {
        const w = await world();
        // Winter time becomes summer time at 01:00 UTC on 29 March: 00:30Z is 01:30 on the wall clock.
        const at = (iso: string) => new Date(iso);
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.mark.id,
          trainerProfileId: w.sarahGym,
          startsAt: at('2026-03-29T00:30:00Z'),
          durationMinutes: 90,
        });
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.lisa.id,
          trainerProfileId: w.tomGym,
          startsAt: at('2026-03-29T01:00:00Z'),
          durationMinutes: 120,
        });

        const body = (await (await day(w.gym.id, 'date=2026-03-29', w.john)).json()) as DayBody;

        expect(body.busiest).toMatchObject({
          startsAt: '2026-03-29T01:00:00.000Z',
          endsAt: '2026-03-29T02:00:00.000Z',
          atOnce: 2,
        });
      });
    });

    describe('#1544: hasSessions tells a new workspace from one with nothing today', () => {
      /** A workspace of its own with John as Owner, and nothing planned in it. */
      async function newWorkspace(label: string) {
        const workspace = await createWorkspace(admin.db, { label });
        const owner = await createAccount(admin.db, { label: `${label}-owner` });
        await addTeamRole(admin.db, {
          workspaceId: workspace.id,
          accountId: owner.id,
          role: 'owner',
          trainsHere: true,
        });
        return { workspace, owner, trainer: await profileOf(workspace.id, owner.id) };
      }

      const hasSessions = async (workspaceId: string, who: { id: string }) =>
        ((await (await day(workspaceId, '', who)).json()) as DayBody).hasSessions;

      it('is false for a workspace with no session ever, even when another workspace has some', async () => {
        const w = await world();
        const fresh = await newWorkspace('brand-new');

        const body = (await (await day(fresh.workspace.id, '', fresh.owner)).json()) as DayBody;

        expect(body).toMatchObject({ items: [], attention: [], hasSessions: false });
        // The seeded gym next door has sessions: they are not this workspace's.
        expect(await hasSessions(w.gym.id, w.john)).toBe(true);
      });

      it('is true for any session of the workspace: a past one, a cancelled one, a planned one', async () => {
        const past = await newWorkspace('only-past');
        await addSession(admin.db, {
          workspaceId: past.workspace.id,
          trainerProfileId: past.trainer,
          startsAt: zonedTime('2026-08-04T10:00'),
        });
        const cancelled = await newWorkspace('only-cancelled');
        await addSession(admin.db, {
          workspaceId: cancelled.workspace.id,
          trainerProfileId: cancelled.trainer,
          status: 'cancelled',
          startsAt: zonedTime('2026-10-20T10:00'),
        });
        const planned = await newWorkspace('only-planned');
        await addSession(admin.db, {
          workspaceId: planned.workspace.id,
          trainerProfileId: planned.trainer,
          startsAt: zonedTime('2026-12-01T10:00'),
        });

        // Nothing today in any of them: the day is empty, the workspace is not new.
        for (const { workspace, owner } of [past, cancelled, planned]) {
          const body = (await (await day(workspace.id, '', owner)).json()) as DayBody;
          expect(body.items).toEqual([]);
          expect(body.hasSessions).toBe(true);
        }
      });

      it('is true on a day with rows too', async () => {
        const w = await world();

        const body = (await (await day(w.gym.id, 'date=2026-09-22', w.john)).json()) as DayBody;

        expect(body.items.length).toBeGreaterThan(0);
        expect(body.hasSessions).toBe(true);
      });
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

    it('F037: the calendar names its groupClassId filter as a uuid query parameter', () => {
      const parameters = contract.paths['/v1/workspaces/{workspaceId}/calendar'].get.parameters;
      expect(parameters).toContainEqual(
        expect.objectContaining({
          name: 'groupClassId',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ type: 'string', format: 'uuid' }),
        }),
      );
    });

    it('#1544: hasSessions is a required boolean of the day', () => {
      const schema = contract.components.schemas.WorkspaceDay;
      expect(schema.required).toContain('hasSessions');
      expect(schema.properties.hasSessions.type).toBe('boolean');
    });

    it('#1538: the day names its busiest moment as UTC instants with the zone and a count, none when absent', () => {
      const schema = contract.components.schemas.WorkspaceDay;
      expect(schema.required).not.toContain('busiest');
      expect(schema.properties.busiest.$ref).toBe('#/components/schemas/WorkspaceBusiestMoment');
      const busiest = contract.components.schemas.WorkspaceBusiestMoment;
      expect(Object.keys(busiest.properties).sort()).toEqual([
        'atOnce',
        'endsAt',
        'startsAt',
        'timeZone',
      ]);
      expect([...busiest.required].sort()).toEqual(['atOnce', 'endsAt', 'startsAt', 'timeZone']);
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
