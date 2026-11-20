import { readFileSync } from 'node:fs';
import {
  authUsers,
  bookingLinks,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  sessions,
} from '@fivvi/database';
import {
  addBookingLink,
  addClient,
  addGroupClass,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import { BOOKING_LINK_CODE_ALPHABET, BOOKING_LINK_CODE_LENGTH } from '@fivvi/domain';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F037 (spec #473, ticket #955): booking links through the API, GET and POST
// /v1/workspaces/{workspaceId}/booking-links and POST …/booking-links/{linkId}/deactivate.
// Synthetic people: John (Owner of John's Gym), Sarah (Trainer), Anna de Vries (an approved client
// with an account), Mike (Owner of Fit Studio), Pieter (an account with no place anywhere). The
// class "Kracht" every Tuesday 18:00, Europe/Amsterdam: Tuesday 17 November 2026 is 17:00 UTC.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const APP_BASE_URL = 'https://fivvi.example.test';
const CODE = new RegExp(`^[${BOOKING_LINK_CODE_ALPHABET}]{${BOOKING_LINK_CODE_LENGTH}}$`);
const NOW = new Date('2026-11-11T10:00:00.000Z');
const TUESDAY = new Date('2026-11-17T17:00:00.000Z');

interface ClassName {
  id: string;
  nameNl: string;
  nameEn: string | null;
}

interface LinkBody {
  id: string;
  url: string;
  scope: 'all' | 'group' | 'class' | 'session';
  language: 'visitor' | 'nl' | 'en';
  active: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  groupClass: ClassName | null;
  date: { id: string; startsAt: string; timeZone: string; groupClass: ClassName } | null;
}

const codeOf = (link: LinkBody) => link.url.replace(`${APP_BASE_URL}/l/`, '');

describe('F037 booking links through the API', () => {
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

  const api = (overrides: Partial<ApiDependencies> = {}) =>
    createApp({
      ...NO_DEPENDENCIES,
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
      appBaseUrl: () => APP_BASE_URL,
      clock: { now: () => NOW },
      ...overrides,
    });

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    const annaAccount = await createAccount(admin.db, { label: 'anna' });
    const pieter = await createAccount(admin.db, { label: 'pieter' });
    const johnRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
    });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    await addClient(admin.db, {
      workspaceId: gym.id,
      accountId: annaAccount.id,
      name: 'Anna de Vries',
    });
    const kracht = await addGroupClass(admin.db, {
      workspaceId: gym.id,
      nameNl: 'Kracht',
      nameEn: 'Strength',
    });
    const tuesday = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'group',
      groupClassId: kracht.id,
      participant: false,
      startsAt: TUESDAY,
    });
    const yesterday = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'group',
      groupClassId: kracht.id,
      participant: false,
      startsAt: new Date('2026-11-10T17:00:00.000Z'),
    });
    const privateSession = await addSession(admin.db, {
      workspaceId: gym.id,
      startsAt: new Date('2026-11-18T09:00:00.000Z'),
    });
    const openGym = await addSession(admin.db, {
      workspaceId: gym.id,
      type: 'open_gym',
      groupClassId: null,
      participant: false,
      startsAt: new Date('2026-11-13T10:00:00.000Z'),
    });
    const theirs = await addSession(admin.db, {
      workspaceId: other.id,
      type: 'group',
      participant: false,
      startsAt: TUESDAY,
    });
    const theirClass = await addGroupClass(admin.db, { workspaceId: other.id });
    return {
      gym,
      other,
      john,
      johnRole,
      sarah,
      mike,
      annaAccount,
      pieter,
      kracht,
      tuesday,
      yesterday,
      privateSession,
      openGym,
      theirs,
      theirClass,
    };
  }

  type Who = { id: string } | undefined;
  const asWho = (who: Who) => (who ? { 'x-test-account': who.id } : {});

  const list = (workspaceId: string, who?: Who, server = api()) =>
    server.request(`/v1/workspaces/${workspaceId}/booking-links`, { headers: asWho(who) });

  const make = (
    workspaceId: string,
    who: Who,
    body: unknown,
    server = api(),
    headers: Record<string, string> = {},
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/booking-links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...asWho(who), ...headers },
      body: JSON.stringify(body),
    });

  const deactivate = (workspaceId: string, linkId: string, who?: Who, server = api()) =>
    server.request(`/v1/workspaces/${workspaceId}/booking-links/${linkId}/deactivate`, {
      method: 'POST',
      headers: asWho(who),
    });

  const linksOf = async (response: Response) =>
    ((await response.json()) as { links: LinkBody[] }).links;

  const storedLinks = (workspaceId: string) =>
    admin.db.select().from(bookingLinks).where(eq(bookingLinks.organizationId, workspaceId));

  it('AC1: standing links made once', async () => {
    const { gym, john, sarah } = await world();
    expect(await storedLinks(gym.id)).toEqual([]);

    const first = await list(gym.id, john);
    expect(first.status).toBe(200);
    const links = await linksOf(first);
    expect(links.map(({ scope, language, active }) => [scope, language, active])).toEqual([
      ['all', 'visitor', true],
      ['group', 'visitor', true],
    ]);
    for (const link of links) {
      expect(link.url).toMatch(
        new RegExp(
          `^${APP_BASE_URL}/l/[${BOOKING_LINK_CODE_ALPHABET}]{${BOOKING_LINK_CODE_LENGTH}}$`,
        ),
      );
      expect(codeOf(link)).toMatch(CODE);
      expect(link).toMatchObject({ groupClass: null, date: null, deactivatedAt: null });
    }

    // A second list, by Sarah, and four lists at the same time, make no more.
    const second = await linksOf(await list(gym.id, sarah));
    const together = await Promise.all(
      Array.from({ length: 4 }, async () => linksOf(await list(gym.id, john))),
    );
    expect(second).toEqual(links);
    for (const again of together) expect(again).toEqual(links);
    expect(await storedLinks(gym.id)).toHaveLength(2);
  });

  it('AC1: concurrent first lists make the standing links once', async () => {
    const { gym, john, sarah } = await world();
    const responses = await Promise.all([
      list(gym.id, john),
      list(gym.id, sarah),
      list(gym.id, john),
      list(gym.id, sarah),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(await storedLinks(gym.id)).toHaveLength(2);
  });

  it('AC2: class and date links, get-or-create', async () => {
    const { gym, john, johnRole, kracht, tuesday } = await world();

    const created = await make(gym.id, john, {
      scope: 'class',
      groupClassId: kracht.id,
      language: 'en',
    });
    expect(created.status).toBe(201);
    const link = (await created.json()) as LinkBody;
    expect(link).toMatchObject({
      scope: 'class',
      language: 'en',
      active: true,
      deactivatedAt: null,
      groupClass: { id: kracht.id, nameNl: 'Kracht', nameEn: 'Strength' },
      date: null,
    });
    expect(codeOf(link)).toMatch(CODE);
    const [stored] = await storedLinks(gym.id);
    expect(stored).toMatchObject({
      scope: 'class',
      language: 'en',
      groupClassId: kracht.id,
      sessionId: null,
      createdByTeamMemberId: johnRole.id,
      deactivatedAt: null,
    });

    // The same again returns the existing link; another language is another link.
    const again = await make(gym.id, john, {
      scope: 'class',
      groupClassId: kracht.id,
      language: 'en',
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(link);
    expect(await storedLinks(gym.id)).toHaveLength(1);
    const dutch = await make(gym.id, john, {
      scope: 'class',
      groupClassId: kracht.id,
      language: 'nl',
    });
    expect(dutch.status).toBe(201);
    expect(((await dutch.json()) as LinkBody).id).not.toBe(link.id);

    // Tuesday 17 November: the UTC start and the workspace time zone.
    const date = await make(gym.id, john, {
      scope: 'session',
      sessionId: tuesday.id,
      language: 'visitor',
    });
    expect(date.status).toBe(201);
    expect(await date.json()).toMatchObject({
      scope: 'session',
      language: 'visitor',
      groupClass: null,
      date: {
        id: tuesday.id,
        startsAt: '2026-11-17T17:00:00.000Z',
        timeZone: 'Europe/Amsterdam',
        groupClass: { id: kracht.id, nameNl: 'Kracht', nameEn: 'Strength' },
      },
    });
    expect(
      (await make(gym.id, john, { scope: 'session', sessionId: tuesday.id, language: 'visitor' }))
        .status,
    ).toBe(200);
  });

  it('AC2: two get-or-creates at the same time return one link', async () => {
    const { gym, john, sarah, tuesday } = await world();
    const body = { scope: 'session', sessionId: tuesday.id, language: 'visitor' };
    const responses = await Promise.all([
      make(gym.id, john, body),
      make(gym.id, sarah, body),
      make(gym.id, john, body),
    ]);
    const links = await Promise.all(
      responses.map(async (response) => (await response.json()) as LinkBody),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(links.map((link) => link.id)).size).toBe(1);
    expect(await storedLinks(gym.id)).toHaveLength(1);
  });

  it('AC2: a target of another workspace, a private session, an Open Gym slot or a past date is refused', async () => {
    const { gym, john, theirs, theirClass, yesterday, privateSession, openGym } = await world();
    const refusals = [
      await make(gym.id, john, { scope: 'session', sessionId: theirs.id, language: 'visitor' }),
      await make(gym.id, john, {
        scope: 'class',
        groupClassId: theirClass.id,
        language: 'visitor',
      }),
      await make(gym.id, john, { scope: 'session', sessionId: privateSession.id, language: 'nl' }),
      await make(gym.id, john, { scope: 'session', sessionId: openGym.id, language: 'nl' }),
      await make(gym.id, john, {
        scope: 'session',
        sessionId: '3f1c8d54-6c0e-4a1f-9d6e-2a7b5c4d9e10',
        language: 'nl',
      }),
      await make(gym.id, john, { scope: 'session', sessionId: yesterday.id, language: 'visitor' }),
    ];
    expect(refusals.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 400]);
    expect(await refusals[5]?.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'sessionId', code: 'date_passed' }],
    });
    expect(await storedLinks(gym.id)).toEqual([]);
  });

  it('AC2: a request must name the target of its scope and nothing else', async () => {
    const { gym, john, kracht, tuesday } = await world();
    const bad = [
      { scope: 'class', language: 'nl' },
      { scope: 'session', language: 'nl' },
      { scope: 'all', language: 'nl', groupClassId: kracht.id },
      { scope: 'group', language: 'nl', sessionId: tuesday.id },
      { scope: 'class', language: 'nl', groupClassId: kracht.id, sessionId: tuesday.id },
      { scope: 'open_gym', language: 'nl' },
      { scope: 'all', language: 'fr' },
      { scope: 'all' },
      { scope: 'class', language: 'nl', groupClassId: 'not-a-uuid' },
    ];
    const statuses = [];
    for (const body of bad) statuses.push((await make(gym.id, john, body)).status);
    expect(statuses).toEqual(bad.map(() => 400));
    expect(await storedLinks(gym.id)).toEqual([]);
  });

  it('AC7: deactivate; a new link gets a new code', async () => {
    const { gym, john, kracht } = await world();
    const request = { scope: 'class', groupClassId: kracht.id, language: 'en' };
    const link = (await (await make(gym.id, john, request)).json()) as LinkBody;
    await list(gym.id, john);

    const stopped = await deactivate(gym.id, link.id, john);
    expect(stopped.status).toBe(200);
    expect(await stopped.json()).toMatchObject({
      id: link.id,
      url: link.url,
      active: false,
      deactivatedAt: NOW.toISOString(),
    });
    // Listed after the active ones.
    const links = await linksOf(await list(gym.id, john));
    expect(links.map(({ id }) => id).at(-1)).toBe(link.id);
    expect(links.filter(({ active }) => active)).toHaveLength(2);

    // Again changes nothing, not even the time.
    const later = api({ clock: { now: () => new Date('2026-11-12T10:00:00.000Z') } });
    const again = await deactivate(gym.id, link.id, john, later);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ deactivatedAt: NOW.toISOString(), active: false });

    // A new link for the same class and language gets a new code; the old one is not reused.
    const fresh = await make(gym.id, john, request);
    expect(fresh.status).toBe(201);
    const next = (await fresh.json()) as LinkBody;
    expect(next.id).not.toBe(link.id);
    expect(codeOf(next)).not.toBe(codeOf(link));
    expect(next.active).toBe(true);
    const all = await linksOf(await list(gym.id, john));
    expect(all.map(({ active }) => active)).toEqual([true, true, true, false]);
  });

  it('AC7: a standing link that is deactivated is made anew, with a new code, on the next list', async () => {
    const { gym, john } = await world();
    const [all] = await linksOf(await list(gym.id, john));
    if (!all) throw new Error('no standing link');
    await deactivate(gym.id, all.id, john);
    const links = await linksOf(await list(gym.id, john));
    expect(links.map(({ scope, active }) => [scope, active])).toEqual([
      ['all', true],
      ['group', true],
      ['all', false],
    ]);
    expect(codeOf(links[0] as LinkBody)).not.toBe(codeOf(all));
  });

  it('AC7: an unknown link, or one of another workspace, answers 404 and nothing changes', async () => {
    const { gym, other, john } = await world();
    const theirs = await addBookingLink(admin.db, { workspaceId: other.id });
    const statuses = [
      (await deactivate(gym.id, theirs.id, john)).status,
      (await deactivate(gym.id, '3f1c8d54-6c0e-4a1f-9d6e-2a7b5c4d9e10', john)).status,
      (await deactivate(gym.id, 'not-a-uuid', john)).status,
    ];
    expect(statuses).toEqual([404, 404, 400]);
    const [stored] = await storedLinks(other.id);
    expect(stored?.deactivatedAt).toBeNull();
  });

  it('AC9: Trainer copies, cannot manage', async () => {
    const { gym, john, sarah, kracht, tuesday } = await world();

    // She lists, and gets-or-creates the link of Tuesday's Kracht with the visitor's language.
    const listed = await list(gym.id, sarah);
    expect(listed.status).toBe(200);
    expect(await linksOf(listed)).toHaveLength(2);
    const date = { scope: 'session', sessionId: tuesday.id, language: 'visitor' };
    const hers = await make(gym.id, sarah, date);
    expect(hers.status).toBe(201);
    const link = (await hers.json()) as LinkBody;
    expect((await make(gym.id, sarah, date)).status).toBe(200);
    // John's request for the same link returns hers.
    expect(((await (await make(gym.id, john, date)).json()) as LinkBody).id).toBe(link.id);

    const before = await storedLinks(gym.id);
    const refused = [
      await make(gym.id, sarah, { scope: 'class', groupClassId: kracht.id, language: 'visitor' }),
      await make(gym.id, sarah, { scope: 'session', sessionId: tuesday.id, language: 'en' }),
      await make(gym.id, sarah, { scope: 'session', sessionId: tuesday.id, language: 'nl' }),
      await make(gym.id, sarah, { scope: 'all', language: 'visitor' }),
      await make(gym.id, sarah, { scope: 'group', language: 'visitor' }),
      await deactivate(gym.id, link.id, sarah),
    ];
    expect(refused.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(await storedLinks(gym.id)).toEqual(before);
  });

  it('AC10: other workspace 404, anonymous 401, client 404', async () => {
    const { gym, other, mike, annaAccount, pieter, john, kracht } = await world();
    const link = (await (
      await make(gym.id, john, { scope: 'all', language: 'nl' })
    ).json()) as LinkBody;
    const body = { scope: 'all', language: 'nl' };

    // Mike (Owner of Fit Studio) and Pieter (no place anywhere): 404 on every route.
    for (const who of [mike, pieter]) {
      const answers = [
        (await list(gym.id, who)).status,
        (await make(gym.id, who, body)).status,
        (await make(gym.id, who, { scope: 'class', groupClassId: kracht.id, language: 'nl' }))
          .status,
        (await deactivate(gym.id, link.id, who)).status,
      ];
      expect(answers).toEqual([404, 404, 404, 404]);
    }
    // Anonymous: 401.
    expect([
      (await list(gym.id)).status,
      (await make(gym.id, undefined, body)).status,
      (await deactivate(gym.id, link.id)).status,
    ]).toEqual([401, 401, 401]);
    // Anna, an approved client of John's Gym, is no team member: the access layer refuses her, as
    // it refuses a client on every team route (the answer is 403, not a 404; see the ticket's report).
    const clientAnswers = [
      (await list(gym.id, annaAccount)).status,
      (await make(gym.id, annaAccount, body)).status,
      (await deactivate(gym.id, link.id, annaAccount)).status,
    ];
    expect(clientAnswers).toEqual([403, 403, 403]);
    // None of it changed anything, and Fit Studio's own links are its own.
    expect((await storedLinks(gym.id)).filter(({ deactivatedAt }) => deactivatedAt)).toEqual([]);
    expect(await storedLinks(other.id)).toEqual([]);
    const theirs = await linksOf(await list(other.id, mike));
    const mine = await linksOf(await list(gym.id, john));
    expect(theirs).toHaveLength(2);
    const codes = [...theirs, ...mine].map(codeOf);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(CODE);
  });

  it('AC10: a refusal says nothing of the links: no URL, no code', async () => {
    const { gym, john, mike } = await world();
    const [first] = await linksOf(await list(gym.id, john));
    const code = codeOf(first as LinkBody);
    const bodies = [
      await (await list(gym.id, mike)).text(),
      await (await list(gym.id)).text(),
      await (await make(gym.id, mike, { scope: 'all', language: 'nl' })).text(),
    ];
    for (const body of bodies) expect(body).not.toContain(code);
  });

  it('AC11: a link’s target never changes; cancelled dates still resolve', async () => {
    const { gym, john, tuesday } = await world();
    const date = (await (
      await make(gym.id, john, { scope: 'session', sessionId: tuesday.id, language: 'visitor' })
    ).json()) as LinkBody;

    // There is no way to change scope, target or language: no such method answers.
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      for (const path of [
        `/v1/workspaces/${gym.id}/booking-links/${date.id}`,
        `/v1/workspaces/${gym.id}/booking-links`,
      ]) {
        const response = await api().request(path, { method, headers: asWho(john) });
        expect([404, 405], `${method} ${path}`).toContain(response.status);
      }
    }
    const paths = Object.keys(contract.paths).filter((path) => path.includes('booking-links'));
    expect(paths.toSorted()).toEqual([
      '/v1/workspaces/{workspaceId}/booking-links',
      '/v1/workspaces/{workspaceId}/booking-links/{linkId}/deactivate',
    ]);
    expect(Object.keys(contract.paths[paths[0] as string]).toSorted()).toEqual(['get', 'post']);
    expect(Object.keys(contract.paths[paths[1] as string])).toEqual(['post']);

    // The date is cancelled: its link is still listed and still points at that date.
    await admin.db.update(sessions).set({ status: 'cancelled' }).where(eq(sessions.id, tuesday.id));
    const listed = (await linksOf(await list(gym.id, john))).find(({ id }) => id === date.id);
    expect(listed).toEqual(date);
    expect(listed?.date?.id).toBe(tuesday.id);
  });

  it('AC12: the routes are in the committed contract with x-access', () => {
    const listOperation = contract.paths['/v1/workspaces/{workspaceId}/booking-links'];
    const deactivateOperation =
      contract.paths['/v1/workspaces/{workspaceId}/booking-links/{linkId}/deactivate'];
    expect(listOperation.get.operationId).toBe('listBookingLinks');
    expect(listOperation.get['x-access']).toEqual({
      type: 'workspace',
      capability: 'booking_link.copy',
      roles: ['owner', 'trainer'],
      client: 'none',
    });
    expect(listOperation.post.operationId).toBe('createBookingLink');
    expect(listOperation.post['x-access']).toEqual(listOperation.get['x-access']);
    expect(deactivateOperation.post.operationId).toBe('deactivateBookingLink');
    expect(deactivateOperation.post['x-access']).toEqual({
      type: 'workspace',
      capability: 'booking_link.manage',
      roles: ['owner'],
      client: 'none',
    });
    for (const operation of [listOperation.get, listOperation.post, deactivateOperation.post]) {
      expect(['401', '403', '404'].every((status) => status in operation.responses)).toBe(true);
    }
  });

  it('AC13: events carry no personal data or code', async () => {
    const { posthog, lines, productEvents, restore } = capture();
    const { gym, john, kracht, tuesday } = await world();
    const server = api({ productEvents });
    const app = { authorization: 'Bearer token' };

    const web = (await (
      await make(gym.id, john, { scope: 'class', groupClassId: kracht.id, language: 'en' }, server)
    ).json()) as LinkBody;
    const ios = await make(
      gym.id,
      john,
      { scope: 'session', sessionId: tuesday.id, language: 'visitor', surface: 'ios' },
      server,
      app,
    );
    await deactivate(gym.id, web.id, john, server);
    const standing = await linksOf(await list(gym.id, john, server));
    const deactivatedFromApp = await server.request(
      `/v1/workspaces/${gym.id}/booking-links/${(standing[0] as LinkBody).id}/deactivate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...asWho(john), ...app },
        body: JSON.stringify({ surface: 'android' }),
      },
    );
    const iosLink = (await ios.json()) as LinkBody;

    expect(deactivatedFromApp.status).toBe(200);
    expect(posthog.events.map(({ event, properties }) => [event, properties])).toEqual([
      [
        'booking_link_created',
        expect.objectContaining({
          workspace_id: gym.id,
          scope_kind: 'class',
          language_mode: 'en',
          surface: 'web',
        }),
      ],
      [
        'booking_link_created',
        expect.objectContaining({
          workspace_id: gym.id,
          scope_kind: 'session',
          language_mode: 'visitor',
          surface: 'ios',
        }),
      ],
      [
        'booking_link_deactivated',
        expect.objectContaining({
          workspace_id: gym.id,
          scope_kind: 'class',
          language_mode: 'en',
          surface: 'web',
        }),
      ],
      [
        'booking_link_deactivated',
        expect.objectContaining({
          workspace_id: gym.id,
          scope_kind: 'all',
          language_mode: 'visitor',
          surface: 'android',
        }),
      ],
    ]);
    for (const event of posthog.events) {
      const keys = Object.keys(event.properties ?? {}).filter((key) => !key.startsWith('$'));
      expect(keys.toSorted()).toEqual(['language_mode', 'scope_kind', 'surface', 'workspace_id']);
      expect(event.distinct_id).toBe(john.id);
    }
    const sent = JSON.stringify([posthog.events, lines]);
    const secrets = [
      john.email,
      gym.marker,
      codeOf(web),
      codeOf(iosLink),
      codeOf(standing[0] as LinkBody),
      web.id,
      iosLink.id,
      kracht.id,
      tuesday.id,
      'Kracht',
      'fivvi.example.test',
    ];
    for (const secret of secrets) expect(sent).not.toContain(secret);
    restore();
  });

  it('AC13: a repeat, a refusal, a read, a standing link and an app that names no surface record nothing', async () => {
    const { posthog, productEvents, restore } = capture();
    const { gym, john, sarah, mike, kracht, tuesday } = await world();
    const server = api({ productEvents });

    const link = (await (
      await make(gym.id, john, { scope: 'class', groupClassId: kracht.id, language: 'en' }, server)
    ).json()) as LinkBody;
    posthog.events.length = 0;

    const statuses = [
      (await list(gym.id, john, server)).status,
      // The same link again, and a bad surface.
      (
        await make(
          gym.id,
          john,
          { scope: 'class', groupClassId: kracht.id, language: 'en' },
          server,
        )
      ).status,
      (
        await make(
          gym.id,
          john,
          { scope: 'class', groupClassId: kracht.id, language: 'nl', surface: 'watch' },
          server,
        )
      ).status,
      // Refusals.
      (await make(gym.id, sarah, { scope: 'all', language: 'visitor' }, server)).status,
      (await make(gym.id, mike, { scope: 'all', language: 'visitor' }, server)).status,
      (await make(gym.id, undefined, { scope: 'all', language: 'visitor' }, server)).status,
      (
        await make(
          gym.id,
          john,
          { scope: 'session', sessionId: tuesday.id, language: 'visitor' },
          server,
          {
            authorization: 'Bearer token',
          },
        )
      ).status,
      (await deactivate(gym.id, link.id, sarah, server)).status,
    ];
    expect(statuses).toEqual([200, 200, 400, 403, 404, 401, 201, 403]);
    expect(posthog.events).toEqual([]);

    // Four deactivations at the same time record one event.
    const fresh = (await (
      await make(gym.id, john, { scope: 'class', groupClassId: kracht.id, language: 'nl' }, server)
    ).json()) as LinkBody;
    posthog.events.length = 0;
    const together = await Promise.all(
      Array.from({ length: 4 }, () => deactivate(gym.id, fresh.id, john, server)),
    );
    expect(together.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(posthog.events.map(({ event }) => event)).toEqual(['booking_link_deactivated']);
    posthog.events.length = 0;

    // Deactivating twice records the first only.
    await deactivate(gym.id, link.id, john, server);
    await deactivate(gym.id, link.id, john, server);
    expect(posthog.events.map(({ event }) => event)).toEqual(['booking_link_deactivated']);
    restore();
  });
});
