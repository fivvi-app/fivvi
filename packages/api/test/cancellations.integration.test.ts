import { readFileSync } from 'node:fs';
import {
  authUsers,
  classSeries,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  organizations,
  type SignedInAccount,
  sessionParticipantStatusChanges,
  sessionParticipants,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import {
  addBookingLink,
  addClassSeries,
  addClient,
  addGroupClass,
  addParticipants,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import {
  createClassCancelledSender,
  createMemoryTransport,
  createPrivateSessionSender,
  createSendEmail,
  emailIdempotencyKey,
} from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
  whatFivviSent,
} from '@fivvi/observability';
import { manualClock, zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';
import { privateSessionEmailEvent } from '../src/sessions/email-event.ts';

// F026 (spec #462), ticket #557: cancel a private session through the API. Synthetic people: John
// (Owner of John's Gym, also trains), Sarah and Tom (Trainers), the clients Anna de Vries (emails in
// Dutch) and Mark Jansen (emails in English), Mike (Owner of Fit Studio). Workspace time zone
// Europe/Amsterdam. The API runs as the app role, so RLS applies; the email goes through the capture
// transport. "Now" is Tuesday 22 September 2026, 13:30 in Amsterdam; Sarah's session with Anna is on
// Thursday 24 September 2026, 09:00 to 10:00.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const NOW = '2026-09-22T11:30:00.000Z';
const START = new Date('2026-09-24T07:00:00.000Z');

interface SessionBody {
  id: string;
  status: string;
  version: number;
  startsAt: string;
  participants: { clientId: string; name: string; attendanceStatus: string }[];
  cancellation?: {
    cancelledAt: string;
    cancelledBy?: { id: string; name: string };
    initiator: string;
    message?: string;
  };
}

interface CancelledBody {
  session: SessionBody;
  clientsNotified: number;
}

interface RefusalBody {
  code: string;
  session?: SessionBody;
  changedBy?: { name: string };
}

describe('F026 cancellations: a private session, a class date and the rest of a series', () => {
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
  function setup(
    overrides: Partial<ApiDependencies> = {},
    /** Called when an email is sent, before it reaches the transport. */
    beforeSend?: (mail: Parameters<ApiDependencies['sendPrivateSession']>[0]) => Promise<void>,
    /** The same for the class variant of EM-05. */
    beforeSendClass?: (mail: Parameters<ApiDependencies['sendClassCancelled']>[0]) => Promise<void>,
  ) {
    const transport = createMemoryTransport();
    const clock = manualClock(NOW);
    const sendEmail = createSendEmail({
      transport,
      sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
      replyTo: { email: 'support@example.com' },
      sleep: () => Promise.resolve(),
      random: () => 0,
    });
    const sender = createPrivateSessionSender({ sendEmail });
    const classSender = createClassCancelledSender({ sendEmail });
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
      sendPrivateSession: async (mail) => {
        await beforeSend?.(mail);
        await sender(mail);
      },
      sendClassCancelled: async (mail) => {
        await beforeSendClass?.(mail);
        await classSender(mail);
      },
      clock,
      ...overrides,
    };
    return {
      server: createApp({ ...NO_DEPENDENCIES, ...dependencies }),
      transport,
      clock,
      classSender,
    };
  }

  /**
   * John's Gym (Dutch) with John (Owner who trains), Sarah and Tom (Trainers), Anna (emails in
   * Dutch, with an account of her own), Mark (emails in English) and a client without a language;
   * Fit Studio with Mike.
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
    const sophie = await addClient(admin.db, {
      workspaceId: gym.id,
      name: 'Sophie Bakker',
      email: 'sophie@example.com',
    });
    const profileOf = async (teamMemberId: string) => {
      const [profile] = await admin.db
        .select({ id: trainerProfiles.id })
        .from(trainerProfiles)
        .where(eq(trainerProfiles.teamMemberId, teamMemberId));
      return profile?.id ?? null;
    };
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
      sophie,
      sarahProfile: await profileOf(sarahRole.id),
      tomProfile: await profileOf(tomRole.id),
    };
  }
  type World = Awaited<ReturnType<typeof world>>;

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

  const cancel = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    sessionId: string,
    who: { id: string } | undefined,
    body: unknown,
    headers?: Record<string, string>,
  ) =>
    call(
      server,
      'POST',
      `/v1/workspaces/${workspaceId}/sessions/${sessionId}/cancel`,
      who,
      body,
      headers,
    );

  /** Sarah's session with Anna on Thursday 24 September 09:00, version 1. */
  const sarahsSession = (w: World, options: { clientId?: string; secondClientId?: string } = {}) =>
    addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: options.clientId ?? w.anna.id,
      ...(options.secondClientId ? { secondClientId: options.secondClientId } : {}),
      trainerProfileId: w.sarahProfile,
      createdByTeamMemberId: w.sarahRole.id,
      startsAt: START,
    });

  /** Tom's session with Mark at the same time. */
  const tomsSession = (w: World) =>
    addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: w.tomProfile,
      createdByTeamMemberId: w.tomRole.id,
      startsAt: START,
    });

  const body = (overrides: Record<string, unknown> = {}) => ({
    initiator: 'client',
    notify: false,
    version: 1,
    ...overrides,
  });

  const rowOf = async (sessionId: string) => {
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!row) throw new Error('no session');
    return row;
  };

  const historyOf = async (sessionId: string) => {
    const places = await admin.db
      .select({ id: sessionParticipants.id, clientId: sessionParticipants.clientId })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, sessionId));
    const lines = await admin.db
      .select()
      .from(sessionParticipantStatusChanges)
      .orderBy(
        asc(sessionParticipantStatusChanges.changedAt),
        asc(sessionParticipantStatusChanges.createdAt),
      );
    return lines.filter((line) => places.some((place) => place.id === line.sessionParticipantId));
  };

  it('AC1: Sarah cancels Anna’s session for the client: the session stores the time, Sarah and client, one history row for Anna, no email', async () => {
    const w = await world();
    const { server, transport } = setup();
    const session = await sarahsSession(w);

    const response = await cancel(server, w.gym.id, session.id, w.sarah, body());

    expect(response.status).toBe(200);
    const answer = (await response.json()) as CancelledBody;
    expect(answer.clientsNotified).toBe(0);
    expect(answer.session).toMatchObject({
      id: session.id,
      status: 'cancelled',
      version: 2,
      cancellation: {
        cancelledAt: NOW,
        cancelledBy: { id: w.sarahRole.id, name: 'Sarah' },
        initiator: 'client',
      },
      participants: [{ clientId: w.anna.id, attendanceStatus: 'cancelled' }],
    });
    const row = await rowOf(session.id);
    expect(row).toMatchObject({
      status: 'cancelled',
      version: 2,
      cancelledAt: new Date(NOW),
      cancelledByTeamMemberId: w.sarahRole.id,
      cancellationInitiator: 'client',
      cancellationMessage: null,
      updatedByTeamMemberId: w.sarahRole.id,
    });
    const history = await historyOf(session.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      clientId: w.anna.id,
      fromStatus: 'booked',
      toStatus: 'cancelled',
      changedAt: new Date(NOW),
      actorType: 'team_member',
      actorTeamMemberId: w.sarahRole.id,
      initiatedBy: 'client',
      source: 'web',
    });
    expect(transport.sent).toEqual([]);
    // The session still exists, and reading it shows the same.
    const read = await call(
      server,
      'GET',
      `/v1/workspaces/${w.gym.id}/sessions/${session.id}`,
      w.sarah,
    );
    expect(((await read.json()) as SessionBody).status).toBe('cancelled');
  });

  it('AC2: John cancels Tom’s session for the workspace: the English email goes to Mark, only when asked', async () => {
    const w = await world();
    const { server, transport } = setup();
    const session = await tomsSession(w);

    const response = await cancel(
      server,
      w.gym.id,
      session.id,
      w.john,
      body({ initiator: 'workspace', notify: true }),
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as CancelledBody).clientsNotified).toBe(1);
    expect(await rowOf(session.id)).toMatchObject({
      cancellationInitiator: 'workspace',
      cancelledByTeamMemberId: w.johnRole.id,
    });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: { email: 'mark@example.com' },
      locale: 'en',
      subject: 'Your session on Thursday 24 September at 09:00 has been cancelled',
      template: 'cancellation',
    });
    expect(transport.sent[0]?.text).toContain('Trainer: Tom');
    expect((await historyOf(session.id))[0]).toMatchObject({ initiatedBy: 'workspace' });

    // Unchecked: the same cancellation sends nothing.
    const quiet = await tomsSession(w);
    const silent = await cancel(
      server,
      w.gym.id,
      quiet.id,
      w.john,
      body({ initiator: 'workspace', notify: false }),
    );
    expect(silent.status).toBe(200);
    expect(((await silent.json()) as CancelledBody).clientsNotified).toBe(0);
    expect(transport.sent).toHaveLength(1);
  });

  it('AC2: Anna gets the Dutch email, a client without a language the workspace’s default', async () => {
    const w = await world({ defaultLocale: 'en' });
    const { server, transport } = setup();
    const forAnna = await sarahsSession(w);
    const forSophie = await sarahsSession(w, { clientId: w.sophie.id });

    await cancel(
      server,
      w.gym.id,
      forAnna.id,
      w.john,
      body({ initiator: 'workspace', notify: true }),
    );
    await cancel(
      server,
      w.gym.id,
      forSophie.id,
      w.john,
      body({ initiator: 'workspace', notify: true }),
    );

    expect(transport.sent.map((email) => [email.to.email, email.locale])).toEqual([
      ['anna@example.com', 'nl-NL'],
      ['sophie@example.com', 'en'],
    ]);
    expect(transport.sent[0]?.subject).toBe(
      'Je sessie op donderdag 24 september om 09:00 is geannuleerd',
    );
  });

  it('AC5: Tom cancels his own session, gets 403 on Sarah’s; John cancels any', async () => {
    const w = await world();
    const { server } = setup();
    const toms = await tomsSession(w);
    const sarahs = await sarahsSession(w);

    const forbidden = await cancel(server, w.gym.id, sarahs.id, w.tom, body());
    const own = await cancel(server, w.gym.id, toms.id, w.tom, body());
    const any = await cancel(server, w.gym.id, sarahs.id, w.john, body({ initiator: 'workspace' }));

    expect(forbidden.status).toBe(403);
    expect(own.status).toBe(200);
    expect(any.status).toBe(200);
    expect(await rowOf(toms.id)).toMatchObject({ cancelledByTeamMemberId: w.tomRole.id });
    expect(await rowOf(sarahs.id)).toMatchObject({ cancelledByTeamMemberId: w.johnRole.id });
  });

  it('AC5: a refused Trainer stores nothing and learns nothing of a cancelled session', async () => {
    const w = await world();
    const { server } = setup();
    const sarahs = await sarahsSession(w);
    await cancel(server, w.gym.id, sarahs.id, w.sarah, body());

    const forbidden = await cancel(server, w.gym.id, sarahs.id, w.tom, body());

    expect(forbidden.status).toBe(403);
    expect(await rowOf(sarahs.id)).toMatchObject({
      cancelledByTeamMemberId: w.sarahRole.id,
      version: 2,
    });
  });

  it('AC9: a session that has started is recorded as cancelled and nobody is emailed, whatever notify says', async () => {
    const w = await world();
    const { server, transport, clock } = setup();
    const session = await sarahsSession(w);
    clock.set('2026-09-24T07:30:00.000Z');

    const response = await cancel(
      server,
      w.gym.id,
      session.id,
      w.john,
      body({ initiator: 'workspace', notify: true }),
    );

    expect(response.status).toBe(200);
    const answer = (await response.json()) as CancelledBody;
    expect(answer.clientsNotified).toBe(0);
    expect(answer.session.status).toBe('cancelled');
    expect(answer.session.cancellation?.cancelledAt).toBe('2026-09-24T07:30:00.000Z');
    expect(transport.sent).toEqual([]);
  });

  it('AC10: a second cancel and every other write answer 409 session_cancelled, and nothing changes', async () => {
    const w = await world();
    const { server, transport } = setup();
    const session = await sarahsSession(w);
    expect((await cancel(server, w.gym.id, session.id, w.sarah, body({ version: 1 }))).status).toBe(
      200,
    );
    const before = await rowOf(session.id);
    const path = `/v1/workspaces/${w.gym.id}/sessions/${session.id}`;
    const attempts: [string, Response | Promise<Response>][] = [
      // The same version as the first cancel: the state is told before the version.
      ['a second cancel', cancel(server, w.gym.id, session.id, w.sarah, body({ version: 1 }))],
      [
        'a second cancel, current version',
        cancel(server, w.gym.id, session.id, w.john, body({ version: 2 })),
      ],
      [
        'a reschedule',
        call(server, 'POST', `${path}/reschedule`, w.sarah, {
          localDate: '2026-09-25',
          localStart: '10:00',
          durationMinutes: 60,
          notify: false,
          version: 1,
        }),
      ],
      [
        'a trainer change',
        call(server, 'POST', `${path}/trainer`, w.john, {
          trainerId: w.tomRole.id,
          version: 1,
        }),
      ],
      [
        'attendance',
        call(server, 'PUT', `${path}/participants/${w.anna.id}/attendance`, w.sarah, {
          status: 'attended',
          clientRequestId: crypto.randomUUID(),
        }),
      ],
    ];
    for (const [name, pending] of attempts) {
      const response = await pending;
      expect(response.status, name).toBe(409);
      expect(((await response.json()) as RefusalBody).code, name).toBe('session_cancelled');
    }
    expect(await rowOf(session.id)).toEqual(before);
    expect(transport.sent).toEqual([]);
  });

  it('AC10: a cancelled class date refuses a date edit with 409 session_cancelled', async () => {
    const w = await world();
    const { server } = setup();
    const date = await addSession(admin.db, {
      workspaceId: w.gym.id,
      type: 'group',
      status: 'cancelled',
      participant: false,
      trainerProfileId: w.sarahProfile,
      startsAt: START,
    });

    const response = await call(
      server,
      'PATCH',
      `/v1/workspaces/${w.gym.id}/sessions/${date.id}`,
      w.john,
      { version: 1, capacity: 5 },
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as RefusalBody).code).toBe('session_cancelled');
  });

  it('AC10: a cancelled session is never a double-booking conflict', async () => {
    const w = await world();
    const { server } = setup();
    const session = await sarahsSession(w);
    await cancel(server, w.gym.id, session.id, w.sarah, body());

    const planned = await call(
      server,
      'POST',
      `/v1/workspaces/${w.gym.id}/sessions/private`,
      w.john,
      {
        clientId: w.mark.id,
        trainerId: w.sarahRole.id,
        localDate: '2026-09-24',
        localStart: '09:00',
        durationMinutes: 60,
        notify: false,
      },
    );

    expect(planned.status).toBe(201);
  });

  it('AC11: a cancel from a version someone else moved on from answers 409 with the reloaded values and who changed it', async () => {
    const w = await world();
    const { server } = setup();
    const session = await sarahsSession(w);
    const moved = await call(
      server,
      'POST',
      `/v1/workspaces/${w.gym.id}/sessions/${session.id}/reschedule`,
      w.john,
      {
        localDate: '2026-09-25',
        localStart: '10:00',
        durationMinutes: 60,
        notify: false,
        version: 1,
      },
    );
    expect(moved.status).toBe(200);

    const response = await cancel(server, w.gym.id, session.id, w.sarah, body({ version: 1 }));

    expect(response.status).toBe(409);
    const answer = (await response.json()) as RefusalBody;
    expect(answer.code).toBe('session_changed');
    expect(answer.session).toMatchObject({
      status: 'scheduled',
      version: 2,
      startsAt: '2026-09-25T08:00:00.000Z',
    });
    expect(answer.changedBy).toEqual({ name: 'John' });
    expect(await rowOf(session.id)).toMatchObject({ status: 'scheduled', version: 2 });
    expect((await historyOf(session.id)).length).toBe(0);
  });

  it('AC11: two cancels from the same version at once store one: the other answers 409', async () => {
    const w = await world();
    const { server, transport } = setup();
    const session = await sarahsSession(w);
    const send = (who: { id: string }) =>
      cancel(server, w.gym.id, session.id, who, body({ initiator: 'workspace', notify: true }));

    const [first, second] = await Promise.all([send(w.sarah), send(w.john)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const lost = first.status === 409 ? first : second;
    expect(((await lost.json()) as RefusalBody).code).toBe('session_cancelled');
    expect((await historyOf(session.id)).length).toBe(1);
    expect(transport.sent).toHaveLength(1);
    expect(await rowOf(session.id)).toMatchObject({ version: 2 });
  });

  it('AC12: the email is sent once, after the commit, with the key of EM-05 and the cancellation’s event', async () => {
    const w = await world();
    const session = await sarahsSession(w);
    const sentWhile: string[] = [];
    // The sender looks at the database when it is called: the cancellation is stored by then.
    const spying = setup({}, async () => {
      sentWhile.push((await rowOf(session.id)).status);
    });

    const first = await cancel(
      spying.server,
      w.gym.id,
      session.id,
      w.john,
      body({ initiator: 'workspace', notify: true }),
    );
    // A retry of the same cancellation is refused and sends nothing more.
    const again = await cancel(
      spying.server,
      w.gym.id,
      session.id,
      w.john,
      body({ initiator: 'workspace', notify: true }),
    );

    expect(first.status).toBe(200);
    expect(again.status).toBe(409);
    expect(sentWhile).toEqual(['cancelled']);
    expect(spying.transport.sent).toHaveLength(1);
    expect(spying.transport.sent[0]?.idempotencyKey).toBe(
      emailIdempotencyKey('EM-05', privateSessionEmailEvent(session.id, 2, w.anna.id)),
    );
  });

  it('AC12: a refused cancellation sends nothing, and a failing send does not undo the cancellation', async () => {
    const w = await world();
    const failing = setup({
      sendPrivateSession: () => Promise.reject(new Error('the provider is down')),
    });
    const session = await sarahsSession(w);

    const refused = await cancel(
      failing.server,
      w.gym.id,
      session.id,
      w.sarah,
      body({ version: 7, notify: true }),
    );
    expect(refused.status).toBe(409);
    expect((await rowOf(session.id)).status).toBe('scheduled');

    const response = await cancel(
      failing.server,
      w.gym.id,
      session.id,
      w.sarah,
      body({ initiator: 'workspace', notify: true }),
    );

    expect(response.status).toBe(200);
    expect((await rowOf(session.id)).status).toBe('cancelled');
  });

  it('AC12: a duo’s two clients each get their own email in their own language, naming neither the other nor an email address', async () => {
    const w = await world();
    const { server, transport } = setup();
    const session = await sarahsSession(w, { secondClientId: w.mark.id });

    const response = await cancel(
      server,
      w.gym.id,
      session.id,
      w.john,
      body({ initiator: 'workspace', notify: true }),
    );

    expect(response.status).toBe(200);
    const answer = (await response.json()) as CancelledBody;
    expect(answer.clientsNotified).toBe(2);
    expect(answer.session.participants.map((place) => place.attendanceStatus)).toEqual([
      'cancelled',
      'cancelled',
    ]);
    expect(transport.sent.map((email) => [email.to.email, email.locale])).toEqual([
      ['anna@example.com', 'nl-NL'],
      ['mark@example.com', 'en'],
    ]);
    expect(new Set(transport.sent.map((email) => email.idempotencyKey)).size).toBe(2);
    expect(transport.sent[0]?.text).not.toContain('Mark');
    expect(transport.sent[1]?.text).not.toContain('Anna');
    for (const email of transport.sent) {
      expect(email.text).not.toContain('@example.com');
      expect(email.html).not.toContain('@example.com');
    }
    expect(await historyOf(session.id)).toHaveLength(2);
  });

  it('AC13: Mike (Fit Studio) gets 404, Anna’s client account is refused (403, as on every team route: it has a place, not this access), an anonymous caller 401', async () => {
    const w = await world();
    const { server } = setup();
    const session = await sarahsSession(w);

    const fromOtherWorkspace = await cancel(server, w.gym.id, session.id, w.mike, body());
    const fromClient = await cancel(server, w.gym.id, session.id, w.annaAccount, body());
    const anonymous = await cancel(server, w.gym.id, session.id, undefined, body());
    const wrongWorkspace = await cancel(server, w.other.id, session.id, w.mike, body());

    expect(fromOtherWorkspace.status).toBe(404);
    expect(fromClient.status).toBe(403);
    expect(anonymous.status).toBe(401);
    // The session of John's Gym is invisible from Mike's own workspace too.
    expect(wrongWorkspace.status).toBe(404);
    expect(await rowOf(session.id)).toMatchObject({ status: 'scheduled', version: 1 });
  });

  it('AC13: a session that is not a private session of the workspace answers 404', async () => {
    const w = await world();
    const { server } = setup();
    const group = await addSession(admin.db, {
      workspaceId: w.gym.id,
      type: 'group',
      participant: false,
      trainerProfileId: w.sarahProfile,
      startsAt: START,
    });

    expect((await cancel(server, w.gym.id, group.id, w.john, body())).status).toBe(404);
    expect((await cancel(server, w.gym.id, crypto.randomUUID(), w.john, body())).status).toBe(404);
  });

  it('answers 400 for a body that does not match, and for an app that names no surface', async () => {
    const w = await world();
    const { server } = setup();
    const session = await sarahsSession(w);

    for (const bad of [
      {},
      body({ initiator: 'trainer' }),
      body({ notify: 'yes' }),
      { initiator: 'client', notify: false },
    ]) {
      expect((await cancel(server, w.gym.id, session.id, w.sarah, bad)).status).toBe(400);
    }
    const noSurface = await cancel(server, w.gym.id, session.id, w.sarah, body(), {
      authorization: 'Bearer synthetic-token',
    });
    expect(noSurface.status).toBe(400);
    expect(await rowOf(session.id)).toMatchObject({ status: 'scheduled', version: 1 });
  });

  it('records the app that cancelled as the source of the history', async () => {
    const w = await world();
    const { server } = setup();
    const session = await sarahsSession(w);

    const response = await cancel(server, w.gym.id, session.id, w.sarah, body({ surface: 'ios' }), {
      authorization: 'Bearer synthetic-token',
    });

    expect(response.status).toBe(200);
    expect((await historyOf(session.id))[0]).toMatchObject({ source: 'ios' });
  });

  it('AC14: the operation is in the contract with its access and the error codes', () => {
    const operation =
      contract.paths['/v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel']?.post;
    expect(operation.operationId).toBe('cancelPrivateSession');
    expect(operation['x-access']).toEqual({
      type: 'workspace',
      capability: 'session.private.cancel.own',
      roles: ['owner', 'trainer'],
      client: 'none',
    });
    expect(Object.keys(operation.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '409']),
    );
    const refusal = contract.components.schemas.CancelPrivateSessionRefusal;
    expect(refusal.properties.code.enum).toEqual(['session_changed', 'session_cancelled']);
  });

  it('AC15: private_session_cancelled has the workspace ID, the platform and the initiator only; a refusal records nothing', async () => {
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
    const w = await world();
    const { server } = setup({ productEvents });
    const webSession = await sarahsSession(w);
    const appSession = await sarahsSession(w);
    const quietSession = await sarahsSession(w);

    await cancel(server, w.gym.id, webSession.id, w.tom, body()); // 403
    await cancel(server, w.gym.id, webSession.id, w.sarah, {}); // 400
    await cancel(server, w.gym.id, webSession.id, w.sarah, body({ version: 5 })); // 409
    await cancel(server, w.gym.id, crypto.randomUUID(), w.sarah, body()); // 404
    await cancel(server, w.gym.id, quietSession.id, w.sarah, body(), {
      authorization: 'Bearer synthetic-token',
    }); // 400: an app that names no surface
    expect(posthog.events).toEqual([]);

    await cancel(server, w.gym.id, webSession.id, w.sarah, body());
    await cancel(
      server,
      w.gym.id,
      appSession.id,
      w.john,
      body({ initiator: 'workspace', notify: true, surface: 'android' }),
      { authorization: 'Bearer synthetic-token' },
    );
    await cancel(server, w.gym.id, webSession.id, w.sarah, body({ version: 2 })); // a second cancel

    expect(posthog.events.map(({ event }) => event)).toEqual([
      'private_session_cancelled',
      'private_session_cancelled',
    ]);
    expect(
      posthog.events.map((event) =>
        Object.fromEntries(
          Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
        ),
      ),
    ).toEqual([
      { workspace_id: w.gym.id, platform: 'web', initiator: 'client' },
      { workspace_id: w.gym.id, platform: 'android', initiator: 'workspace' },
    ]);
    expect(posthog.events[0]?.distinct_id).toBe(w.sarah.id);
    expect(posthog.events[1]?.distinct_id).toBe(w.john.id);
    const sent = JSON.stringify([whatFivviSent(posthog.events), lines]);
    for (const personal of [
      'Anna de Vries',
      'anna@example.com',
      w.sarah.email,
      webSession.id,
      appSession.id,
      '2026-09-24',
      '09:00',
      '07:00',
    ]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });

  // ---------------------------------------------------------------------------------------------
  // A class date, alone or with the rest of its series (ticket #558). "Kracht" (Strength in English),
  // weekly on Tuesday at 18:00 with Sarah, from 6 October to 22 December 2026; 20 October has three
  // participants: Anna (Dutch), Mark (English) and Sophie (no language: John's Gym's Dutch).

  /** Every Tuesday from 6 October to 22 December 2026, 18:00 in Amsterdam, as dates of one series. */
  async function kracht(w: World, options: { endsOn?: string } = {}) {
    const groupClass = await addGroupClass(admin.db, {
      workspaceId: w.gym.id,
      nameNl: 'Kracht',
      nameEn: 'Strength',
      defaultTrainerProfileId: w.sarahProfile,
    });
    const series = await addClassSeries(admin.db, {
      workspaceId: w.gym.id,
      groupClassId: groupClass.id,
      trainerProfileId: w.sarahProfile,
      ...(options.endsOn ? { endsOn: options.endsOn } : {}),
    });
    const dates: Record<string, Awaited<ReturnType<typeof addSession>>> = {};
    for (let week = 0; week < 12; week += 1) {
      const day = new Date(Date.UTC(2026, 9, 6 + week * 7)).toISOString().slice(0, 10);
      dates[day] = await addSession(admin.db, {
        workspaceId: w.gym.id,
        type: 'group',
        groupClassId: groupClass.id,
        participant: false,
        trainerProfileId: w.sarahProfile,
        series: { id: series.id, occurrenceDate: day },
        startsAt: zonedTime(`${day}T18:00`),
      });
    }
    const on = (day: string) => {
      const date = dates[day];
      if (!date) throw new Error(`no class date on ${day}`);
      return date;
    };
    return { groupClass, series, dates, on };
  }

  const cancelClass = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    sessionId: string,
    who: { id: string } | undefined,
    body: unknown,
    headers?: Record<string, string>,
  ) =>
    call(
      server,
      'POST',
      `/v1/workspaces/${workspaceId}/sessions/${sessionId}/cancel-class`,
      who,
      body,
      headers,
    );

  const previewCancel = (
    server: ReturnType<typeof setup>['server'],
    workspaceId: string,
    sessionId: string,
    who: { id: string } | undefined,
  ) =>
    call(server, 'GET', `/v1/workspaces/${workspaceId}/sessions/${sessionId}/cancel-preview`, who);

  const classBody = (overrides: Record<string, unknown> = {}) => ({
    scope: 'this',
    version: 1,
    ...overrides,
  });

  interface ClassCancelledBody {
    session: SessionBody;
    datesCancelled: number;
    datesRemoved: number;
    participantsNotified: number;
    seriesEndsOn?: string;
  }

  interface PreviewBody {
    sessionId: string;
    started: boolean;
    inSeries: boolean;
    thisDate: Counts;
    following?: Counts;
  }
  interface Counts {
    datesCancelled: number;
    datesRemoved: number;
    datesWithEmails: number;
    participants: number;
    emails: number;
  }

  /** Anna, Mark and Sophie booked on the date, as the F025 helper does until M5's bookings. */
  const book = (w: World, date: { id: string }, clients = [w.anna, w.mark, w.sophie]) =>
    addParticipants(admin.db, { workspaceId: w.gym.id, session: date, clients });

  const datesOf = async (seriesId: string) =>
    admin.db
      .select({
        id: sessions.id,
        day: sessions.occurrenceDate,
        status: sessions.status,
        version: sessions.version,
        message: sessions.cancellationMessage,
      })
      .from(sessions)
      .where(eq(sessions.seriesId, seriesId))
      .orderBy(asc(sessions.occurrenceDate));

  it('AC5: Tom gets 403 on the class cancel route and its preview, and nothing is stored; John cancels', async () => {
    const w = await world();
    const { server, transport } = setup();
    const k = await kracht(w);
    const date = k.on('2026-10-20');
    await book(w, date);

    const refused = await cancelClass(server, w.gym.id, date.id, w.tom, classBody());
    const refusedPreview = await previewCancel(server, w.gym.id, date.id, w.tom);
    const sarahOwn = await cancelClass(server, w.gym.id, date.id, w.sarah, classBody());

    expect(refused.status).toBe(403);
    expect(refusedPreview.status).toBe(403);
    // Sarah teaches it and still may not: only the Owner cancels a class date.
    expect(sarahOwn.status).toBe(403);
    expect(await rowOf(date.id)).toMatchObject({ status: 'scheduled', version: 1 });
    expect(transport.sent).toEqual([]);
    const allowed = await cancelClass(server, w.gym.id, date.id, w.john, classBody());
    expect(allowed.status).toBe(200);
  });

  it('AC6: one class date: the date, John and the time recorded, each place cancelled by the workspace, EM-05 to Anna in Dutch and Mark in English with the message as typed; the other dates and the series unchanged', async () => {
    const w = await world();
    const { server, transport } = setup();
    const k = await kracht(w);
    const date = k.on('2026-10-20');
    await book(w, date);
    const message = 'Sarah is ziek, sorry!';

    const preview = await previewCancel(server, w.gym.id, date.id, w.john);
    expect(preview.status).toBe(200);
    expect((await preview.json()) as PreviewBody).toMatchObject({
      sessionId: date.id,
      started: false,
      inSeries: true,
      thisDate: {
        datesCancelled: 1,
        datesRemoved: 0,
        datesWithEmails: 1,
        participants: 3,
        emails: 3,
      },
    });
    expect(transport.sent).toEqual([]);

    const response = await cancelClass(server, w.gym.id, date.id, w.john, classBody({ message }));

    expect(response.status).toBe(200);
    const answer = (await response.json()) as ClassCancelledBody;
    expect(answer).toMatchObject({
      datesCancelled: 1,
      datesRemoved: 0,
      participantsNotified: 3,
      session: {
        id: date.id,
        status: 'cancelled',
        version: 2,
        cancellation: {
          cancelledAt: NOW,
          cancelledBy: { id: w.johnRole.id, name: 'John' },
          initiator: 'workspace',
          message,
        },
        participants: [
          { clientId: w.anna.id, attendanceStatus: 'cancelled' },
          { clientId: w.mark.id, attendanceStatus: 'cancelled' },
          { clientId: w.sophie.id, attendanceStatus: 'cancelled' },
        ],
      },
    });
    expect(answer.seriesEndsOn).toBeUndefined();
    expect(await rowOf(date.id)).toMatchObject({
      status: 'cancelled',
      cancelledAt: new Date(NOW),
      cancelledByTeamMemberId: w.johnRole.id,
      cancellationInitiator: 'workspace',
      cancellationMessage: message,
    });
    // Each place has one history line: booked to cancelled, by John, from the web, for the workspace.
    const history = await historyOf(date.id);
    expect(history).toHaveLength(3);
    for (const line of history) {
      expect(line).toMatchObject({
        fromStatus: 'booked',
        toStatus: 'cancelled',
        initiatedBy: 'workspace',
        source: 'web',
        changedAt: new Date(NOW),
      });
    }
    // The other dates and the series are as they were.
    const rest = (await datesOf(k.series.id)).filter((row) => row.id !== date.id);
    expect(rest).toHaveLength(11);
    expect(rest.every((row) => row.status === 'scheduled' && row.version === 1)).toBe(true);
    const [series] = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.id, k.series.id));
    expect(series).toMatchObject({ endsOn: null, version: 1 });
    // EM-05 to each participant in their own language, the message as typed, no other participant.
    expect(transport.sent.map((email) => [email.to.email, email.locale, email.subject])).toEqual([
      ['anna@example.com', 'nl-NL', 'Kracht op dinsdag 20 oktober gaat niet door'],
      ['mark@example.com', 'en', 'Strength on Tuesday 20 October is cancelled'],
      ['sophie@example.com', 'nl-NL', 'Kracht op dinsdag 20 oktober gaat niet door'],
    ]);
    expect(transport.sent[0]?.text).toContain(`Bericht van ${w.gym.marker}:`);
    expect(transport.sent[1]?.text).toContain(`Message from ${w.gym.marker}:`);
    for (const email of transport.sent) {
      expect(email.text).toContain(message);
      expect(email.text).not.toContain('Jansen');
      expect(email.text).not.toContain('Bakker');
      expect(email.text).not.toContain('Vries');
    }
  });

  it('AC6: a participant without a language gets the workspace’s default, English when that is English', async () => {
    const w = await world({ defaultLocale: 'en' });
    const { server, transport } = setup();
    const date = (await kracht(w)).on('2026-10-20');
    await book(w, date, [w.sophie]);

    await cancelClass(server, w.gym.id, date.id, w.john, classBody());

    expect(transport.sent.map((email) => [email.to.email, email.locale])).toEqual([
      ['sophie@example.com', 'en'],
    ]);
  });

  it('AC7: this and following from 3 November: dates with participants or changes of their own are cancelled and emailed, the others removed, the series ends on 2 November; dates before are unchanged', async () => {
    const w = await world();
    const { server, transport } = setup();
    const k = await kracht(w);
    const chosen = k.on('2026-11-03');
    await book(w, chosen, [w.sophie]);
    await book(w, k.on('2026-11-17'), [w.anna, w.mark]);
    // 24 November was moved on its own (a field of its own): it stays, cancelled, nobody to email.
    await admin.db
      .update(sessions)
      .set({ detachedFields: ['trainer'] })
      .where(eq(sessions.id, k.on('2026-11-24').id));
    // 1 December already cancelled: left exactly as it is.
    await admin.db
      .update(sessions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date('2026-09-01T10:00:00Z'),
        cancellationInitiator: 'client',
      })
      .where(eq(sessions.id, k.on('2026-12-01').id));

    const preview = (await (
      await previewCancel(server, w.gym.id, chosen.id, w.john)
    ).json()) as PreviewBody;
    expect(preview.following).toEqual({
      datesCancelled: 3,
      // 10 November and 8, 15 and 22 December: nothing of their own (1 December was cancelled).
      datesRemoved: 4,
      datesWithEmails: 2,
      participants: 3,
      emails: 3,
    });
    expect(preview.thisDate).toMatchObject({ datesCancelled: 1, participants: 1, emails: 1 });

    const response = await cancelClass(
      server,
      w.gym.id,
      chosen.id,
      w.john,
      classBody({ scope: 'following', message: 'Het seizoen is voorbij' }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as ClassCancelledBody).toMatchObject({
      datesCancelled: 3,
      datesRemoved: 4,
      participantsNotified: 3,
      seriesEndsOn: '2026-11-02',
      session: { id: chosen.id, status: 'cancelled' },
    });
    const after = await datesOf(k.series.id);
    expect(after.map((row) => [row.day, row.status])).toEqual([
      ['2026-10-06', 'scheduled'],
      ['2026-10-13', 'scheduled'],
      ['2026-10-20', 'scheduled'],
      ['2026-10-27', 'scheduled'],
      ['2026-11-03', 'cancelled'],
      ['2026-11-17', 'cancelled'],
      ['2026-11-24', 'cancelled'],
      ['2026-12-01', 'cancelled'],
    ]);
    // Dates before 3 November are exactly as they were; the message is kept where it was sent.
    expect(after.slice(0, 4).every((row) => row.version === 1 && row.message === null)).toBe(true);
    expect(after.map((row) => row.message)).toEqual([
      null,
      null,
      null,
      null,
      'Het seizoen is voorbij',
      'Het seizoen is voorbij',
      null,
      null,
    ]);
    // 1 December keeps its own record: not cancelled again by the Owner.
    expect(await rowOf(k.on('2026-12-01').id)).toMatchObject({
      cancellationInitiator: 'client',
      cancelledAt: new Date('2026-09-01T10:00:00Z'),
      version: 1,
    });
    const [series] = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.id, k.series.id));
    expect(series).toMatchObject({ endsOn: '2026-11-02', version: 2 });
    // Each place of the dates cancelled has its history line; Anna and Mark twice over is no case here.
    expect(await historyOf(chosen.id)).toHaveLength(1);
    expect(await historyOf(k.on('2026-11-17').id)).toHaveLength(2);
    // One email for each place cancelled on a date that had not started (3 November and 17 November).
    expect(transport.sent.map((email) => [email.to.email, email.subject])).toEqual([
      ['sophie@example.com', 'Kracht op dinsdag 3 november gaat niet door'],
      ['anna@example.com', 'Kracht op dinsdag 17 november gaat niet door'],
      ['mark@example.com', 'Strength on Tuesday 17 November is cancelled'],
    ]);
  });

  it('AC7: a later date with a booking link is cancelled, not removed; a series that ended earlier keeps its end', async () => {
    const w = await world();
    const { server } = setup();
    const k = await kracht(w, { endsOn: '2026-12-15' });
    const linked = k.on('2026-11-10');
    await addBookingLink(admin.db, {
      workspaceId: w.gym.id,
      scope: 'session',
      sessionId: linked.id,
    });

    const response = await cancelClass(
      server,
      w.gym.id,
      k.on('2026-11-03').id,
      w.john,
      classBody({ scope: 'following' }),
    );

    expect(response.status).toBe(200);
    expect((await rowOf(linked.id)).status).toBe('cancelled');
    const [series] = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.id, k.series.id));
    expect(series?.endsOn).toBe('2026-11-02');
  });

  it('AC7: the first date of a series: the series ends on its own day and the date stays, cancelled', async () => {
    const w = await world();
    const { server } = setup();
    const k = await kracht(w);

    const response = await cancelClass(
      server,
      w.gym.id,
      k.on('2026-10-06').id,
      w.john,
      classBody({ scope: 'following' }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as ClassCancelledBody).toMatchObject({
      datesCancelled: 1,
      datesRemoved: 11,
      seriesEndsOn: '2026-10-06',
    });
    expect((await datesOf(k.series.id)).map((row) => [row.day, row.status])).toEqual([
      ['2026-10-06', 'cancelled'],
    ]);
  });

  it('AC7: a date that is in no series cannot be cancelled with the rest of a series: 400 on scope', async () => {
    const w = await world();
    const { server } = setup();
    const alone = await addSession(admin.db, {
      workspaceId: w.gym.id,
      type: 'group',
      participant: false,
      startsAt: START,
    });

    const response = await cancelClass(
      server,
      w.gym.id,
      alone.id,
      w.john,
      classBody({ scope: 'following' }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      issues: [{ path: 'scope', code: 'not_in_series' }],
    });
    expect((await rowOf(alone.id)).status).toBe('scheduled');
    const preview = (await (
      await previewCancel(server, w.gym.id, alone.id, w.john)
    ).json()) as PreviewBody;
    expect(preview).toMatchObject({ inSeries: false });
    expect(preview.following).toBeUndefined();
  });

  it('AC8: a class date without participants: the preview says so, cancelling sends nothing', async () => {
    const w = await world();
    const { server, transport } = setup();
    const date = (await kracht(w)).on('2026-10-20');

    const preview = (await (
      await previewCancel(server, w.gym.id, date.id, w.john)
    ).json()) as PreviewBody;
    const response = await cancelClass(
      server,
      w.gym.id,
      date.id,
      w.john,
      classBody({ message: 'Wegens ziekte' }),
    );

    expect(preview.thisDate).toEqual({
      datesCancelled: 1,
      datesRemoved: 0,
      datesWithEmails: 0,
      participants: 0,
      emails: 0,
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as ClassCancelledBody).toMatchObject({
      participantsNotified: 0,
      session: { status: 'cancelled' },
    });
    expect(transport.sent).toEqual([]);
    // Nobody was told, so the message was not sent and is not kept.
    expect((await rowOf(date.id)).cancellationMessage).toBeNull();
  });

  it('AC9: a class date that has passed is recorded as cancelled without an email or a message, and says so in the preview', async () => {
    const w = await world();
    const { server, transport, clock } = setup();
    const k = await kracht(w);
    const thirteenth = k.on('2026-10-13');
    await book(w, thirteenth);
    clock.set(zonedTime('2026-10-14T10:00').toISOString());

    const preview = (await (
      await previewCancel(server, w.gym.id, thirteenth.id, w.john)
    ).json()) as PreviewBody;
    const response = await cancelClass(
      server,
      w.gym.id,
      thirteenth.id,
      w.john,
      classBody({ message: 'Te laat om te melden' }),
    );

    expect(preview).toMatchObject({
      started: true,
      thisDate: { participants: 0, emails: 0, datesWithEmails: 0 },
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as ClassCancelledBody).toMatchObject({
      participantsNotified: 0,
      session: {
        status: 'cancelled',
        participants: [
          { attendanceStatus: 'cancelled' },
          { attendanceStatus: 'cancelled' },
          { attendanceStatus: 'cancelled' },
        ],
      },
    });
    expect(transport.sent).toEqual([]);
    expect(await rowOf(thirteenth.id)).toMatchObject({
      status: 'cancelled',
      cancellationMessage: null,
    });
    expect(await historyOf(thirteenth.id)).toHaveLength(3);
  });

  it('AC9: the rest of a series from a date that has passed emails the later dates that have not started', async () => {
    const w = await world();
    const { server, transport, clock } = setup();
    const k = await kracht(w);
    await book(w, k.on('2026-10-13'), [w.anna]);
    await book(w, k.on('2026-10-20'), [w.mark]);
    clock.set(zonedTime('2026-10-14T10:00').toISOString());

    const response = await cancelClass(
      server,
      w.gym.id,
      k.on('2026-10-13').id,
      w.john,
      classBody({ scope: 'following', message: 'Einde seizoen' }),
    );

    expect(response.status).toBe(200);
    expect(transport.sent.map((email) => email.to.email)).toEqual(['mark@example.com']);
    expect((await rowOf(k.on('2026-10-13').id)).cancellationMessage).toBeNull();
    expect((await rowOf(k.on('2026-10-20').id)).cancellationMessage).toBe('Einde seizoen');
  });

  it('AC10: a cancelled class date refuses every other write with 409 session_cancelled, a second cancel and the preview too, and nothing changes', async () => {
    const w = await world();
    const { server, transport } = setup();
    const date = (await kracht(w)).on('2026-10-20');
    await book(w, date, [w.anna]);
    expect(
      (await cancelClass(server, w.gym.id, date.id, w.john, classBody({ version: 1 }))).status,
    ).toBe(200);
    const before = await rowOf(date.id);
    transport.sent.length = 0;
    const path = `/v1/workspaces/${w.gym.id}/sessions/${date.id}`;

    const attempts: [string, Response | Promise<Response>][] = [
      [
        'a second cancel',
        cancelClass(server, w.gym.id, date.id, w.john, classBody({ version: 1 })),
      ],
      [
        'a second cancel, current version',
        cancelClass(server, w.gym.id, date.id, w.john, classBody({ version: 2 })),
      ],
      ['the preview', previewCancel(server, w.gym.id, date.id, w.john)],
      ['a date edit', call(server, 'PATCH', path, w.john, { version: 1, capacity: 5 })],
      [
        'a trainer change',
        call(server, 'POST', `${path}/trainer`, w.john, { trainerId: w.tomRole.id, version: 1 }),
      ],
      [
        'attendance',
        call(server, 'PUT', `${path}/participants/${w.anna.id}/attendance`, w.john, {
          status: 'attended',
          clientRequestId: crypto.randomUUID(),
        }),
      ],
    ];
    for (const [name, pending] of attempts) {
      const response = await pending;
      expect(response.status, name).toBe(409);
      expect(((await response.json()) as RefusalBody).code, name).toBe('session_cancelled');
    }
    expect(await rowOf(date.id)).toEqual(before);
    expect(transport.sent).toEqual([]);
  });

  it('AC11: a cancel from a version that someone else moved on from answers 409 with the reloaded values and stores nothing', async () => {
    const w = await world();
    const { server, transport } = setup();
    const k = await kracht(w);
    const date = k.on('2026-10-20');
    await book(w, date);
    await admin.db
      .update(sessions)
      .set({ version: 2, capacity: 6, updatedByTeamMemberId: w.sarahRole.id })
      .where(eq(sessions.id, date.id));

    const response = await cancelClass(
      server,
      w.gym.id,
      date.id,
      w.john,
      classBody({ scope: 'following', version: 1 }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()) as RefusalBody).toMatchObject({
      code: 'session_changed',
      session: { id: date.id, version: 2, status: 'scheduled', capacity: 6 },
      changedBy: { name: 'Sarah' },
    });
    expect(await rowOf(date.id)).toMatchObject({ status: 'scheduled', version: 2 });
    // Nothing of the rest of the series was touched either, and the series did not end.
    expect((await datesOf(k.series.id)).every((row) => row.status === 'scheduled')).toBe(true);
    expect(await historyOf(date.id)).toEqual([]);
    expect(transport.sent).toEqual([]);
    const [series] = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.id, k.series.id));
    expect(series).toMatchObject({ endsOn: null, version: 1 });
  });

  it('AC11: two cancels from the same version at once store one: the other answers 409', async () => {
    const w = await world();
    const { server, transport } = setup();
    const date = (await kracht(w)).on('2026-10-20');
    await book(w, date, [w.anna]);

    const [first, second] = await Promise.all([
      cancelClass(server, w.gym.id, date.id, w.john, classBody({ message: 'Eén' })),
      cancelClass(server, w.gym.id, date.id, w.john, classBody({ message: 'Twee' })),
    ]);

    expect([first.status, second.status].toSorted()).toEqual([200, 409]);
    expect(await historyOf(date.id)).toHaveLength(1);
    expect(transport.sent).toHaveLength(1);
  });

  it('AC12: each participant gets one email, after the commit, with the key of EM-05 and the date’s event; the message is escaped and as typed', async () => {
    const w = await world();
    const k = await kracht(w);
    const date = k.on('2026-10-20');
    await book(w, date, [w.anna, w.mark]);
    const sentWhile: string[] = [];
    // The sender looks at the database when it is called: the cancellation is stored by then.
    const spying = setup({}, undefined, async () => {
      sentWhile.push((await rowOf(date.id)).status);
    });
    const { server } = spying;
    const hostile = '<b>Tot dan</b> & "welkom"\nTweede regel';

    const first = await cancelClass(
      server,
      w.gym.id,
      date.id,
      w.john,
      classBody({ message: hostile }),
    );
    // A retry is refused and sends nothing more.
    const again = await cancelClass(
      server,
      w.gym.id,
      date.id,
      w.john,
      classBody({ message: hostile }),
    );

    expect(first.status).toBe(200);
    expect(again.status).toBe(409);
    // The cancellation was stored when each email was sent.
    expect(sentWhile).toEqual(['cancelled', 'cancelled']);
    expect(spying.transport.sent).toHaveLength(2);
    expect(spying.transport.sent.map((email) => email.idempotencyKey)).toEqual([
      emailIdempotencyKey('EM-05', privateSessionEmailEvent(date.id, 2, w.anna.id)),
      emailIdempotencyKey('EM-05', privateSessionEmailEvent(date.id, 2, w.mark.id)),
    ]);
    for (const email of spying.transport.sent) {
      expect(email.html).not.toContain('<b>Tot dan</b>');
      expect(email.html).toContain('&lt;b&gt;Tot dan&lt;/b&gt; &amp; &quot;welkom&quot;');
      expect(email.text).toContain('<b>Tot dan</b> & "welkom"');
    }
    expect((await rowOf(date.id)).cancellationMessage).toBe(hostile);
  });

  it('AC12: a refused cancellation sends nothing, a failing send does not undo the cancellation', async () => {
    const w = await world();
    const failing = setup({
      sendClassCancelled: () => Promise.reject(new Error('the provider is down')),
    });
    const date = (await kracht(w)).on('2026-10-20');
    await book(w, date, [w.anna]);

    const refused = await cancelClass(
      failing.server,
      w.gym.id,
      date.id,
      w.john,
      classBody({ version: 7 }),
    );
    expect(refused.status).toBe(409);
    expect((await rowOf(date.id)).status).toBe('scheduled');
    expect(failing.transport.sent).toEqual([]);

    const response = await cancelClass(failing.server, w.gym.id, date.id, w.john, classBody());

    expect(response.status).toBe(200);
    expect((await rowOf(date.id)).status).toBe('cancelled');
  });

  it('AC12: the rest of a series sends one email for each place and date, each with a key of its own', async () => {
    const w = await world();
    const { server, transport } = setup();
    const k = await kracht(w);
    await book(w, k.on('2026-10-20'), [w.anna]);
    await book(w, k.on('2026-10-27'), [w.anna]);

    await cancelClass(
      server,
      w.gym.id,
      k.on('2026-10-20').id,
      w.john,
      classBody({ scope: 'following' }),
    );

    expect(transport.sent).toHaveLength(2);
    const keys = new Set(transport.sent.map((email) => email.idempotencyKey));
    expect(keys.size).toBe(2);
  });

  it('AC13: Mike (Fit Studio) gets 404, Anna’s client account is refused, an anonymous caller 401; a private session and an unknown date answer 404', async () => {
    const w = await world();
    const { server } = setup();
    const date = (await kracht(w)).on('2026-10-20');
    const privateSession = await sarahsSession(w);

    const fromOtherWorkspace = await cancelClass(server, w.gym.id, date.id, w.mike, classBody());
    const previewFromOther = await previewCancel(server, w.gym.id, date.id, w.mike);
    const wrongWorkspace = await cancelClass(server, w.other.id, date.id, w.mike, classBody());
    const fromClient = await cancelClass(server, w.gym.id, date.id, w.annaAccount, classBody());
    const anonymous = await cancelClass(server, w.gym.id, date.id, undefined, classBody());
    const anonymousPreview = await previewCancel(server, w.gym.id, date.id, undefined);

    expect(fromOtherWorkspace.status).toBe(404);
    expect(previewFromOther.status).toBe(404);
    expect(wrongWorkspace.status).toBe(404);
    expect(fromClient.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(anonymousPreview.status).toBe(401);
    expect(
      (await cancelClass(server, w.gym.id, privateSession.id, w.john, classBody())).status,
    ).toBe(404);
    expect((await previewCancel(server, w.gym.id, privateSession.id, w.john)).status).toBe(404);
    expect(
      (await cancelClass(server, w.gym.id, crypto.randomUUID(), w.john, classBody())).status,
    ).toBe(404);
    expect(await rowOf(date.id)).toMatchObject({ status: 'scheduled', version: 1 });
    // And a class date is no private session for the private route.
    expect((await cancel(server, w.gym.id, date.id, w.john, body())).status).toBe(404);
  });

  it('answers 400 for a body that does not match, a message over 500 characters and an app that names no surface; 500 characters are fine', async () => {
    const w = await world();
    const { server } = setup();
    const date = (await kracht(w)).on('2026-10-20');

    for (const bad of [
      {},
      classBody({ scope: 'all' }),
      classBody({ version: 'one' }),
      { scope: 'this' },
      classBody({ message: 'x'.repeat(501) }),
    ]) {
      expect((await cancelClass(server, w.gym.id, date.id, w.john, bad)).status).toBe(400);
    }
    const noSurface = await cancelClass(server, w.gym.id, date.id, w.john, classBody(), {
      authorization: 'Bearer synthetic-token',
    });
    expect(noSurface.status).toBe(400);
    expect(await rowOf(date.id)).toMatchObject({ status: 'scheduled', version: 1 });

    const longest = await cancelClass(
      server,
      w.gym.id,
      date.id,
      w.john,
      classBody({ message: 'x'.repeat(500) }),
    );
    expect(longest.status).toBe(200);
  });

  it('records the app that cancelled as the source of the history', async () => {
    const w = await world();
    const { server } = setup();
    const date = (await kracht(w)).on('2026-10-20');
    await book(w, date, [w.anna]);

    const response = await cancelClass(
      server,
      w.gym.id,
      date.id,
      w.john,
      classBody({ surface: 'ios' }),
      { authorization: 'Bearer synthetic-token' },
    );

    expect(response.status).toBe(200);
    expect((await historyOf(date.id))[0]).toMatchObject({ source: 'ios' });
  });

  it('AC14: the operations are in the contract with their access and the error codes', () => {
    const cancelOperation =
      contract.paths['/v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel-class']?.post;
    const previewOperation =
      contract.paths['/v1/workspaces/{workspaceId}/sessions/{sessionId}/cancel-preview']?.get;
    expect(cancelOperation.operationId).toBe('cancelClassDate');
    expect(previewOperation.operationId).toBe('previewClassCancellation');
    for (const operation of [cancelOperation, previewOperation]) {
      expect(operation['x-access']).toEqual({
        type: 'workspace',
        capability: 'class.manage',
        roles: ['owner'],
        client: 'none',
      });
    }
    expect(Object.keys(cancelOperation.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '409']),
    );
    expect(Object.keys(previewOperation.responses)).toEqual(
      expect.arrayContaining(['200', '401', '403', '404', '409']),
    );
    expect(contract.components.schemas.CancelClassDateRefusal.properties.code.enum).toEqual([
      'session_changed',
      'session_cancelled',
    ]);
    expect(contract.components.schemas.CancelClassDateRequest.properties.scope.enum).toEqual([
      'this',
      'following',
    ]);
    expect(contract.components.schemas.CancelClassDateRequest.properties.message.maxLength).toBe(
      500,
    );
  });

  it('AC15: class_cancelled has the workspace ID, the platform and the scope only; a refusal records nothing', async () => {
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
    const w = await world();
    const { server } = setup({ productEvents });
    const k = await kracht(w);
    await book(w, k.on('2026-10-20'));
    await book(w, k.on('2026-11-03'), [w.anna]);
    const message = 'Een persoonlijk bericht voor Anna de Vries';

    await cancelClass(server, w.gym.id, k.on('2026-10-20').id, w.tom, classBody()); // 403
    await cancelClass(server, w.gym.id, k.on('2026-10-20').id, w.john, {}); // 400
    await cancelClass(server, w.gym.id, k.on('2026-10-20').id, w.john, classBody({ version: 5 })); // 409
    await cancelClass(server, w.gym.id, crypto.randomUUID(), w.john, classBody()); // 404
    await cancelClass(server, w.gym.id, k.on('2026-10-20').id, w.john, classBody(), {
      authorization: 'Bearer synthetic-token',
    }); // 400: an app that names no surface
    expect(posthog.events).toEqual([]);

    await cancelClass(server, w.gym.id, k.on('2026-10-20').id, w.john, classBody({ message }));
    await cancelClass(
      server,
      w.gym.id,
      k.on('2026-11-03').id,
      w.john,
      classBody({ scope: 'following', message, surface: 'android' }),
      { authorization: 'Bearer synthetic-token' },
    );
    await cancelClass(server, w.gym.id, k.on('2026-10-20').id, w.john, classBody({ version: 2 })); // a second cancel

    expect(posthog.events.map(({ event }) => event)).toEqual([
      'class_cancelled',
      'class_cancelled',
    ]);
    expect(
      posthog.events.map((event) =>
        Object.fromEntries(
          Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
        ),
      ),
    ).toEqual([
      { workspace_id: w.gym.id, platform: 'web', scope: 'this' },
      { workspace_id: w.gym.id, platform: 'android', scope: 'following' },
    ]);
    expect(posthog.events[0]?.distinct_id).toBe(w.john.id);
    const sent = JSON.stringify([whatFivviSent(posthog.events), lines]);
    for (const personal of [
      'Anna de Vries',
      'anna@example.com',
      'Kracht',
      message,
      k.on('2026-10-20').id,
      k.series.id,
      k.groupClass.id,
      '2026-10-20',
      '18:00',
      '16:00',
    ]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });
});
