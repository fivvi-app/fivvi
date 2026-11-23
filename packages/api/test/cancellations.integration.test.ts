import { readFileSync } from 'node:fs';
import {
  authUsers,
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
  emailIdempotencyKey,
} from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
  whatFivviSent,
} from '@fivvi/observability';
import { manualClock } from '@fivvi/testing/clock';
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

describe('F026 cancel a private session', () => {
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
  ) {
    const transport = createMemoryTransport();
    const clock = manualClock(NOW);
    const sender = createPrivateSessionSender({
      sendEmail: createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
        replyTo: { email: 'support@example.com' },
        sleep: () => Promise.resolve(),
        random: () => 0,
      }),
    });
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
      clock,
      ...overrides,
    };
    return { server: createApp({ ...NO_DEPENDENCIES, ...dependencies }), transport, clock };
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
      template: 'private-session-cancelled',
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
});
