import { readFileSync } from 'node:fs';
import {
  authUsers,
  clients,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  locations,
  type SignedInAccount,
  sessionParticipants,
  type TenantScopes,
  teamMembers,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClient,
  addGroupClass,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
  endTeamRole,
} from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { fixedClock, zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { and, eq } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F013 (spec #457), first ticket (#521): the personal read model through the API. Synthetic people:
// Sarah is a Trainer at John's Gym and the Owner (who trains) of Sarah Personal Training; John owns
// John's Gym and trains there; Tom is a Trainer at John's Gym only; Lisa is a client account of John's
// Gym only; Mike owns Fit Studio; Nina is an Owner who does not train. Tuesday 22 September 2026,
// Europe/Amsterdam (summer time).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const NOW = '2026-09-22T08:35'; // Amsterdam: 25 minutes before Anna

interface Item {
  sessionId: string;
  workspace: { id: string; slug: string; name: string };
  type: 'private' | 'group' | 'open_gym';
  status: 'scheduled' | 'cancelled';
  startsAt: string;
  endsAt: string;
  timeZone: string;
  capacity: number;
  booked?: number;
  className?: string;
  location?: { name: string; address: unknown };
  clientName?: string;
}

interface DayBody {
  date: string;
  timeZone: string;
  workspaceCount: number;
  items: Item[];
  summary: { count: number; done: number; firstStartsAt?: string; lastEndsAt?: string };
  freeGap?: { startsAt: string; endsAt: string };
  placesAhead?: { name: string; address?: unknown }[];
  next?: { sessionId: string; state: string; startsInMinutes: number };
  tomorrow?: { date: string; count: number; firstStartsAt: string };
  nextSessionDate?: string;
  hasSessions: boolean;
}

interface RangeBody {
  from: string;
  to: string;
  timeZone: string;
  workspaceCount: number;
  items: Item[];
}

describe('F013 the personal day and sessions through the API', () => {
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
    options: {
      now?: string;
      tenantScopes?: TenantScopes;
      productEvents?: ReturnType<typeof createProductEvents>;
    } = {},
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
      tenantScopes: options.tenantScopes ?? createTenantScopes(() => app.db),
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

  const day = (date: string, who: { id: string } | undefined, server = api(), suffix = '') =>
    get(server, `/v1/me/day?date=${date}${suffix}`, who);

  const sessionsOf = (
    from: string,
    to: string,
    who: { id: string } | undefined,
    server = api(),
    suffix = '',
  ) => get(server, `/v1/me/sessions?from=${from}&to=${to}${suffix}`, who);

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

  /** Tuesday 22 September 2026 as the spec has it, plus what must never show for Sarah. */
  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const studio = await createWorkspace(admin.db, { label: 'fit-studio' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const john = await createAccount(admin.db, { label: 'john' });
    const tom = await createAccount(admin.db, { label: 'tom' });
    const lisa = await createAccount(admin.db, { label: 'lisa' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    const nina = await createAccount(admin.db, { label: 'nina' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id });
    await addTeamRole(admin.db, {
      workspaceId: own.id,
      accountId: sarah.id,
      role: 'owner',
      trainsHere: true,
    });
    await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
      trainsHere: true,
    });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: tom.id });
    await addClient(admin.db, { workspaceId: gym.id, accountId: lisa.id, name: 'Lisa Client' });
    await addTeamRole(admin.db, {
      workspaceId: studio.id,
      accountId: mike.id,
      role: 'owner',
      trainsHere: true,
    });
    // Nina owns a workspace of her own and does not train in it.
    const ninas = await createWorkspace(admin.db, { label: 'ninas-gym' });
    await addTeamRole(admin.db, { workspaceId: ninas.id, accountId: nina.id, role: 'owner' });
    const sarahGym = await profileOf(gym.id, sarah.id);
    const sarahOwn = await profileOf(own.id, sarah.id);
    const johnGym = await profileOf(gym.id, john.id);
    const tomGym = await profileOf(gym.id, tom.id);
    const mikeStudio = await profileOf(studio.id, mike.id);
    const anna = await addClient(admin.db, { workspaceId: own.id, name: 'Anna de Vries' });
    const mark = await addClient(admin.db, { workspaceId: gym.id, name: 'Mark Jansen' });

    const sessionAt = (local: string) => zonedTime(`2026-09-22T${local}`);
    const annaSession = await addSession(admin.db, {
      workspaceId: own.id,
      clientId: anna.id,
      trainerProfileId: sarahOwn,
      startsAt: sessionAt('09:00'),
    });
    const markSession = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: mark.id,
      trainerProfileId: sarahGym,
      startsAt: sessionAt('11:00'),
    });
    const krachtClass = await addGroupClass(admin.db, {
      workspaceId: gym.id,
      nameNl: 'Kracht',
      nameEn: 'Strength',
    });
    const kracht = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'group',
      groupClassId: krachtClass.id,
      capacity: 8,
      participant: false,
      trainerProfileId: sarahGym,
      startsAt: sessionAt('15:00'),
    });
    const krachtCancelled = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'group',
      groupClassId: krachtClass.id,
      capacity: 8,
      participant: false,
      status: 'cancelled',
      trainerProfileId: sarahGym,
      startsAt: sessionAt('18:00'),
    });
    // Not Sarah's: Tom's and John's sessions in the same gym, Mike's in Fit Studio, and a session
    // Sarah had without a trainer any more.
    const tomSession = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: mark.id,
      trainerProfileId: tomGym,
      startsAt: sessionAt('10:00'),
    });
    const johnSession = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: mark.id,
      trainerProfileId: johnGym,
      startsAt: sessionAt('12:00'),
    });
    const mikeSession = await addSession(admin.db, {
      workspaceId: studio.id,
      trainerProfileId: mikeStudio,
      startsAt: sessionAt('13:00'),
    });
    const nobody = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: mark.id,
      trainerProfileId: null,
      startsAt: sessionAt('14:00'),
    });
    return {
      gym,
      own,
      studio,
      sarah,
      john,
      tom,
      lisa,
      mike,
      nina,
      anna,
      mark,
      annaSession,
      markSession,
      kracht,
      krachtCancelled,
      others: [tomSession, johnSession, mikeSession, nobody].map((session) => session.id),
    };
  }

  describe('GET /v1/me/day', () => {
    it('AC1: Sarah at 08:35 on 22 September: four items in order, Straks Anna in 25 minutes, the cancelled Kracht kept', async () => {
      const w = await world();

      const response = await day('2026-09-22', w.sarah);

      expect(response.status).toBe(200);
      const body = (await response.json()) as DayBody;
      expect(body.items.map((item) => item.sessionId)).toEqual([
        w.annaSession.id,
        w.markSession.id,
        w.kracht.id,
        w.krachtCancelled.id,
      ]);
      expect(body).toMatchObject({
        date: '2026-09-22',
        timeZone: 'Europe/Amsterdam',
        workspaceCount: 2,
        hasSessions: true,
        // 4 sessies · 09:00–19:00, in UTC: 07:00 to 17:00.
        summary: {
          count: 4,
          firstStartsAt: '2026-09-22T07:00:00.000Z',
          lastEndsAt: '2026-09-22T17:00:00.000Z',
        },
        next: { sessionId: w.annaSession.id, state: 'upcoming', startsInMinutes: 25 },
      });
      expect(body).not.toHaveProperty('tomorrow');
      expect(body).not.toHaveProperty('nextSessionDate');
    });

    it('AC1: an item says where it is, who it is for and what kind it is', async () => {
      const w = await world();

      const body = (await (await day('2026-09-22', w.sarah)).json()) as DayBody;

      const [anna, mark, kracht, cancelled] = body.items;
      expect(anna).toEqual({
        sessionId: w.annaSession.id,
        workspace: { id: w.own.id, slug: w.own.marker, name: w.own.marker },
        type: 'private',
        status: 'scheduled',
        startsAt: '2026-09-22T07:00:00.000Z',
        endsAt: '2026-09-22T08:00:00.000Z',
        timeZone: 'Europe/Amsterdam',
        capacity: 1,
        location: expect.objectContaining({ name: w.own.marker, address: null }),
        clientName: 'Anna de Vries',
      });
      expect(mark).toMatchObject({
        workspace: { id: w.gym.id, slug: w.gym.marker, name: w.gym.marker },
        clientName: 'Mark Jansen',
        location: { name: w.gym.marker },
      });
      // A class names no client and no location here, and shows booked/capacity (0/8).
      expect(kracht).toMatchObject({ type: 'group', status: 'scheduled', capacity: 8, booked: 0 });
      expect(kracht).not.toHaveProperty('clientName');
      expect(kracht).not.toHaveProperty('location');
      expect(cancelled).toMatchObject({ type: 'group', status: 'cancelled' });
    });

    it('AC1: a class date carries its name in the viewer’s language: Kracht for Dutch, Strength for English, a Dutch-only class Dutch in both; a private session none', async () => {
      const w = await world();
      const sarahGym = await profileOf(w.gym.id, w.sarah.id);
      const yoga = await addGroupClass(admin.db, { workspaceId: w.gym.id, nameNl: 'Yoga' });
      const yogaSession = await addSession(admin.db, {
        workspaceId: w.gym.id,
        type: 'group',
        groupClassId: yoga.id,
        participant: false,
        trainerProfileId: sarahGym,
        startsAt: zonedTime('2026-09-22T19:00'),
      });
      const namesFor = async (preferredLocale: 'nl-NL' | 'en') => {
        await admin.db
          .update(authUsers)
          .set({ preferredLocale })
          .where(eq(authUsers.id, w.sarah.id));
        const body = (await (
          await get(api(), '/v1/me/day?date=2026-09-22', w.sarah)
        ).json()) as DayBody;
        return Object.fromEntries(body.items.map((item) => [item.sessionId, item.className]));
      };

      const dutch = await namesFor('nl-NL');
      const english = await namesFor('en');

      expect(dutch).toEqual({
        [w.annaSession.id]: undefined,
        [w.markSession.id]: undefined,
        [w.kracht.id]: 'Kracht',
        [w.krachtCancelled.id]: 'Kracht',
        [yogaSession.id]: 'Yoga',
      });
      expect(english).toEqual({
        [w.annaSession.id]: undefined,
        [w.markSession.id]: undefined,
        [w.kracht.id]: 'Strength',
        [w.krachtCancelled.id]: 'Strength',
        [yogaSession.id]: 'Yoga',
      });
    });

    it('AC1: without a stored language the Accept-Language of the request decides, else English (ADR-017)', async () => {
      const w = await world();
      const kracht = async (headers: Record<string, string>) => {
        const body = (await (
          await get(api(), '/v1/me/day?date=2026-09-22', w.sarah, headers)
        ).json()) as DayBody;
        return body.items.find((item) => item.sessionId === w.kracht.id)?.className;
      };

      expect(await kracht({ 'accept-language': 'nl-BE,nl;q=0.9,en;q=0.5' })).toBe('Kracht');
      expect(await kracht({ 'accept-language': 'de-DE,en-GB;q=0.8' })).toBe('Strength');
      expect(await kracht({})).toBe('Strength');
    });

    it('AC1: a stored language beats a conflicting Accept-Language (ADR-017)', async () => {
      const w = await world();
      const kracht = async (preferredLocale: 'nl-NL' | 'en', acceptLanguage: string) => {
        await admin.db
          .update(authUsers)
          .set({ preferredLocale })
          .where(eq(authUsers.id, w.sarah.id));
        const body = (await (
          await get(api(), '/v1/me/day?date=2026-09-22', w.sarah, {
            'accept-language': acceptLanguage,
          })
        ).json()) as DayBody;
        return body.items.find((item) => item.sessionId === w.kracht.id)?.className;
      };

      expect(await kracht('nl-NL', 'en-GB,en;q=0.9')).toBe('Kracht');
      expect(await kracht('en', 'nl-NL,nl;q=0.9')).toBe('Strength');
    });

    it('AC1: a private session has no className, whatever the language', async () => {
      const w = await world();
      await admin.db
        .update(authUsers)
        .set({ preferredLocale: 'en' })
        .where(eq(authUsers.id, w.sarah.id));

      const body = (await (await day('2026-09-22', w.sarah)).json()) as DayBody;

      const [anna, mark] = body.items;
      expect(anna).not.toHaveProperty('className');
      expect(mark).not.toHaveProperty('className');
    });

    it('AC1: after Anna started, "Nu bezig"; after the last session that takes place, no next item', async () => {
      const w = await world();

      const running = (await (
        await day('2026-09-22', w.sarah, api({ now: '2026-09-22T09:30' }))
      ).json()) as DayBody;
      const evening = (await (
        await day('2026-09-22', w.sarah, api({ now: '2026-09-22T17:00' }))
      ).json()) as DayBody;

      expect(running.next).toEqual({
        sessionId: w.annaSession.id,
        state: 'in_progress',
        startsInMinutes: 0,
      });
      // Only the cancelled Kracht is left: nothing to be at, but it stays in the list.
      expect(evening.next).toBeUndefined();
      expect(evening.items).toHaveLength(4);
    });

    it('TD-01: done, free gap and places ahead across workspaces', async () => {
      const w = await world();
      const dayAt = async (now: string) =>
        (await (await day('2026-09-22', w.sarah, api({ now }))).json()) as DayBody;

      // 08:35: nothing done. Anna 09:00–10:00 (Sarah Personal Training), Mark 11:00–12:00 and
      // Kracht 15:00–16:00 (John's Gym): the first gap is 10:00–11:00, in UTC 08:00–09:00. Tom's
      // 10:00, John's 12:00 and Mike's 13:00 sessions are nobody's of Sarah and fill nothing.
      const morning = await dayAt('2026-09-22T08:35');
      expect(morning.summary.done).toBe(0);
      expect(morning.freeGap).toEqual({
        startsAt: '2026-09-22T08:00:00.000Z',
        endsAt: '2026-09-22T09:00:00.000Z',
      });
      expect(morning.placesAhead?.map((place) => place.name)).toEqual([w.own.marker, w.gym.marker]);
      expect(morning.placesAhead?.[0]).toMatchObject({ name: w.own.marker });

      // 12:30: Anna and Mark are done (the cancelled 18:00 never is); 12:30–15:00 is free, the
      // gym is the only place left, listed once for the class.
      const noon = await dayAt('2026-09-22T12:30');
      expect(noon.summary.done).toBe(2);
      expect(noon.freeGap).toEqual({
        startsAt: '2026-09-22T10:30:00.000Z',
        endsAt: '2026-09-22T13:00:00.000Z',
      });
      expect(noon.placesAhead?.map((place) => place.name)).toEqual([w.gym.marker]);

      // 16:30: only the cancelled one is left: no gap, no place, three of four sessions have
      // happened that take place.
      const evening = await dayAt('2026-09-22T16:30');
      expect(evening.summary.done).toBe(3);
      expect(evening).not.toHaveProperty('freeGap');
      expect(evening.placesAhead).toEqual([]);
    });

    it('TD-01: a place says its name and, when it has one, its address', async () => {
      const w = await world();
      await admin.db
        .update(locations)
        .set({
          postcode: '1012 AB',
          houseNumber: '12',
          street: 'Damstraat',
          city: 'Amsterdam',
        })
        .where(eq(locations.organizationId, w.gym.id));

      const body = (await (await day('2026-09-22', w.sarah)).json()) as DayBody;

      expect(body.placesAhead?.[0]).toEqual({ name: w.own.marker });
      expect(body.placesAhead?.[1]).toEqual({
        name: w.gym.marker,
        address: {
          postcode: '1012 AB',
          houseNumber: '12',
          houseNumberAddition: null,
          street: 'Damstraat',
          city: 'Amsterdam',
        },
      });
    });

    it('TD-01: another date has no free gap and no places ahead, and counts what was done by now', async () => {
      const w = await world();

      const past = (await (
        await day('2026-09-22', w.sarah, api({ now: '2026-09-23T08:00' }))
      ).json()) as DayBody;
      const coming = (await (
        await day('2026-09-22', w.sarah, api({ now: '2026-09-21T20:00' }))
      ).json()) as DayBody;

      expect(past.summary.done).toBe(3);
      expect(coming.summary.done).toBe(0);
      for (const other of [past, coming]) {
        expect(other).not.toHaveProperty('freeGap');
        expect(other).not.toHaveProperty('placesAhead');
      }
    });

    it('AC3: only Sarah’s sessions from her two workspaces; never Tom’s, John’s or Mike’s', async () => {
      const w = await world();

      const text = await (await day('2026-09-22', w.sarah)).text();

      for (const id of w.others) expect(text).not.toContain(id);
      expect(text).not.toContain(w.studio.id);
      expect(text).not.toContain(w.studio.marker);
    });

    it('AC5: the next session date when today is empty, and nothing else on an empty day', async () => {
      const w = await world();
      const tomGym = await profileOf(w.gym.id, w.tom.id);
      for (const [status, local] of [
        // A cancelled one on the 29th is not "next"; Thursday 1 October is.
        ['cancelled', '2026-09-29T09:00'],
        ['scheduled', '2026-10-01T09:00'],
      ] as const) {
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.mark.id,
          trainerProfileId: tomGym,
          status,
          startsAt: zonedTime(local),
        });
      }
      // Tom has Mark at 10:00 on the 22nd in the world. The day before: empty, the next one is the 22nd.
      const monday = (await (await day('2026-09-21', w.tom)).json()) as DayBody;
      // The day after: empty, and the next one is 1 October.
      const wednesday = (await (await day('2026-09-23', w.tom)).json()) as DayBody;

      expect(monday).toMatchObject({
        items: [],
        summary: { count: 0 },
        nextSessionDate: '2026-09-22',
        hasSessions: true,
        workspaceCount: 1,
      });
      expect(monday).toHaveProperty('tomorrow.count', 1);
      expect(monday.summary).not.toHaveProperty('firstStartsAt');
      expect(monday).not.toHaveProperty('next');
      expect(wednesday).toMatchObject({
        items: [],
        nextSessionDate: '2026-10-01',
        hasSessions: true,
      });
      expect(wednesday).not.toHaveProperty('tomorrow');
    });

    it('AC5: a trainer with no sessions at all has none, and no next date', async () => {
      const w = await world();
      const newcomer = await createAccount(admin.db, { label: 'newcomer' });
      await addTeamRole(admin.db, { workspaceId: w.own.id, accountId: newcomer.id });

      const body = (await (await day('2026-09-22', newcomer)).json()) as DayBody;

      expect(body).toMatchObject({
        items: [],
        workspaceCount: 1,
        hasSessions: false,
        summary: { count: 0 },
      });
      expect(body).not.toHaveProperty('nextSessionDate');
      expect(body).not.toHaveProperty('tomorrow');
      expect(body).not.toHaveProperty('next');
    });

    it('AC5: tomorrow’s line from the next day’s sessions, and a day with sessions has no next date', async () => {
      const w = await world();
      const wednesday = zonedTime('2026-09-23T07:00');
      const sarahGym = await profileOf(w.gym.id, w.sarah.id);
      for (const hour of [7, 9, 17]) {
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.mark.id,
          trainerProfileId: sarahGym,
          startsAt: new Date(wednesday.getTime() + (hour - 7) * 3_600_000),
        });
      }

      const body = (await (await day('2026-09-22', w.sarah)).json()) as DayBody;

      expect(body.tomorrow).toEqual({
        date: '2026-09-23',
        count: 3,
        firstStartsAt: '2026-09-23T05:00:00.000Z',
      });
      expect(body).not.toHaveProperty('nextSessionDate');
    });

    it('AC6: the day of 25 October is 25 hours; a 00:30 session belongs to it and the 26th’s does not', async () => {
      const w = await world();
      const tomGym = await profileOf(w.gym.id, w.tom.id);
      for (const local of ['2026-10-25T00:30', '2026-10-25T23:30', '2026-10-26T00:00']) {
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          clientId: w.mark.id,
          trainerProfileId: tomGym,
          startsAt: zonedTime(local),
        });
      }

      const body = (await (await day('2026-10-25', w.tom)).json()) as DayBody;

      expect(body.items.map((item) => item.startsAt)).toEqual([
        '2026-10-24T22:30:00.000Z',
        '2026-10-25T22:30:00.000Z',
      ]);
      expect(body.tomorrow).toMatchObject({ date: '2026-10-26', count: 1 });
    });

    it('rejects a date that is none, a missing date and an unknown surface with a field error', async () => {
      const w = await world();

      const none = await day('2026-02-30', w.sarah);
      const missing = await get(api(), '/v1/me/day', w.sarah);
      const shape = await day('22-09-2026', w.sarah);
      const surface = await day('2026-09-22', w.sarah, api(), '&surface=watch');

      expect([none.status, missing.status, shape.status, surface.status]).toEqual([
        400, 400, 400, 400,
      ]);
      expect(await none.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'date', code: 'invalid_date' }],
      });
      expect(((await surface.json()) as { issues: { path: string }[] }).issues[0]?.path).toBe(
        'surface',
      );
    });
  });

  describe('GET /v1/me/sessions', () => {
    it('AC3: only Sarah’s sessions and only her workspaces, one tenant context per workspace', async () => {
      const w = await world();
      // Every context the API sets in its transaction, by the workspace IDs it names.
      const contexts: string[] = [];
      const dialect = new PgDialect();
      const watched = new Proxy(app.db, {
        get(target, property) {
          if (property !== 'transaction') {
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
          }
          return (run: (tx: never) => Promise<unknown>, config?: never) =>
            target.transaction(
              (tx) =>
                run(
                  new Proxy(tx, {
                    get(inner, key) {
                      const value = Reflect.get(inner, key);
                      if (key !== 'execute') {
                        return typeof value === 'function' ? value.bind(inner) : value;
                      }
                      return (query: Parameters<typeof tx.execute>[0]) => {
                        const { sql: text, params } = dialect.sqlToQuery(query as never);
                        if (text.includes('set_config')) contexts.push(String(params[1]));
                        return inner.execute(query);
                      };
                    },
                  }) as never,
                ),
              config,
            );
        },
      });

      const response = await sessionsOf(
        '2026-09-22',
        '2026-09-22',
        w.sarah,
        api({ tenantScopes: createTenantScopes(() => watched as never) }),
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as RangeBody;
      expect(body.items.map((item) => item.sessionId)).toEqual([
        w.annaSession.id,
        w.markSession.id,
        w.kracht.id,
        w.krachtCancelled.id,
      ]);
      expect(new Set(body.items.map((item) => item.workspace.id))).toEqual(
        new Set([w.gym.id, w.own.id]),
      );
      // Never Tom's, John's or Mike's, nor a session without a trainer, nor Fit Studio.
      const text = JSON.stringify(body);
      for (const id of w.others) expect(text).not.toContain(id);
      expect(text).not.toContain(w.studio.id);
      // The contexts: the account alone, the account's workspaces, each workspace by itself, back.
      const both = [w.gym.id, w.own.id].toSorted().join(',');
      const alone = contexts.filter((ids) => ids !== '' && !ids.includes(','));
      expect(alone.toSorted()).toEqual([w.gym.id, w.own.id].toSorted());
      expect(contexts[0]).toBe('');
      expect(contexts[1]).toBe(both);
      expect(contexts.at(-1)).toBe(both);
      expect(contexts).toHaveLength(5);
      expect(body).toMatchObject({ from: '2026-09-22', to: '2026-09-22', workspaceCount: 2 });
    });

    it('AC3: Tom sees only his own session in John’s Gym, and John only his', async () => {
      const w = await world();

      const tom = (await (await sessionsOf('2026-09-22', '2026-09-22', w.tom)).json()) as RangeBody;
      const john = (await (
        await sessionsOf('2026-09-22', '2026-09-22', w.john)
      ).json()) as RangeBody;

      expect(tom.items).toHaveLength(1);
      expect(tom.items[0]).toMatchObject({
        workspace: { id: w.gym.id },
        clientName: 'Mark Jansen',
      });
      expect(john.items).toHaveLength(1);
      expect(john.items[0]?.sessionId).toBe(w.others[1]);
    });

    it('AC1: the class name in the viewer’s language, in the range too', async () => {
      const w = await world();
      const range = async (preferredLocale: 'nl-NL' | 'en') => {
        await admin.db
          .update(authUsers)
          .set({ preferredLocale })
          .where(eq(authUsers.id, w.sarah.id));
        const body = (await (
          await sessionsOf('2026-09-22', '2026-09-22', w.sarah)
        ).json()) as RangeBody;
        return body.items.map((item) => item.className);
      };

      // Anna, Mark, Kracht and the cancelled Kracht, in time order; the private ones name no class.
      expect(await range('nl-NL')).toEqual([undefined, undefined, 'Kracht', 'Kracht']);
      expect(await range('en')).toEqual([undefined, undefined, 'Strength', 'Strength']);
    });

    it('lists a week and a month in time order, the range’s last day whole', async () => {
      const w = await world();
      const tomGym = await profileOf(w.gym.id, w.tom.id);
      const made = [];
      for (const local of ['2026-10-20T18:00', '2026-10-25T23:30', '2026-10-26T00:00']) {
        made.push(
          await addSession(admin.db, {
            workspaceId: w.gym.id,
            clientId: w.mark.id,
            trainerProfileId: tomGym,
            startsAt: zonedTime(local),
          }),
        );
      }

      const week = (await (
        await sessionsOf('2026-10-19', '2026-10-25', w.tom)
      ).json()) as RangeBody;

      // The class at 18:00 on 20 October is 16:00 UTC (summer time); 23:30 on the 25th is winter time.
      expect(week.items.map((item) => item.startsAt)).toEqual([
        '2026-10-20T16:00:00.000Z',
        '2026-10-25T22:30:00.000Z',
      ]);
      expect(week.items.map((item) => item.sessionId)).toEqual([made[0]?.id, made[1]?.id]);
    });

    it('rejects a range of more than 42 days, one that ends first, dates that are none and a missing end', async () => {
      const w = await world();
      const bad = async (query: string) => {
        const response = await get(api(), `/v1/me/sessions${query}`, w.sarah);
        return [
          response.status,
          (await response.json()) as { issues: { path: string; code: string }[] },
        ] as const;
      };

      expect((await sessionsOf('2026-09-01', '2026-10-12', w.sarah)).status).toBe(200);
      expect(await bad('?from=2026-09-01&to=2026-10-13')).toEqual([
        400,
        { code: 'validation_failed', issues: [{ path: 'to', code: 'range_too_long' }] },
      ]);
      expect(await bad('?from=2026-09-22&to=2026-09-21')).toEqual([
        400,
        { code: 'validation_failed', issues: [{ path: 'to', code: 'before_from' }] },
      ]);
      expect(await bad('?from=2026-02-30&to=2026-03-05')).toEqual([
        400,
        { code: 'validation_failed', issues: [{ path: 'from', code: 'invalid_date' }] },
      ]);
      expect((await bad('?from=2026-09-22'))[0]).toBe(400);
      expect((await bad(''))[0]).toBe(400);
    });

    it('AC8: removed from John’s Gym, its sessions are no longer returned', async () => {
      const w = await world();
      const before = (await (
        await sessionsOf('2026-09-22', '2026-09-22', w.sarah)
      ).json()) as RangeBody;

      await endTeamRole(admin.db, { workspaceId: w.gym.id, accountId: w.sarah.id });
      const after = (await (
        await sessionsOf('2026-09-22', '2026-09-22', w.sarah)
      ).json()) as RangeBody;
      const dayAfter = (await (await day('2026-09-22', w.sarah)).json()) as DayBody;

      expect(before.items).toHaveLength(4);
      expect(after.items.map((item) => item.sessionId)).toEqual([w.annaSession.id]);
      expect(after.workspaceCount).toBe(1);
      expect(dayAfter.items.map((item) => item.sessionId)).toEqual([w.annaSession.id]);
      expect(JSON.stringify(after)).not.toContain(w.gym.id);
    });

    it('AC12: an Owner without a trainer profile gets an empty list, not 403', async () => {
      const w = await world();
      // John's Gym's Owner who does not train, besides Nina who owns a workspace of her own.
      const ownerNotTraining = await createAccount(admin.db, { label: 'owner-not-training' });
      await addTeamRole(admin.db, {
        workspaceId: w.gym.id,
        accountId: ownerNotTraining.id,
        role: 'owner',
      });

      for (const who of [ownerNotTraining, w.nina]) {
        const list = await sessionsOf('2026-09-22', '2026-09-22', who);
        const today = await day('2026-09-22', who);

        expect(list.status).toBe(200);
        expect(await list.json()).toEqual({
          from: '2026-09-22',
          to: '2026-09-22',
          timeZone: 'Europe/Amsterdam',
          workspaceCount: 0,
          items: [],
        });
        expect(today.status).toBe(200);
        expect(await today.json()).toMatchObject({
          items: [],
          workspaceCount: 0,
          hasSessions: false,
          summary: { count: 0, done: 0 },
        });
        expect(await (await day('2026-09-22', who)).json()).not.toHaveProperty('freeGap');
        expect(((await (await day('2026-09-22', who)).json()) as DayBody).placesAhead).toEqual([]);
      }
    });

    it('AC12: an Owner who switches training on sees their sessions from then on', async () => {
      const w = await world();
      const [member] = await admin.db
        .select({ id: teamMembers.id, workspaceId: teamMembers.organizationId })
        .from(teamMembers)
        .where(eq(teamMembers.accountId, w.nina.id));
      const [created] = await admin.db
        .insert(trainerProfiles)
        .values({
          organizationId: member?.workspaceId as string,
          teamMemberId: member?.id as string,
        })
        .returning({ id: trainerProfiles.id });
      const session = await addSession(admin.db, {
        workspaceId: member?.workspaceId as string,
        trainerProfileId: created?.id as string,
        startsAt: zonedTime('2026-09-22T10:00'),
      });

      const body = (await (
        await sessionsOf('2026-09-22', '2026-09-22', w.nina)
      ).json()) as RangeBody;

      expect(body.items.map((item) => item.sessionId)).toEqual([session.id]);
    });

    it('AC13: a client account gets an empty list, a session it takes part in is never listed; anonymous gets 401', async () => {
      const w = await world();
      // Lisa takes part in a session of John's Gym; her account is a client of it, never its way in.
      const [lisaClient] = await admin.db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.accountId, w.lisa.id));
      const session = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: lisaClient?.id as string,
        trainerProfileId: null,
        startsAt: zonedTime('2026-09-22T16:00'),
      });

      const list = await sessionsOf('2026-09-22', '2026-09-22', w.lisa);
      const today = await day('2026-09-22', w.lisa);
      const anonymousList = await sessionsOf('2026-09-22', '2026-09-22', undefined);
      const anonymousDay = await day('2026-09-22', undefined);

      expect(list.status).toBe(200);
      expect(((await list.json()) as RangeBody).items).toEqual([]);
      expect(today.status).toBe(200);
      const todayText = await today.text();
      expect(todayText).not.toContain(session.id);
      // The empty answer: nothing done, no gap and no place.
      expect(JSON.parse(todayText)).toMatchObject({
        summary: { count: 0, done: 0 },
        placesAhead: [],
      });
      expect(JSON.parse(todayText)).not.toHaveProperty('freeGap');
      expect([anonymousList.status, anonymousDay.status]).toEqual([401, 401]);
      expect(await anonymousList.json()).toEqual({ code: 'not_signed_in' });
    });

    it('AC15: a seeded pilot week (about 15 classes and 30 private sessions) in one request within budget', async () => {
      const gym = await createWorkspace(admin.db, { label: 'pilot-gym' });
      const own = await createWorkspace(admin.db, { label: 'pilot-own' });
      const trainer = await createAccount(admin.db, { label: 'pilot-trainer' });
      await addTeamRole(admin.db, { workspaceId: gym.id, accountId: trainer.id });
      await addTeamRole(admin.db, {
        workspaceId: own.id,
        accountId: trainer.id,
        role: 'owner',
        trainsHere: true,
      });
      const [inGym, inOwn] = [
        await profileOf(gym.id, trainer.id),
        await profileOf(own.id, trainer.id),
      ];
      const members = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          addClient(admin.db, {
            workspaceId: index < 5 ? gym.id : own.id,
            name: `Client ${index}`,
          }),
        ),
      );
      const monday = zonedTime('2026-09-21T07:00');
      const hours = (count: number) => new Date(monday.getTime() + count * 3_600_000);
      // About 15 classes in John's Gym, four places taken each; about 30 private sessions in her own.
      for (let index = 0; index < 15; index++) {
        const group = await addSession(admin.db, {
          workspaceId: gym.id,
          type: 'group',
          capacity: 12,
          participant: false,
          trainerProfileId: inGym,
          startsAt: hours(Math.floor(index / 3) * 24 + 4 * (index % 3)),
        });
        await admin.db.insert(sessionParticipants).values(
          members.slice(0, 4).map((client) => ({
            organizationId: gym.id,
            sessionId: group.id,
            clientId: client.id,
          })),
        );
      }
      for (let index = 0; index < 30; index++) {
        await addSession(admin.db, {
          workspaceId: own.id,
          clientId: members[5 + (index % 5)]?.id as string,
          trainerProfileId: inOwn,
          startsAt: hours(Math.floor(index / 6) * 24 + (index % 6)),
        });
      }
      const server = api();

      const started = performance.now();
      const response = await sessionsOf('2026-09-21', '2026-09-27', trainer, server);
      const elapsed = performance.now() - started;

      expect(response.status).toBe(200);
      const body = (await response.json()) as RangeBody;
      expect(body.items).toHaveLength(45);
      expect(body.workspaceCount).toBe(2);
      expect(elapsed).toBeLessThan(500);
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

    it('AC17: my_day_viewed and my_calendar_viewed carry the surface and the workspace count only', async () => {
      const { posthog, lines, productEvents, restore } = capture();
      const w = await world();
      const server = api({ productEvents });
      const app = { authorization: 'Bearer token' };

      const responses = [
        await get(server, '/v1/me/day?date=2026-09-22', w.sarah),
        await get(server, '/v1/me/day?date=2026-09-22&surface=ios', w.sarah, app),
        await get(
          server,
          '/v1/me/sessions?from=2026-09-21&to=2026-09-27&surface=android',
          w.sarah,
          app,
        ),
        await get(server, '/v1/me/sessions?from=2026-09-21&to=2026-09-27', w.sarah),
      ];

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
      expect(posthog.events.map(({ event }) => event)).toEqual([
        'my_day_viewed',
        'my_day_viewed',
        'my_calendar_viewed',
        'my_calendar_viewed',
      ]);
      expect(posthog.events.map(({ properties }) => properties)).toEqual([
        expect.objectContaining({ surface: 'web', workspace_count: 2 }),
        expect.objectContaining({ surface: 'ios', workspace_count: 2 }),
        expect.objectContaining({ surface: 'android', workspace_count: 2 }),
        expect.objectContaining({ surface: 'web', workspace_count: 2 }),
      ]);
      for (const event of posthog.events) {
        const keys = Object.keys(event.properties ?? {}).filter((key) => !key.startsWith('$'));
        expect(keys.toSorted()).toEqual(['surface', 'workspace_count']);
        expect(event.distinct_id).toBe(w.sarah.id);
      }
      // Nothing of the day reaches PostHog or the log: no client, class, workspace, time or address.
      const sent = JSON.stringify([posthog.events, lines]);
      for (const personal of [
        'Anna de Vries',
        'Mark Jansen',
        'Kracht',
        'Strength',
        w.sarah.email,
        w.gym.marker,
        w.own.marker,
        w.annaSession.id,
        '2026-09-22T07:00',
        '09:00',
      ]) {
        expect(sent).not.toContain(personal);
      }
      restore();
    });

    it('AC17: a bearer token that names no surface, a refusal and a validation error record nothing', async () => {
      const { posthog, productEvents, restore } = capture();
      const w = await world();
      const server = api({ productEvents });

      const noSurface = await get(server, '/v1/me/day?date=2026-09-22', w.sarah, {
        authorization: 'Bearer token',
      });
      const anonymous = await get(server, '/v1/me/day?date=2026-09-22', undefined);
      const invalid = await get(server, '/v1/me/day?date=2026-02-30', w.sarah);

      expect([noSurface.status, anonymous.status, invalid.status]).toEqual([200, 401, 400]);
      expect(posthog.events).toEqual([]);
      restore();
    });
  });

  describe('the contract', () => {
    it('AC16: both routes are in the committed contract with their access, for any signed-in account', () => {
      for (const [path, operationId] of [
        ['/v1/me/day', 'getMyDay'],
        ['/v1/me/sessions', 'listMySessions'],
      ] as const) {
        const operation = contract.paths[path].get;

        expect(operation.operationId).toBe(operationId);
        expect(operation['x-access']).toEqual({ type: 'account', workspaces: 'team' });
        expect(Object.keys(operation.responses).toSorted()).toEqual(
          ['200', '400', '401', '500'].toSorted(),
        );
      }
    });
  });
});
