import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  organizations,
  type SignedInAccount,
  sessionParticipants,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClient,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import {
  createMemoryTransport,
  createPrivateSessionSender,
  createSendEmail,
  EmailSendError,
} from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
  type ErrorReporter,
} from '@fivvi/observability';
import { dstTransitions, manualClock, zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';
import { privateSessionEmailKey } from '../src/sessions/email-key.ts';

// F020 (spec #425), first ticket (#442): plan a private session through the API and read it. Synthetic
// people: John (Owner of John's Gym, also trains), Sarah and Tom (Trainers), the clients Anna de Vries
// (emails in Dutch) and Mark Jansen (emails in English), Mike (Owner of Fit Studio). Workspace time
// zone Europe/Amsterdam. The API runs as the app role, so RLS applies; EM-11 goes through the capture
// transport.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

// A week before the sessions below (Thursday 24 September 2026).
const NOW = '2026-09-17T10:00:00.000Z';

interface SessionBody {
  id: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  capacity: number;
  version: number;
  location: { id: string; name: string; isDefault: boolean };
  trainer?: { id: string; name: string };
  participants: { clientId: string; name: string; attendanceStatus: string }[];
}

interface PlannedBody {
  session: SessionBody;
  past: boolean;
  repeatedStart: boolean;
  confirmationEmail: boolean;
}

describe('F020 plan a private session', () => {
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

  /** The API with a capture transport for email and a clock the test moves. */
  function setup(overrides: Partial<ApiDependencies> = {}) {
    const transport = createMemoryTransport();
    const clock = manualClock(NOW);
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
      // The same sender apps/web wires, over the capture transport.
      sendPrivateSession: createPrivateSessionSender({
        sendEmail: createSendEmail({
          transport,
          sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
          sleep: () => Promise.resolve(),
          random: () => 0,
        }),
      }),
      clock,
      ...overrides,
    };
    return { server: createApp({ ...NO_DEPENDENCIES, ...dependencies }), transport, clock };
  }

  /**
   * John's Gym (Dutch, a named location) with John (Owner who trains), Sarah and Tom (Trainers), Anna
   * (emails in Dutch), Mark (emails in English) and Anna's account as a client; Fit Studio with Mike.
   */
  async function world(options: { defaultLocale?: 'nl-NL' | 'en' } = {}) {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    if (options.defaultLocale) {
      await admin.db
        .update(organizations)
        .set({ defaultLocale: options.defaultLocale })
        .where(eq(organizations.id, gym.id));
    }
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
    const anna = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Anna de Vries',
      email: 'anna@example.com',
      emailLocale: 'nl-NL',
      accountId: annaAccount.id,
    });
    const mark = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Mark Jansen',
      email: 'mark@example.com',
      emailLocale: 'en',
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
      anna,
      mark,
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

  it('AC1: Sarah plans Anna on Thursday 24 September 2026 at 09:00 for 60 minutes: stored 07:00 to 08:00 UTC with the default location and Anna as the only participant; EM-11 goes out in Dutch', async () => {
    const { gym, sarah, sarahRole, anna } = await world();
    const { server, transport } = setup();

    const response = await plan(
      server,
      gym.id,
      sarah,
      request({ clientId: anna.id, trainerId: sarahRole.id }),
    );

    expect(response.status).toBe(201);
    const planned = (await response.json()) as PlannedBody;
    expect(planned).toEqual({
      session: {
        id: expect.any(String),
        type: 'private',
        status: 'scheduled',
        startsAt: '2026-09-24T07:00:00.000Z',
        endsAt: '2026-09-24T08:00:00.000Z',
        timeZone: 'Europe/Amsterdam',
        capacity: 1,
        version: 1,
        location: expect.objectContaining({ name: gym.marker, isDefault: true }),
        trainer: { id: sarahRole.id, name: 'Sarah' },
        participants: [{ clientId: anna.id, name: 'Anna de Vries', attendanceStatus: 'booked' }],
      },
      past: false,
      repeatedStart: false,
      confirmationEmail: true,
    });
    // What is stored: UTC instants, the type and status, Sarah's trainer profile, the planner, one place.
    const [row] = await storedSessions(gym.id);
    const [sarahProfile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, sarahRole.id));
    expect(row).toMatchObject({
      id: planned.session.id,
      type: 'private',
      status: 'scheduled',
      startsAt: new Date('2026-09-24T07:00:00.000Z'),
      endsAt: new Date('2026-09-24T08:00:00.000Z'),
      capacity: 1,
      version: 1,
      seriesId: null,
      trainerProfileId: sarahProfile?.id,
      createdByTeamMemberId: sarahRole.id,
      locationId: planned.session.location.id,
    });
    const places = await admin.db
      .select()
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, planned.session.id));
    expect(places).toEqual([
      expect.objectContaining({
        clientId: anna.id,
        attendanceStatus: 'booked',
        agreementId: null,
      }),
    ]);
    // EM-11 went to Anna, in Dutch, with the date, the time, the location and the trainer.
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: { email: 'anna@example.com', name: 'Anna de Vries' },
      locale: 'nl-NL',
      template: 'private-session',
      subject: 'Nieuwe afspraak: donderdag 24 september om 09:00',
    });
    expect(transport.sent[0]?.text).toContain(
      'Wanneer: donderdag 24 september 2026, 09:00 tot 10:00',
    );
    expect(transport.sent[0]?.text).toContain(`Waar: ${gym.marker}`);
    expect(transport.sent[0]?.text).toContain('Trainer: Sarah');
    expect(transport.sent[0]?.idempotencyKey).toBe(privateSessionEmailKey(planned.session.id, 1));
  });

  it('AC1: the session can be read back by Sarah, John and Tom with the same values', async () => {
    const { gym, john, sarah, tom, sarahRole, anna } = await world();
    const { server } = setup();
    const planned = (await (
      await plan(server, gym.id, sarah, request({ clientId: anna.id, trainerId: sarahRole.id }))
    ).json()) as PlannedBody;

    for (const who of [sarah, john, tom]) {
      const response = await read(server, gym.id, planned.session.id, who);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(planned.session);
    }
  });

  describe('AC2: who may plan for whom', () => {
    it('John (Owner) plans for Tom and for himself', async () => {
      const { gym, john, johnRole, tomRole, anna } = await world();
      const { server } = setup();

      const forTom = await plan(
        server,
        gym.id,
        john,
        request({ clientId: anna.id, trainerId: tomRole.id }),
      );
      const forJohn = await plan(
        server,
        gym.id,
        john,
        request({ clientId: anna.id, trainerId: johnRole.id, localStart: '11:00' }),
      );

      expect(forTom.status).toBe(201);
      expect(((await forTom.json()) as PlannedBody).session.trainer).toEqual({
        id: tomRole.id,
        name: 'Tom',
      });
      expect(forJohn.status).toBe(201);
      expect(((await forJohn.json()) as PlannedBody).session.trainer).toEqual({
        id: johnRole.id,
        name: 'John',
      });
      // The Owner is recorded as the one who planned both.
      expect((await storedSessions(gym.id)).map((row) => row.createdByTeamMemberId)).toEqual([
        johnRole.id,
        johnRole.id,
      ]);
    });

    it('Sarah (Trainer) planning for Tom gets 403 and nothing is stored or sent', async () => {
      const { gym, sarah, tomRole, anna } = await world();
      const { server, transport } = setup();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: anna.id, trainerId: tomRole.id }),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: 'forbidden' });
      expect(await storedSessions(gym.id)).toEqual([]);
      expect(transport.sent).toEqual([]);
    });

    it('without a trainer the session is the caller’s own: a Trainer’s, and an Owner’s who trains', async () => {
      const { gym, john, tom, tomRole, johnRole, mark } = await world();
      const { server } = setup();

      const byTom = await plan(server, gym.id, tom, request({ clientId: mark.id }));
      const byJohn = await plan(server, gym.id, john, request({ clientId: mark.id }));

      expect(((await byTom.json()) as PlannedBody).session.trainer?.id).toBe(tomRole.id);
      expect(((await byJohn.json()) as PlannedBody).session.trainer?.id).toBe(johnRole.id);
    });

    it('without a trainer, an Owner who does not train is refused on the trainer', async () => {
      const { gym, anna } = await world();
      const { server } = setup();
      const owner2 = await createAccount(admin.db, { label: 'owner2' });
      await addTeamRole(admin.db, {
        workspaceId: gym.id,
        accountId: owner2.id,
        role: 'owner',
        trainsHere: false,
      });

      const response = await plan(server, gym.id, owner2, request({ clientId: anna.id }));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
    });

    it('Tom (Trainer) plans for himself', async () => {
      const { gym, tom, tomRole, mark } = await world();
      const { server } = setup();

      const response = await plan(
        server,
        gym.id,
        tom,
        request({ clientId: mark.id, trainerId: tomRole.id }),
      );

      expect(response.status).toBe(201);
    });

    it('the Owner can not plan for a team member who does not train, or for someone who is not on the team (404)', async () => {
      const { gym, john, anna, mike } = await world();
      const { server } = setup();
      // An Owner without a trainer profile is not a trainer.
      const owner2 = await createAccount(admin.db, { label: 'owner2' });
      const notTraining = await addTeamRole(admin.db, {
        workspaceId: gym.id,
        accountId: owner2.id,
        role: 'owner',
        trainsHere: false,
      });
      for (const trainerId of [
        notTraining.id,
        crypto.randomUUID(),
        mike.id /* an account ID, not a team member */,
      ]) {
        const response = await plan(
          server,
          gym.id,
          john,
          request({ clientId: anna.id, trainerId }),
        );
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: 'not_found' });
      }
      expect(await storedSessions(gym.id)).toEqual([]);
    });
  });

  describe('AC3: EM-11 follows the client’s email language', () => {
    it('Mark (English) gets it in English; Anna (Dutch) in Dutch', async () => {
      const { gym, sarah, sarahRole, anna, mark } = await world({ defaultLocale: 'nl-NL' });
      const { server, transport } = setup();

      await plan(server, gym.id, sarah, request({ clientId: mark.id, trainerId: sarahRole.id }));
      await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: anna.id, trainerId: sarahRole.id, localStart: '11:00' }),
      );

      expect(transport.sent.map(({ locale, to }) => [to.email, locale])).toEqual([
        ['mark@example.com', 'en'],
        ['anna@example.com', 'nl-NL'],
      ]);
      expect(transport.sent[0]?.subject).toBe('New appointment: Thursday 24 September at 09:00');
      expect(transport.sent[0]?.text).toContain(
        'When: Thursday, 24 September 2026, 09:00 to 10:00',
      );
    });

    it('a client with no language of their own follows the workspace default', async () => {
      const { gym, sarah, sarahRole } = await world({ defaultLocale: 'en' });
      const { server, transport } = setup();
      const lisa = await addClient(admin.db, {
        workspaceId: gym.id,
        name: 'Lisa',
        email: 'lisa@example.com',
      });

      await plan(server, gym.id, sarah, request({ clientId: lisa.id, trainerId: sarahRole.id }));

      expect(transport.sent[0]).toMatchObject({ locale: 'en', to: { email: 'lisa@example.com' } });
    });

    it('notify off stores the session and sends nothing', async () => {
      const { gym, sarah, sarahRole, mark } = await world();
      const { server, transport } = setup();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: mark.id, trainerId: sarahRole.id, notify: false }),
      );

      expect(response.status).toBe(201);
      expect(((await response.json()) as PlannedBody).confirmationEmail).toBe(false);
      expect(await storedSessions(gym.id)).toHaveLength(1);
      expect(transport.sent).toEqual([]);
    });
  });

  describe('AC4: daylight saving time', () => {
    it('28 March 2027 at 02:30 does not exist: 400 on the start, nothing stored or sent', async () => {
      const { gym, sarah, sarahRole, anna } = await world();
      const { server, transport, clock } = setup();
      clock.set('2027-03-01T10:00:00Z');
      expect(dstTransitions(2027).springForward.date).toBe('2027-03-28');

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({
          clientId: anna.id,
          trainerId: sarahRole.id,
          localDate: '2027-03-28',
          localStart: '02:30',
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'localStart', code: 'time_does_not_exist' }],
      });
      expect(await storedSessions(gym.id)).toEqual([]);
      expect(transport.sent).toEqual([]);
    });

    it('25 October 2026 at 02:30 happens twice: the session starts at 00:30 UTC, the first, and the answer says so', async () => {
      const { gym, sarah, sarahRole, anna } = await world();
      const { server } = setup();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({
          clientId: anna.id,
          trainerId: sarahRole.id,
          localDate: '2026-10-25',
          localStart: '02:30',
        }),
      );

      const planned = (await response.json()) as PlannedBody;
      expect(response.status).toBe(201);
      expect(planned.session.startsAt).toBe('2026-10-25T00:30:00.000Z');
      expect(planned.session.endsAt).toBe('2026-10-25T01:30:00.000Z');
      expect(planned.repeatedStart).toBe(true);
    });

    it('23:30 for 90 minutes ends at 01:00 the next day', async () => {
      const { gym, sarah, sarahRole, anna } = await world();
      const { server } = setup();

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({
          clientId: anna.id,
          trainerId: sarahRole.id,
          localStart: '23:30',
          durationMinutes: 90,
        }),
      );

      const planned = (await response.json()) as PlannedBody;
      expect(planned.session.startsAt).toBe(zonedTime('2026-09-24T23:30').toISOString());
      expect(planned.session.endsAt).toBe(zonedTime('2026-09-25T01:00').toISOString());
    });

    it('the workspace’s own time zone decides, not Amsterdam', async () => {
      const { gym, sarah, sarahRole, anna } = await world();
      await admin.db
        .update(organizations)
        .set({ timeZone: 'Atlantic/Reykjavik' })
        .where(eq(organizations.id, gym.id));
      const { server } = setup();

      const planned = (await (
        await plan(server, gym.id, sarah, request({ clientId: anna.id, trainerId: sarahRole.id }))
      ).json()) as PlannedBody;

      expect(planned.session.startsAt).toBe('2026-09-24T09:00:00.000Z');
      expect(planned.session.timeZone).toBe('Atlantic/Reykjavik');
    });
  });

  it('AC5: a session in the past saves, says so, and never emails even when asked', async () => {
    const { gym, sarah, sarahRole, anna } = await world();
    const { server, transport } = setup();

    const response = await plan(
      server,
      gym.id,
      sarah,
      request({
        clientId: anna.id,
        trainerId: sarahRole.id,
        localDate: '2026-09-16',
        notify: true,
      }),
    );

    expect(response.status).toBe(201);
    const planned = (await response.json()) as PlannedBody;
    expect(planned).toMatchObject({ past: true, confirmationEmail: false });
    expect(planned.session.startsAt).toBe('2026-09-16T07:00:00.000Z');
    expect(await storedSessions(gym.id)).toHaveLength(1);
    expect(transport.sent).toEqual([]);
  });

  describe('input the contract refuses', () => {
    it.each([
      ['a duration of 10 minutes', { durationMinutes: 10 }, 'durationMinutes'],
      ['a duration of 250 minutes', { durationMinutes: 250 }, 'durationMinutes'],
      ['a duration that is not a multiple of 5', { durationMinutes: 62 }, 'durationMinutes'],
      ['a date that is none', { localDate: '2026-02-30' }, 'localDate'],
      ['a date in the wrong shape', { localDate: '24-09-2026' }, 'localDate'],
      ['a start in the wrong shape', { localStart: '9:00' }, 'localStart'],
      ['a start of 24:00', { localStart: '24:00' }, 'localStart'],
      ['a client that is none', { clientId: 'not-an-id' }, 'clientId'],
      ['no notify', { notify: undefined }, 'notify'],
    ])('answers 400 for %s and stores nothing', async (_name, change, path) => {
      const { gym, sarah, sarahRole, anna } = await world();
      const { server, transport } = setup();

      const response = await plan(server, gym.id, sarah, {
        ...request({ clientId: anna.id, trainerId: sarahRole.id }),
        ...change,
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string; issues: { path: string }[] };
      expect(body.code).toBe('validation_failed');
      expect(body.issues.map((issue) => issue.path)).toContain(path);
      expect(await storedSessions(gym.id)).toEqual([]);
      expect(transport.sent).toEqual([]);
    });

    it('answers 404 for a client of another workspace and for one that does not exist', async () => {
      const { gym, sarah, sarahRole, otherClient } = await world();
      const { server, transport } = setup();

      for (const clientId of [otherClient.id, crypto.randomUUID()]) {
        const response = await plan(
          server,
          gym.id,
          sarah,
          request({ clientId, trainerId: sarahRole.id }),
        );
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: 'not_found' });
      }
      expect(await storedSessions(gym.id)).toEqual([]);
      expect(transport.sent).toEqual([]);
    });
  });

  describe('EM-11 goes out after the commit', () => {
    it('the session is committed when the email is sent', async () => {
      const { gym, sarah, sarahRole, anna } = await world();
      const seen: number[] = [];
      const transport = createMemoryTransport();
      const send = transport.send.bind(transport);
      transport.send = async (email) => {
        // Read through the privileged connection: only a committed row is visible to it.
        seen.push((await storedSessions(gym.id)).length);
        return send(email);
      };
      const { server } = setup({
        sendPrivateSession: createPrivateSessionSender({
          sendEmail: createSendEmail({
            transport,
            sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
          }),
        }),
      });

      await plan(server, gym.id, sarah, request({ clientId: anna.id, trainerId: sarahRole.id }));

      expect(seen).toEqual([1]);
    });

    it('a failing send does not fail the request or undo the session, and is reported without the client’s address', async () => {
      const { gym, sarah, sarahRole, anna } = await world();
      const errors: unknown[] = [];
      const errorReporter: ErrorReporter = {
        ...createErrorReporter({ env: {} }),
        captureError: (error) => {
          errors.push(error);
        },
      };
      const lines: string[] = [];
      const logs = (['error', 'log', 'warn', 'info'] as const).map((level) =>
        vi
          .spyOn(console, level)
          .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
      );
      const transport = createMemoryTransport();
      transport.failNext(new EmailSendError('provider down', { retryable: false }));
      const { server } = setup({
        errorReporter,
        sendPrivateSession: createPrivateSessionSender({
          sendEmail: createSendEmail({
            transport,
            sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
          }),
        }),
      });

      const response = await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: anna.id, trainerId: sarahRole.id }),
      );

      expect(response.status).toBe(201);
      expect(await storedSessions(gym.id)).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(EmailSendError);
      expect(lines.join('\n')).not.toContain('anna@example.com');
      for (const log of logs) log.mockRestore();
    });

    it('a refused request sends nothing', async () => {
      const { gym, sarah, tomRole, anna } = await world();
      const { server, transport } = setup();

      await plan(server, gym.id, sarah, request({ clientId: anna.id, trainerId: tomRole.id }));
      await plan(server, gym.id, sarah, {});

      expect(transport.sent).toEqual([]);
    });

    it('the idempotency key follows the session and its version', async () => {
      const { gym, sarah, sarahRole, anna } = await world();
      const { server, transport } = setup();

      await plan(server, gym.id, sarah, request({ clientId: anna.id, trainerId: sarahRole.id }));
      await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: anna.id, trainerId: sarahRole.id, localStart: '11:00' }),
      );

      const [first, second] = (await storedSessions(gym.id)).map((row) => row.id);
      expect(transport.sent.map((email) => email.idempotencyKey)).toEqual([
        privateSessionEmailKey(first ?? '', 1),
        privateSessionEmailKey(second ?? '', 1),
      ]);
      expect(privateSessionEmailKey(first ?? '', 1)).not.toBe(
        privateSessionEmailKey(first ?? '', 2),
      );
      expect(privateSessionEmailKey(first ?? '', 1)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('AC11: who can reach the routes', () => {
    it('Mike (Owner of another workspace) gets 404 on both routes and nothing is stored', async () => {
      const { gym, mike, sarahRole, anna, sarah } = await world();
      const { server } = setup();
      const session = await addSession(admin.db, { workspaceId: gym.id, clientId: anna.id });

      const created = await plan(
        server,
        gym.id,
        mike,
        request({ clientId: anna.id, trainerId: sarahRole.id }),
      );
      const readOne = await read(server, gym.id, session.id, mike);

      expect(created.status).toBe(404);
      expect(readOne.status).toBe(404);
      expect(await readOne.json()).toEqual({ code: 'not_found' });
      expect(await storedSessions(gym.id)).toHaveLength(1);
      expect((await read(server, gym.id, session.id, sarah)).status).toBe(200);
    });

    it('a session of another workspace is 404 for a team member, also by its ID in their own workspace path', async () => {
      const { gym, other, sarah, otherClient } = await world();
      const { server } = setup();
      const theirs = await addSession(admin.db, {
        workspaceId: other.id,
        clientId: otherClient.id,
      });

      const response = await read(server, gym.id, theirs.id, sarah);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'not_found' });
      expect((await read(server, gym.id, crypto.randomUUID(), sarah)).status).toBe(404);
    });

    it('an anonymous call gets 401', async () => {
      const { gym, sarahRole, anna } = await world();
      const { server } = setup();
      const session = await addSession(admin.db, { workspaceId: gym.id, clientId: anna.id });

      const created = await plan(
        server,
        gym.id,
        undefined,
        request({ clientId: anna.id, trainerId: sarahRole.id }),
      );
      const readOne = await read(server, gym.id, session.id);

      expect(created.status).toBe(401);
      expect(readOne.status).toBe(401);
      expect(await readOne.json()).toEqual({ code: 'not_signed_in' });
    });

    it('a client account of the workspace is refused on the team routes (403: it has a place, not this access) and nothing is stored', async () => {
      const { gym, annaAccount, sarahRole, anna } = await world();
      const { server } = setup();
      const session = await addSession(admin.db, { workspaceId: gym.id, clientId: anna.id });

      const created = await plan(
        server,
        gym.id,
        annaAccount,
        request({ clientId: anna.id, trainerId: sarahRole.id }),
      );
      const readOne = await read(server, gym.id, session.id, annaAccount);

      expect(created.status).toBe(403);
      expect(readOne.status).toBe(403);
      expect(await storedSessions(gym.id)).toHaveLength(1);
    });
  });

  it('reads a session whose trainer is gone, without a trainer', async () => {
    const { gym, john, sarahRole, anna } = await world();
    const { server } = setup();
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, sarahRole.id));
    const session = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: anna.id,
      trainerProfileId: profile?.id ?? null,
    });
    await admin.db.delete(trainerProfiles).where(eq(trainerProfiles.id, profile?.id ?? ''));

    const response = await read(server, gym.id, session.id, john);

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('trainer');
  });

  describe('AC14: the event carries no personal data', () => {
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

    it('private_session_created has the workspace ID and the surface only; a refusal or an invalid body records nothing', async () => {
      const { posthog, lines, productEvents, restore } = withEvents();
      const { gym, sarah, sarahRole, tomRole, anna } = await world();
      const { server } = setup({ productEvents });

      // A refusal, an invalid body, a DST error and an unknown client record nothing.
      await plan(server, gym.id, sarah, request({ clientId: anna.id, trainerId: tomRole.id }));
      await plan(server, gym.id, sarah, {});
      await plan(
        server,
        gym.id,
        sarah,
        request({
          clientId: anna.id,
          trainerId: sarahRole.id,
          localDate: '2027-03-28',
          localStart: '02:30',
        }),
      );
      await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: crypto.randomUUID(), trainerId: sarahRole.id }),
      );
      expect(posthog.events).toEqual([]);

      // The web sends no bearer token; the app names its surface. A bearer token without one records nothing.
      const web = (await (
        await plan(server, gym.id, sarah, request({ clientId: anna.id, trainerId: sarahRole.id }))
      ).json()) as PlannedBody;
      await plan(
        server,
        gym.id,
        sarah,
        request({
          clientId: anna.id,
          trainerId: sarahRole.id,
          localStart: '10:00',
          surface: 'ios',
        }),
        { authorization: 'Bearer synthetic-token' },
      );
      await plan(
        server,
        gym.id,
        sarah,
        request({ clientId: anna.id, trainerId: sarahRole.id, localStart: '11:00' }),
        { authorization: 'Bearer synthetic-token' },
      );

      expect(posthog.events.map(({ event }) => event)).toEqual([
        'private_session_created',
        'private_session_created',
      ]);
      expect(posthog.events.map(properties)).toEqual([
        { workspace_id: gym.id, surface: 'web' },
        { workspace_id: gym.id, surface: 'ios' },
      ]);
      expect(posthog.events[0]?.distinct_id).toBe(sarah.id);
      const sent = JSON.stringify([posthog.events, lines]);
      for (const personal of [
        'Anna de Vries',
        'anna@example.com',
        sarah.email,
        web.session.id,
        '2026-09-24',
        '07:00',
      ]) {
        expect(sent).not.toContain(personal);
      }
      restore();
    });
  });

  it('AC13: the routes are in the committed contract with x-access for the team', () => {
    const create = contract.paths['/v1/workspaces/{workspaceId}/sessions/private'].post;
    const readOne = contract.paths['/v1/workspaces/{workspaceId}/sessions/{sessionId}'].get;

    expect(create.operationId).toBe('createPrivateSession');
    expect(readOne.operationId).toBe('getSession');
    expect(create['x-access']).toEqual({
      type: 'workspace',
      capability: 'session.private.manage.own',
      roles: ['owner', 'trainer'],
      client: 'none',
    });
    expect(readOne['x-access']).toEqual({
      type: 'workspace',
      capability: 'clients.view',
      roles: ['owner', 'trainer'],
      client: 'none',
    });
    expect(Object.keys(create.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '403', '404']),
    );
    expect(Object.keys(readOne.responses)).toEqual(
      expect.arrayContaining(['200', '401', '403', '404']),
    );
    // The response carries instants and the zone, never the client's email address.
    expect(Object.keys(contract.components.schemas.Session.properties)).toEqual(
      expect.arrayContaining(['startsAt', 'endsAt', 'timeZone']),
    );
    // Nothing in a session or its participants is a contact detail of a client.
    expect(Object.keys(contract.components.schemas.SessionParticipant.properties)).toEqual([
      'clientId',
      'name',
      'attendanceStatus',
    ]);
    expect(Object.keys(contract.components.schemas.Session.properties).join()).not.toMatch(/mail/i);
  });
});
