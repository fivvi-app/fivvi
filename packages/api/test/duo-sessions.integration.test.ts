import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  sessionParticipants,
  sessions,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import {
  createMemoryTransport,
  createPrivateSessionSender,
  createSendEmail,
  emailIdempotencyKey,
} from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { manualClock } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F066 (spec #586), first ticket (#779): plan a duo session through the API. Synthetic people: John
// (Owner of John's Gym, also trains), Sarah and Tom (Trainers), the clients Lisa Bakker (emails in
// Dutch), Eva Kok (emails in English) and Anna de Vries (with an account), Mike (Owner of Fit
// Studio). Workspace time zone Europe/Amsterdam. EM-11 goes through the capture transport.

// A week before the sessions below (Thursday 24 September 2026).
const NOW = '2026-09-17T10:00:00.000Z';

interface SessionBody {
  id: string;
  type: string;
  status: string;
  capacity: number;
  version: number;
  participants: { clientId: string; name: string; attendanceStatus: string }[];
}

interface PlannedBody {
  session: SessionBody;
  confirmationEmail: boolean;
}

interface PersonalItem {
  sessionId: string;
  type: string;
  capacity: number;
  clientName?: string;
  clients?: { clientId: string; name: string }[];
}

describe('F066 plan a duo session', () => {
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

  function setup(overrides: Partial<ApiDependencies> = {}) {
    const transport = createMemoryTransport();
    const dependencies: Partial<ApiDependencies> = {
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
      sendPrivateSession: createPrivateSessionSender({
        sendEmail: createSendEmail({
          transport,
          sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
          replyTo: { email: 'support@example.com' },
          sleep: () => Promise.resolve(),
          random: () => 0,
        }),
      }),
      clock: manualClock(NOW),
      ...overrides,
    };
    return { server: createApp({ ...NO_DEPENDENCIES, ...dependencies }), transport };
  }

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const named = async (label: string, name: string) => {
      const account = await createAccount(admin.db, { label });
      await admin.db.update(authUsers).set({ name }).where(eq(authUsers.id, account.id));
      return account;
    };
    const john = await named('john', 'John');
    const sarah = await named('sarah', 'Sarah');
    const tom = await named('tom', 'Tom');
    const mike = await createAccount(admin.db, { label: 'mike' });
    const annaAccount = await createAccount(admin.db, { label: 'anna-account' });
    const johnRole = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: john.id,
      role: 'owner',
      trainsHere: true,
    });
    const sarahRole = await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id });
    const tomRole = await addTeamRole(admin.db, { workspaceId: gym.id, accountId: tom.id });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    const lisa = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Lisa Bakker',
      email: 'lisa@example.com',
      emailLocale: 'nl-NL',
    });
    const eva = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Eva Kok',
      email: 'eva@example.com',
      emailLocale: 'en',
    });
    const anna = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Anna de Vries',
      email: 'anna@example.com',
      accountId: annaAccount.id,
    });
    const otherClient = await addClient(admin.db, { workspaceId: other.id });
    return {
      gym,
      other,
      john,
      sarah,
      tom,
      mike,
      annaAccount,
      johnRole,
      sarahRole,
      tomRole,
      lisa,
      eva,
      anna,
      otherClient,
    };
  }

  const call = (
    server: ReturnType<typeof setup>['server'],
    method: string,
    path: string,
    who?: { id: string },
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    server.request(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who ? { 'x-test-account': who.id } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const plan = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    who: { id: string } | undefined,
    body: unknown,
    headers?: Record<string, string>,
  ) => call(server, 'POST', `/v1/workspaces/${workspaceId}/sessions/private`, who, body, headers);
  const read = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    sessionId: string,
    who?: { id: string },
  ) => call(server, 'GET', `/v1/workspaces/${workspaceId}/sessions/${sessionId}`, who);

  /** Thursday 24 September 2026, 09:00 for an hour, by default. */
  const request = (body: Record<string, unknown>) => ({
    localDate: '2026-09-24',
    localStart: '09:00',
    durationMinutes: 60,
    notify: true,
    ...body,
  });

  const storedSessions = (workspaceId: string) =>
    admin.db
      .select()
      .from(sessions)
      .where(eq(sessions.organizationId, workspaceId))
      .orderBy(asc(sessions.createdAt), asc(sessions.id));

  it('AC1: Sarah plans Lisa and Eva: one private session with two participants; EM-11 goes to Lisa in Dutch and to Eva in English, once each, naming the other by first name only', async () => {
    const { gym, sarah, sarahRole, lisa, eva } = await world();
    const { server, transport } = setup();

    const response = await plan(
      server,
      gym.id,
      sarah,
      request({ clientId: lisa.id, secondClientId: eva.id, trainerId: sarahRole.id }),
    );

    expect(response.status).toBe(201);
    const planned = (await response.json()) as PlannedBody;
    expect(planned.confirmationEmail).toBe(true);
    expect(planned.session).toMatchObject({
      type: 'private',
      status: 'scheduled',
      capacity: 2,
      version: 1,
      participants: [
        { clientId: lisa.id, name: 'Lisa Bakker', attendanceStatus: 'booked' },
        { clientId: eva.id, name: 'Eva Kok', attendanceStatus: 'booked' },
      ],
    });
    // One session of the type `private`, two places: nothing stores a duo type.
    const [row, ...rest] = await storedSessions(gym.id);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ id: planned.session.id, type: 'private', capacity: 2 });
    const places = await admin.db
      .select({ clientId: sessionParticipants.clientId })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, planned.session.id))
      .orderBy(asc(sessionParticipants.createdAt));
    expect(places).toEqual([{ clientId: lisa.id }, { clientId: eva.id }]);

    // An email each, in the client's own language, with the other client's first name only.
    expect(transport.sent).toHaveLength(2);
    const toLisa = transport.sent.find((mail) => mail.to.email === 'lisa@example.com');
    const toEva = transport.sent.find((mail) => mail.to.email === 'eva@example.com');
    expect(toLisa).toMatchObject({
      locale: 'nl-NL',
      template: 'private-session',
      subject: 'Nieuwe afspraak: donderdag 24 september om 09:00',
      replyTo: { email: 'support@example.com' },
    });
    expect(toLisa?.text).toContain('Samen met: Eva');
    expect(toEva).toMatchObject({
      locale: 'en',
      template: 'private-session',
      subject: 'New appointment: Thursday 24 September at 09:00',
      replyTo: { email: 'support@example.com' },
    });
    expect(toEva?.text).toContain('Together with: Lisa');
    for (const [mail, other] of [
      [toLisa, 'Kok'],
      [toEva, 'Bakker'],
    ] as const) {
      const sent = JSON.stringify(mail);
      expect(sent).not.toContain(other);
      expect(sent).not.toContain(other === 'Kok' ? 'eva@example.com' : 'lisa@example.com');
    }
    // One idempotency key per client and event.
    expect(toLisa?.idempotencyKey).toBe(
      emailIdempotencyKey('EM-11', `${planned.session.id}:1:${lisa.id}`),
    );
    expect(toEva?.idempotencyKey).toBe(
      emailIdempotencyKey('EM-11', `${planned.session.id}:1:${eva.id}`),
    );
    expect(toLisa?.idempotencyKey).not.toBe(toEva?.idempotencyKey);
  });

  it('AC1: notify off or a past start sends nothing for a duo, as for one client', async () => {
    const { gym, sarah, lisa, eva } = await world();
    const { server, transport } = setup();

    const silent = await plan(
      server,
      gym.id,
      sarah,
      request({ clientId: lisa.id, secondClientId: eva.id, notify: false }),
    );
    const past = await plan(
      server,
      gym.id,
      sarah,
      request({
        clientId: lisa.id,
        secondClientId: eva.id,
        localDate: '2026-09-10',
      }),
    );

    expect(silent.status).toBe(201);
    expect(past.status).toBe(201);
    expect(transport.sent).toEqual([]);
  });

  it('a one-client session keeps one participant, a capacity of 1 and no mention of anyone else', async () => {
    const { gym, sarah, lisa } = await world();
    const { server, transport } = setup();

    const planned = (await (
      await plan(server, gym.id, sarah, request({ clientId: lisa.id }))
    ).json()) as PlannedBody;

    expect(planned.session.capacity).toBe(1);
    expect(planned.session.participants).toHaveLength(1);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.text).not.toContain('Samen met');
    expect(transport.sent[0]?.idempotencyKey).toBe(
      emailIdempotencyKey('EM-11', `${planned.session.id}:1`),
    );
  });

  describe('AC2: a duo has exactly two different clients', () => {
    it('the same client as first and second is a validation error on secondClientId; nothing is stored or sent', async () => {
      const { gym, sarah, lisa } = await world();
      const { server, transport } = setup();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: lisa.id, secondClientId: lisa.id }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'secondClientId', code: 'same_client' }],
      });
      expect(await storedSessions(gym.id)).toEqual([]);
      expect(transport.sent).toEqual([]);
    });

    it('a second client of another workspace, or none at all, is 404 and nothing is stored', async () => {
      const { gym, sarah, lisa, otherClient } = await world();
      const { server, transport } = setup();

      for (const secondClientId of [otherClient.id, crypto.randomUUID()]) {
        const response = await plan(
          server,
          gym.id,
          sarah,
          request({ clientId: lisa.id, secondClientId }),
        );
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: 'not_found' });
      }
      expect(await storedSessions(gym.id)).toEqual([]);
      expect(transport.sent).toEqual([]);
    });

    it('a body that is no UUID for the second client is a 400', async () => {
      const { gym, sarah, lisa } = await world();
      const { server } = setup();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: lisa.id, secondClientId: 'eva' }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('AC3: Owner any trainer, Trainer herself, client none', () => {
    it('John plans a duo for Tom', async () => {
      const { gym, john, tomRole, lisa, eva } = await world();
      const { server } = setup();

      const response = await plan(
        server,
        gym.id,
        john,
        request({ clientId: lisa.id, secondClientId: eva.id, trainerId: tomRole.id }),
      );

      expect(response.status).toBe(201);
      expect(((await response.json()) as PlannedBody).session).toMatchObject({
        capacity: 2,
        trainer: { id: tomRole.id, name: 'Tom' },
      });
    });

    it('Sarah plans a duo for herself, and a duo for Tom answers 403 with nothing stored or sent', async () => {
      const { gym, sarah, sarahRole, tomRole, lisa, eva } = await world();
      const { server, transport } = setup();

      const own = await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: lisa.id, secondClientId: eva.id, trainerId: sarahRole.id }),
      );
      const stored = (await storedSessions(gym.id)).length;
      const sentBefore = transport.sent.length;
      const forTom = await plan(
        server,
        gym.id,
        sarah,
        request({
          clientId: lisa.id,
          secondClientId: eva.id,
          trainerId: tomRole.id,
          localStart: '11:00',
        }),
      );

      expect(own.status).toBe(201);
      expect(forTom.status).toBe(403);
      expect(await forTom.json()).toEqual({ code: 'forbidden' });
      expect(await storedSessions(gym.id)).toHaveLength(stored);
      expect(transport.sent).toHaveLength(sentBefore);
    });

    it('a client of the workspace cannot plan a duo (403) and nothing is stored', async () => {
      const { gym, annaAccount, sarahRole, lisa, eva } = await world();
      const { server, transport } = setup();

      const response = await plan(
        server,
        gym.id,
        annaAccount,
        request({ clientId: lisa.id, secondClientId: eva.id, trainerId: sarahRole.id }),
      );

      expect(response.status).toBe(403);
      expect(await storedSessions(gym.id)).toEqual([]);
      expect(transport.sent).toEqual([]);
    });
  });

  describe('PS-07: a duo goes through the double-booking check of its trainer (F023, merged with F066)', () => {
    /** Sarah's one-client session with Anna on 24 September 2026, 09:00 to 10:00. */
    async function sarahIsBusy() {
      const w = await world();
      const ctx = setup();
      const busy = await plan(
        ctx.server,
        w.gym.id,
        w.sarah,
        request({ clientId: w.anna.id, notify: false }),
      );
      expect(busy.status).toBe(201);
      return { ...w, ...ctx };
    }

    it('planning a duo that overlaps the trainer’s session answers 409 trainer_conflict; nothing is stored or sent', async () => {
      const { server, transport, gym, sarah, lisa, eva } = await sarahIsBusy();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: lisa.id, secondClientId: eva.id, localStart: '09:30' }),
      );

      expect(response.status).toBe(409);
      const body = (await response.json()) as { code: string; conflicts: { type: string }[] };
      expect(body.code).toBe('trainer_conflict');
      expect(body.conflicts).toHaveLength(1);
      expect(await storedSessions(gym.id)).toHaveLength(1);
      expect(transport.sent).toEqual([]);
    });

    it('with allowConflicts the duo is planned: two participants and an EM-11 each', async () => {
      const { server, transport, gym, sarah, lisa, eva } = await sarahIsBusy();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({
          clientId: lisa.id,
          secondClientId: eva.id,
          localStart: '09:30',
          allowConflicts: true,
        }),
      );

      expect(response.status).toBe(201);
      const planned = (await response.json()) as PlannedBody;
      expect(planned.session.capacity).toBe(2);
      expect(planned.session.participants.map((p) => p.clientId)).toEqual([lisa.id, eva.id]);
      expect(transport.sent).toHaveLength(2);
    });

    it('back-to-back is no overlap: a duo right after the trainer’s session is planned', async () => {
      const { server, gym, sarah, lisa, eva } = await sarahIsBusy();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: lisa.id, secondClientId: eva.id, localStart: '10:00' }),
      );

      expect(response.status).toBe(201);
    });

    it('moving a duo onto the trainer’s session answers 409 and the duo stays; with allowConflicts it moves', async () => {
      const { server, gym, sarah, lisa, eva } = await sarahIsBusy();
      const planned = (await (
        await plan(
          server,
          gym.id,
          sarah,
          request({
            clientId: lisa.id,
            secondClientId: eva.id,
            localStart: '13:00',
            notify: false,
          }),
        )
      ).json()) as PlannedBody;
      const move = (extra: Record<string, unknown>) =>
        call(
          server,
          'POST',
          `/v1/workspaces/${gym.id}/sessions/${planned.session.id}/reschedule`,
          sarah,
          {
            localDate: '2026-09-24',
            localStart: '09:30',
            durationMinutes: 60,
            notify: false,
            version: 1,
            ...extra,
          },
        );

      const refused = await move({});
      expect(refused.status).toBe(409);
      expect(((await refused.json()) as { code: string }).code).toBe('trainer_conflict');
      const [stayed] = await admin.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, planned.session.id));
      expect(stayed?.version).toBe(1);

      const moved = await move({ allowConflicts: true });
      expect(moved.status).toBe(200);
      const after = (await moved.json()) as PlannedBody;
      expect(after.session.participants.map((p) => p.clientId)).toEqual([lisa.id, eva.id]);
    });
  });

  describe('AC4: the reads return the duo once, with both participants', () => {
    /** Sarah's duo of Lisa and Eva on Thursday 24 September, and her one-client session of Anna at 11:00. */
    async function sarahsDay() {
      const people = await world();
      const { gym, sarah, sarahRole, lisa, eva, anna } = people;
      const { server } = setup();
      const duo = (await (
        await plan(
          server,
          gym.id,
          sarah,
          request({
            clientId: lisa.id,
            secondClientId: eva.id,
            trainerId: sarahRole.id,
            notify: false,
          }),
        )
      ).json()) as PlannedBody;
      const single = (await (
        await plan(
          server,
          gym.id,
          sarah,
          request({
            clientId: anna.id,
            trainerId: sarahRole.id,
            localStart: '11:00',
            notify: false,
          }),
        )
      ).json()) as PlannedBody;
      return { ...people, server, duo, single };
    }

    it('the session read gives both participants to Sarah, John and Tom', async () => {
      const { gym, john, sarah, tom, server, duo } = await sarahsDay();

      for (const who of [sarah, john, tom]) {
        const response = await read(server, gym.id, duo.session.id, who);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(duo.session);
      }
    });

    it('My day has the duo as one item with both clients, and the summary counts it once', async () => {
      const { sarah, server, duo, single, lisa, eva } = await sarahsDay();

      const response = await call(server, 'GET', '/v1/me/day?date=2026-09-24', sarah);

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        items: PersonalItem[];
        summary: { count: number };
      };
      expect(body.summary.count).toBe(2);
      expect(body.items.map((item) => item.sessionId)).toEqual([duo.session.id, single.session.id]);
      expect(body.items[0]).toMatchObject({
        type: 'private',
        capacity: 2,
        clientName: 'Lisa Bakker & Eva Kok',
        clients: [
          { clientId: lisa.id, name: 'Lisa Bakker' },
          { clientId: eva.id, name: 'Eva Kok' },
        ],
      });
      // The one-client session reads as before.
      expect(body.items[1]).toMatchObject({
        capacity: 1,
        clientName: 'Anna de Vries',
        clients: [{ name: 'Anna de Vries' }],
      });
    });

    it('My sessions has the duo once, with both clients', async () => {
      const { sarah, server, duo } = await sarahsDay();

      const response = await call(
        server,
        'GET',
        '/v1/me/sessions?from=2026-09-24&to=2026-09-24',
        sarah,
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { items: PersonalItem[] };
      expect(body.items.filter((item) => item.sessionId === duo.session.id)).toHaveLength(1);
      expect(body.items[0]?.clients?.map((client) => client.name)).toEqual([
        'Lisa Bakker',
        'Eva Kok',
      ]);
    });

    it('a duo that lost one client reads as a one-client session', async () => {
      const { gym, sarah, server, duo, eva } = await sarahsDay();
      await admin.db
        .update(sessionParticipants)
        .set({ attendanceStatus: 'cancelled' })
        .where(eq(sessionParticipants.clientId, eva.id));

      const response = await call(server, 'GET', '/v1/me/day?date=2026-09-24', sarah);

      const body = (await response.json()) as { items: PersonalItem[] };
      expect(body.items[0]).toMatchObject({
        sessionId: duo.session.id,
        clientName: 'Lisa Bakker',
        clients: [{ name: 'Lisa Bakker' }],
      });
      expect((await read(server, gym.id, duo.session.id, sarah)).status).toBe(200);
    });
  });

  describe('AC9: who cannot reach Sarah’s duo', () => {
    it('Mike (Fit Studio) gets 404, anonymous 401, a client of the workspace is refused, and nothing leaks', async () => {
      const { gym, mike, annaAccount, sarah, sarahRole, lisa, eva } = await world();
      const { server } = setup();
      const duo = (await (
        await plan(
          server,
          gym.id,
          sarah,
          request({ clientId: lisa.id, secondClientId: eva.id, trainerId: sarahRole.id }),
        )
      ).json()) as PlannedBody;
      const body = request({ clientId: lisa.id, secondClientId: eva.id });

      const mikePlans = await plan(server, gym.id, mike, body);
      const mikeReads = await read(server, gym.id, duo.session.id, mike);
      const anonymousPlans = await plan(server, gym.id, undefined, body);
      const anonymousReads = await read(server, gym.id, duo.session.id);
      const annaReads = await read(server, gym.id, duo.session.id, annaAccount);

      expect(mikePlans.status).toBe(404);
      expect(mikeReads.status).toBe(404);
      expect(anonymousPlans.status).toBe(401);
      expect(anonymousReads.status).toBe(401);
      // As in F020: an account with a place in the workspace but no team role is refused (403).
      expect(annaReads.status).toBe(403);
      for (const answer of [mikeReads, annaReads]) {
        const text = await answer.text();
        expect(text).not.toContain('Lisa');
        expect(text).not.toContain('Eva');
      }
      expect(await storedSessions(gym.id)).toHaveLength(1);
    });
  });

  describe('AC21: the event carries no personal data', () => {
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

    it('duo_session_planned has the workspace ID and the platform only; a one-client session and a refusal record none', async () => {
      const { posthog, lines, productEvents, restore } = withEvents();
      const { gym, sarah, sarahRole, lisa, eva } = await world();
      const { server } = setup({ productEvents });

      await plan(server, gym.id, sarah, request({ clientId: lisa.id }));
      await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: lisa.id, secondClientId: lisa.id, trainerId: sarahRole.id }),
      );
      expect(posthog.events.map(({ event }) => event)).toEqual(['private_session_created']);

      const web = (await (
        await plan(
          server,
          gym.id,
          sarah,
          request({ clientId: lisa.id, secondClientId: eva.id, localStart: '10:00' }),
        )
      ).json()) as PlannedBody;
      await plan(
        server,
        gym.id,
        sarah,
        request({
          clientId: lisa.id,
          secondClientId: eva.id,
          localStart: '12:00',
          surface: 'android',
        }),
        { authorization: 'Bearer synthetic-token' },
      );

      const duoEvents = posthog.events.filter(({ event }) => event === 'duo_session_planned');
      expect(duoEvents.map(properties)).toEqual([
        { workspace_id: gym.id, platform: 'web' },
        { workspace_id: gym.id, platform: 'android' },
      ]);
      expect(duoEvents[0]?.distinct_id).toBe(sarah.id);
      const sent = JSON.stringify([posthog.events, lines]);
      for (const personal of [
        'Lisa',
        'Eva',
        'lisa@example.com',
        'eva@example.com',
        sarah.email,
        web.session.id,
        '2026-09-24',
      ]) {
        expect(sent).not.toContain(personal);
      }
      restore();
    });
  });
});
