import { readFileSync } from 'node:fs';
import {
  createDatabase,
  type DatabaseClient,
  sessionParticipantStatusChanges,
  sessionParticipants,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClient,
  addParticipants,
  addSession,
  addTeamRole,
  createAccount,
} from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiDependencies } from '../src/index.ts';
import { call, groupClassWorld, setupGroupClassApi } from './group-classes-world.ts';

// F025 (spec #460), ticket #544: attendance through the API. Synthetic people as in the spec: John
// (Owner of John's Gym, also trains), Sarah and Tom (Trainers), the clients Anna de Vries, Bram
// Jansen, Chris Bakker and others, Lisa (the client account of John's Gym, `annaAccount` of the
// shared world), Mike (Owner of Fit Studio, the spec's "Tom (Fit Studio)"). Europe/Amsterdam, summer
// time. Tuesday 22 September 2026: Sarah's private session with Anna 09:00-10:00 and "Kracht" with
// Sarah 18:00-19:00 with 7 participants.

const amsterdam = (local: string) => zonedTime(local);
const TUESDAY = '2026-09-22';
const BEARER = { authorization: 'Bearer synthetic-token' };

interface ParticipantBody {
  clientId: string;
  name: string;
  status: 'booked' | 'attended' | 'cancelled' | 'no_show';
}

interface AttendanceBody {
  sessionId: string;
  type: string;
  status: string;
  attendanceOpensAt: string;
  canTakeAttendance: boolean;
  participants: ParticipantBody[];
  summary: { attended: number; noShow: number; open: number; cancelled: number };
}

interface ContractOperation {
  operationId?: string;
  'x-access'?: unknown;
  responses: Record<string, unknown>;
}

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

describe('F025 attendance through the API', () => {
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

  const profileOf = async (teamMemberId: string) => {
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, teamMemberId));
    if (!profile) throw new Error('No trainer profile.');
    return profile.id;
  };

  /** The shared world with Sarah's private session (Anna) and Kracht (seven participants) on Tuesday. */
  async function world(overrides: Partial<ApiDependencies> = {}) {
    const people = await groupClassWorld(admin);
    const workspaceId = people.gym.id;
    const named = async (name: string) => addClient(admin.db, { workspaceId, name });
    const anna = await named('Anna de Vries');
    const bram = await named('Bram Jansen');
    const chris = await named('Chris Bakker');
    const others = [
      await named('Daan Visser'),
      await named('Eva Mulder'),
      await named('Fleur Bos'),
    ];
    const mark = await named('Mark Jansen');
    const sarahProfile = await profileOf(people.sarahRole.id);
    const privateSession = await addSession(admin.db, {
      workspaceId,
      clientId: anna.id,
      trainerProfileId: sarahProfile,
      startsAt: amsterdam(`${TUESDAY}T09:00`),
    });
    // Seven participants: Anna, Bram, Chris, three more and Mark.
    const roster = [anna, bram, chris, ...others, mark];
    const kracht = await addSession(admin.db, {
      workspaceId,
      type: 'group',
      participant: false,
      trainerProfileId: sarahProfile,
      startsAt: amsterdam(`${TUESDAY}T18:00`),
      capacity: 8,
    });
    await addParticipants(admin.db, { workspaceId, session: kracht, clients: roster });
    const api = setupGroupClassApi(admin, app, overrides);
    const now = (local: string) => api.clock.set(amsterdam(`${TUESDAY}T${local}`));
    return {
      ...people,
      workspaceId,
      anna,
      bram,
      chris,
      others,
      mark,
      roster,
      sarahProfile,
      privateSession,
      kracht,
      ...api,
      now,
    };
  }
  type World = Awaited<ReturnType<typeof world>>;

  const base = (w: World, sessionId: string) =>
    `/v1/workspaces/${w.workspaceId}/sessions/${sessionId}/participants`;
  const put = (
    w: World,
    sessionId: string,
    clientId: string,
    who: { id: string } | undefined,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) =>
    call(
      w.server,
      'PUT',
      `${base(w, sessionId)}/${clientId}/attendance`,
      who,
      { clientRequestId: crypto.randomUUID(), ...body },
      headers,
    );
  const everyone = (
    w: World,
    sessionId: string,
    who: { id: string } | undefined,
    body: Record<string, unknown> = {},
    headers?: Record<string, string>,
  ) =>
    call(
      w.server,
      'POST',
      `${base(w, sessionId)}/attended`,
      who,
      { clientRequestId: crypto.randomUUID(), ...body },
      headers,
    );
  const list = (w: World, sessionId: string, who: { id: string } | undefined) =>
    call(w.server, 'GET', base(w, sessionId), who);

  /** The history of one client's place in a session, oldest first. */
  async function history(sessionId: string, clientId: string) {
    const places = await admin.db
      .select({ id: sessionParticipants.id, clientId: sessionParticipants.clientId })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, sessionId));
    const found = places.find((row) => row.clientId === clientId);
    if (!found) return [];
    return admin.db
      .select()
      .from(sessionParticipantStatusChanges)
      .where(eq(sessionParticipantStatusChanges.sessionParticipantId, found.id))
      .orderBy(
        asc(sessionParticipantStatusChanges.changedAt),
        asc(sessionParticipantStatusChanges.createdAt),
        asc(sessionParticipantStatusChanges.id),
      );
  }
  const historySize = async (sessionId: string) =>
    (
      await admin.db
        .select({ id: sessionParticipantStatusChanges.id })
        .from(sessionParticipantStatusChanges)
        .innerJoin(
          sessionParticipants,
          eq(sessionParticipantStatusChanges.sessionParticipantId, sessionParticipants.id),
        )
        .where(eq(sessionParticipants.sessionId, sessionId))
    ).length;
  const statusOf = async (w: World, sessionId: string, clientId: string) => {
    const body = (await (await list(w, sessionId, w.john)).json()) as AttendanceBody;
    return body.participants.find((place) => place.clientId === clientId)?.status;
  };

  it('AC1: each change is stored with time, actor and source; a second tap back to booked adds a second row', async () => {
    const w = await world();
    w.now('10:05');
    const response = await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'attended' });
    expect(response.status).toBe(200);
    const shown = (await response.json()) as AttendanceBody;
    expect(shown.participants).toEqual([
      { clientId: w.anna.id, name: 'Anna de Vries', status: 'attended' },
    ]);
    expect(shown.summary).toEqual({ attended: 1, noShow: 0, open: 0, cancelled: 0 });

    w.now('10:06');
    const back = await put(
      w,
      w.privateSession.id,
      w.anna.id,
      w.sarah,
      { status: 'booked', surface: 'ios' },
      BEARER,
    );
    expect(back.status).toBe(200);
    expect(await statusOf(w, w.privateSession.id, w.anna.id)).toBe('booked');

    const lines = await history(w.privateSession.id, w.anna.id);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      fromStatus: 'booked',
      toStatus: 'attended',
      changedAt: amsterdam(`${TUESDAY}T10:05`),
      actorType: 'team_member',
      actorTeamMemberId: w.sarahRole.id,
      actorAccountId: w.sarah.id,
      initiatedBy: null,
      source: 'web',
    });
    expect(lines[1]).toMatchObject({
      fromStatus: 'attended',
      toStatus: 'booked',
      changedAt: amsterdam(`${TUESDAY}T10:06`),
      source: 'ios',
    });
    // The server's time, in UTC, of the first tap: 10:05 Amsterdam in summer time.
    expect(lines[0]?.changedAt.toISOString()).toBe('2026-09-22T08:05:00.000Z');
  });

  it('AC1: a status the participant has already changes nothing and stores no row', async () => {
    const w = await world();
    w.now('10:05');
    expect(
      (await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'no_show' })).status,
    ).toBe(200);
    expect(
      (await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'no_show' })).status,
    ).toBe(200);
    expect(await history(w.privateSession.id, w.anna.id)).toHaveLength(1);
  });

  it('AC5: too early answers 422 attendance_too_early with when it opens; from 17:30 it works', async () => {
    const w = await world();
    w.now('17:20');
    const early = await put(w, w.kracht.id, w.bram.id, w.sarah, { status: 'attended' });
    expect(early.status).toBe(422);
    expect(await early.json()).toEqual({
      code: 'attendance_too_early',
      opensAt: amsterdam(`${TUESDAY}T17:30`).toISOString(),
    });
    expect(await historySize(w.kracht.id)).toBe(0);
    expect(await statusOf(w, w.kracht.id, w.bram.id)).toBe('booked');

    w.now('17:29');
    expect((await put(w, w.kracht.id, w.bram.id, w.sarah, { status: 'attended' })).status).toBe(
      422,
    );
    w.now('17:30');
    expect((await put(w, w.kracht.id, w.bram.id, w.sarah, { status: 'attended' })).status).toBe(
      200,
    );
    // And the list says when it opens, for the disabled buttons.
    const shown = (await (await list(w, w.kracht.id, w.sarah)).json()) as AttendanceBody;
    expect(shown.attendanceOpensAt).toBe(amsterdam(`${TUESDAY}T17:30`).toISOString());
  });

  it('AC5: there is no end: the session of last week can still be filled in', async () => {
    const w = await world();
    w.clock.set(amsterdam('2026-09-29T12:00'));
    expect(
      (await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'attended' })).status,
    ).toBe(200);
  });

  it('AC6: cancelled session and cancelled participant refused: 409 session_cancelled and 409 participant_cancelled, nothing stored', async () => {
    const w = await world();
    w.now('18:10');
    // Mark cancelled his place (F026 sets this; here it is set directly).
    await admin.db
      .update(sessionParticipants)
      .set({ attendanceStatus: 'cancelled' })
      .where(eq(sessionParticipants.clientId, w.mark.id));
    for (const status of ['attended', 'booked', 'no_show'] as const) {
      const refused = await put(w, w.kracht.id, w.mark.id, w.sarah, { status });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual({ code: 'participant_cancelled' });
    }
    expect(await historySize(w.kracht.id)).toBe(0);

    // Kracht itself is cancelled (F026's status, set directly).
    await admin.db
      .update(sessions)
      .set({ status: 'cancelled' })
      .where(eq(sessions.id, w.kracht.id));
    const cancelled = await put(w, w.kracht.id, w.bram.id, w.sarah, { status: 'attended' });
    expect(cancelled.status).toBe(409);
    expect(await cancelled.json()).toEqual({ code: 'session_cancelled' });
    expect((await everyone(w, w.kracht.id, w.sarah)).status).toBe(409);
    expect(await historySize(w.kracht.id)).toBe(0);
    // The list still reads, and says the session is cancelled.
    const shown = (await (await list(w, w.kracht.id, w.sarah)).json()) as AttendanceBody;
    expect(shown.status).toBe('cancelled');
  });

  it('AC7: current trainer or Owner only (the substitute is F024’s #552): another Trainer gets 403, the Owner may for every session', async () => {
    const w = await world();
    w.now('10:05');
    const tom = await put(w, w.privateSession.id, w.anna.id, w.tom, { status: 'attended' });
    expect(tom.status).toBe(403);
    expect(await tom.json()).toEqual({ code: 'forbidden' });
    expect(await historySize(w.privateSession.id)).toBe(0);
    expect(
      (await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'attended' })).status,
    ).toBe(200);
    // John (Owner) for Sarah's private session and for her class, and for a session of nobody.
    expect(
      (await put(w, w.privateSession.id, w.anna.id, w.john, { status: 'no_show' })).status,
    ).toBe(200);
    w.now('18:10');
    expect((await put(w, w.kracht.id, w.bram.id, w.john, { status: 'attended' })).status).toBe(200);
    const nobodys = await addSession(admin.db, {
      workspaceId: w.workspaceId,
      clientId: w.chris.id,
      startsAt: amsterdam(`${TUESDAY}T17:00`),
    });
    expect((await put(w, nobodys.id, w.chris.id, w.sarah, { status: 'attended' })).status).toBe(
      403,
    );
    expect((await put(w, nobodys.id, w.chris.id, w.john, { status: 'attended' })).status).toBe(200);
    // Reading is for the whole team, and says who may take it.
    const asTom = (await (await list(w, w.privateSession.id, w.tom)).json()) as AttendanceBody;
    expect(asTom.canTakeAttendance).toBe(false);
    const asSarah = (await (await list(w, w.privateSession.id, w.sarah)).json()) as AttendanceBody;
    expect(asSarah.canTakeAttendance).toBe(true);
    const asJohn = (await (await list(w, w.privateSession.id, w.john)).json()) as AttendanceBody;
    expect(asJohn.canTakeAttendance).toBe(true);
  });

  it('AC8: the same client request ID stores one change and answers the current list', async () => {
    const w = await world();
    w.now('10:05');
    const clientRequestId = crypto.randomUUID();
    const first = await put(w, w.privateSession.id, w.anna.id, w.sarah, {
      status: 'attended',
      clientRequestId,
    });
    expect(first.status).toBe(200);
    // Someone else changed it meanwhile: the retry must not undo that, and answers what is now.
    w.now('10:06');
    await put(w, w.privateSession.id, w.anna.id, w.john, { status: 'no_show' });
    w.now('10:07');
    const again = await put(w, w.privateSession.id, w.anna.id, w.sarah, {
      status: 'attended',
      clientRequestId,
    });
    expect(again.status).toBe(200);
    const shown = (await again.json()) as AttendanceBody;
    expect(shown.participants[0]?.status).toBe('no_show');
    const lines = await history(w.privateSession.id, w.anna.id);
    expect(lines.map((line) => line.toStatus)).toEqual(['attended', 'no_show']);

    // The same ID for another participant is no retry.
    const reused = await put(w, w.kracht.id, w.bram.id, w.sarah, {
      status: 'attended',
      clientRequestId,
    });
    expect(reused.status).toBe(400);
    expect(await reused.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'clientRequestId', code: 'already_used' }],
    });
  });

  it('@concurrency AC8: two requests with the same ID at once store one change', async () => {
    const w = await world();
    w.now('10:05');
    const clientRequestId = crypto.randomUUID();
    const answers = await Promise.all(
      [1, 2, 3].map(() =>
        put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'attended', clientRequestId }),
      ),
    );
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
    expect(await history(w.privateSession.id, w.anna.id)).toHaveLength(1);
  });

  it('AC10: last arrival wins; history keeps both changes with their actors and times', async () => {
    const w = await world();
    w.now('18:10');
    expect((await put(w, w.kracht.id, w.bram.id, w.john, { status: 'attended' })).status).toBe(200);
    w.now('18:11');
    expect(
      (
        await put(
          w,
          w.kracht.id,
          w.bram.id,
          w.sarah,
          { status: 'no_show', surface: 'android' },
          BEARER,
        )
      ).status,
    ).toBe(200);
    expect(await statusOf(w, w.kracht.id, w.bram.id)).toBe('no_show');
    const lines = await history(w.kracht.id, w.bram.id);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      toStatus: 'attended',
      actorTeamMemberId: w.johnRole.id,
      changedAt: amsterdam(`${TUESDAY}T18:10`),
      source: 'web',
    });
    expect(lines[1]).toMatchObject({
      fromStatus: 'attended',
      toStatus: 'no_show',
      actorTeamMemberId: w.sarahRole.id,
      changedAt: amsterdam(`${TUESDAY}T18:11`),
      source: 'android',
    });
  });

  it('@concurrency AC10: two changes to one participant at once make a chain: the second one’s from is the first one’s to', async () => {
    const w = await world();
    w.now('18:10');
    const answers = await Promise.all([
      put(w, w.kracht.id, w.bram.id, w.john, { status: 'attended' }),
      put(w, w.kracht.id, w.bram.id, w.sarah, { status: 'no_show' }),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
    const lines = await history(w.kracht.id, w.bram.id);
    expect(lines).toHaveLength(2);
    // Both lines have the clock's one instant; the chain tells the order: the line from `booked`
    // is the first, and the other starts where it ended.
    const first = lines.find((line) => line.fromStatus === 'booked');
    const second = lines.find((line) => line !== first);
    expect(first).toBeDefined();
    expect(second?.fromStatus).toBe(first?.toStatus);
    expect(await statusOf(w, w.kracht.id, w.bram.id)).toBe(second?.toStatus);
  });

  it('AC13: other workspace 404 (Mike of Fit Studio), client account refused 403 (Lisa, who has a place in John’s Gym), anonymous 401', async () => {
    const w = await world();
    w.now('18:10');
    const calls = (who: { id: string } | undefined) => [
      list(w, w.kracht.id, who),
      put(w, w.kracht.id, w.bram.id, who, { status: 'attended' }),
      everyone(w, w.kracht.id, who),
    ];
    for (const answer of await Promise.all(calls(w.mike))) {
      expect(answer.status).toBe(404);
      expect(await answer.json()).toEqual({ code: 'not_found' });
    }
    // Lisa has a place in John's Gym (a client), so the platform answers 403 for a team route:
    // she has no access, and the workspace is hers to know about (E011).
    for (const answer of await Promise.all(calls(w.annaAccount))) {
      expect(answer.status).toBe(403);
      expect(await answer.json()).toEqual({ code: 'forbidden' });
    }
    for (const answer of await Promise.all(calls(undefined))) {
      expect(answer.status).toBe(401);
    }
    expect(await historySize(w.kracht.id)).toBe(0);

    // John's session in Fit Studio's own path is not found either (a session of another workspace).
    const crossed = await call(
      w.server,
      'GET',
      `/v1/workspaces/${w.other.id}/sessions/${w.kracht.id}/participants`,
      w.mike,
    );
    expect(crossed.status).toBe(404);
    // And a participant or session that does not exist.
    expect(
      (await put(w, w.kracht.id, crypto.randomUUID(), w.john, { status: 'attended' })).status,
    ).toBe(404);
    expect((await list(w, crypto.randomUUID(), w.john)).status).toBe(404);
  });

  it('AC14: participant lists carry name and status only (the client’s ID, display name and status)', async () => {
    const w = await world();
    const response = await list(w, w.kracht.id, w.sarah);
    expect(response.status).toBe(200);
    const text = await response.text();
    const shown = JSON.parse(text) as AttendanceBody;
    expect(shown.participants).toHaveLength(7);
    for (const participant of shown.participants) {
      expect(Object.keys(participant).sort()).toEqual(['clientId', 'name', 'status']);
    }
    expect(text).not.toContain('@example.com');
    // After a change the answer of the change has the same shape.
    w.now('18:10');
    const changed = await put(w, w.kracht.id, w.bram.id, w.sarah, { status: 'attended' });
    const changedText = await changed.text();
    expect(changedText).not.toContain('@example.com');
    for (const participant of (JSON.parse(changedText) as AttendanceBody).participants) {
      expect(Object.keys(participant).sort()).toEqual(['clientId', 'name', 'status']);
    }
  });

  it('lists a class date’s participants in the order they were added, with the counts', async () => {
    const w = await world();
    const shown = (await (await list(w, w.kracht.id, w.sarah)).json()) as AttendanceBody;
    expect(shown.type).toBe('group');
    expect(shown.status).toBe('scheduled');
    expect(shown.participants.map((participant) => participant.name)).toEqual([
      'Anna de Vries',
      'Bram Jansen',
      'Chris Bakker',
      'Daan Visser',
      'Eva Mulder',
      'Fleur Bos',
      'Mark Jansen',
    ]);
    expect(shown.summary).toEqual({ attended: 0, noShow: 0, open: 7, cancelled: 0 });
    // A class date without participants (M4 has no bookings): an empty list.
    const empty = await addSession(admin.db, {
      workspaceId: w.workspaceId,
      type: 'group',
      participant: false,
      startsAt: amsterdam('2026-09-23T18:00'),
    });
    const none = (await (await list(w, empty.id, w.john)).json()) as AttendanceBody;
    expect(none.participants).toEqual([]);
    expect(none.summary).toEqual({ attended: 0, noShow: 0, open: 0, cancelled: 0 });
  });

  it('refuses a status that attendance cannot set and a bad request, with nothing stored', async () => {
    const w = await world();
    w.now('10:05');
    const cancelled = await put(w, w.privateSession.id, w.anna.id, w.sarah, {
      status: 'cancelled',
    });
    expect(cancelled.status).toBe(400);
    expect((await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'late' })).status).toBe(
      400,
    );
    expect(
      (
        await call(
          w.server,
          'PUT',
          `${base(w, w.privateSession.id)}/${w.anna.id}/attendance`,
          w.sarah,
          {
            status: 'attended',
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          w.server,
          'PUT',
          `${base(w, w.privateSession.id)}/${w.anna.id}/attendance`,
          w.sarah,
          {
            status: 'attended',
            clientRequestId: 'not-a-uuid',
          },
        )
      ).status,
    ).toBe(400);
    // An app that names no surface: the history needs the source.
    const nameless = await put(
      w,
      w.privateSession.id,
      w.anna.id,
      w.sarah,
      { status: 'attended' },
      BEARER,
    );
    expect(nameless.status).toBe(400);
    expect(await nameless.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'surface', code: 'required' }],
    });
    expect(await historySize(w.privateSession.id)).toBe(0);
  });

  describe('Iedereen aanwezig', () => {
    /** Anna is no-show, Mark cancelled: of 7, five are open. */
    async function started() {
      const w = await world();
      w.now('18:10');
      expect((await put(w, w.kracht.id, w.anna.id, w.sarah, { status: 'no_show' })).status).toBe(
        200,
      );
      await admin.db
        .update(sessionParticipants)
        .set({ attendanceStatus: 'cancelled' })
        .where(eq(sessionParticipants.clientId, w.mark.id));
      return w;
    }

    it('moves the five still open to attended, one history row each, and leaves Anna and Mark as they are', async () => {
      const w = await started();
      const before = await historySize(w.kracht.id);
      w.now('18:12');
      const requestId = crypto.randomUUID();
      const response = await everyone(w, w.kracht.id, w.sarah, { clientRequestId: requestId });
      expect(response.status).toBe(200);
      const shown = (await response.json()) as AttendanceBody;
      expect(shown.summary).toEqual({ attended: 5, noShow: 1, open: 0, cancelled: 1 });
      const byName = Object.fromEntries(shown.participants.map((p) => [p.name, p.status]));
      expect(byName['Anna de Vries']).toBe('no_show');
      expect(byName['Mark Jansen']).toBe('cancelled');
      expect(byName['Bram Jansen']).toBe('attended');

      expect((await historySize(w.kracht.id)) - before).toBe(5);
      for (const client of [w.bram, w.chris, ...w.others]) {
        const lines = await history(w.kracht.id, client.id);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
          fromStatus: 'booked',
          toStatus: 'attended',
          changedAt: amsterdam(`${TUESDAY}T18:12`),
          actorTeamMemberId: w.sarahRole.id,
          source: 'web',
        });
        // The bulk's ID once per line: `{clientRequestId}:{participantId}`.
        expect(lines[0]?.clientRequestId?.startsWith(`${requestId}:`)).toBe(true);
      }
      // Anna has her one line from before and Mark none.
      expect(await history(w.kracht.id, w.anna.id)).toHaveLength(1);
      expect(await history(w.kracht.id, w.mark.id)).toHaveLength(0);
    });

    it('answers a replay of the same clientRequestId with the current list and changes nothing more', async () => {
      const w = await started();
      w.now('18:12');
      const requestId = crypto.randomUUID();
      expect((await everyone(w, w.kracht.id, w.sarah, { clientRequestId: requestId })).status).toBe(
        200,
      );
      const size = await historySize(w.kracht.id);
      // Bram is set back to open meanwhile; the replay must not mark him again.
      w.now('18:13');
      await put(w, w.kracht.id, w.bram.id, w.sarah, { status: 'booked' });
      const sizeAfterTap = await historySize(w.kracht.id);
      expect(sizeAfterTap).toBe(size + 1);
      const replay = await everyone(w, w.kracht.id, w.sarah, { clientRequestId: requestId });
      expect(replay.status).toBe(200);
      const shown = (await replay.json()) as AttendanceBody;
      expect(shown.summary).toEqual({ attended: 4, noShow: 1, open: 1, cancelled: 1 });
      expect(await historySize(w.kracht.id)).toBe(sizeAfterTap);
      // The same ID for a single change is no retry.
      const reused = await put(w, w.kracht.id, w.chris.id, w.sarah, {
        status: 'no_show',
        clientRequestId: requestId,
      });
      expect(reused.status).toBe(400);
    });

    it('@concurrency two copies of one request at once change each participant once', async () => {
      const w = await started();
      w.now('18:12');
      const requestId = crypto.randomUUID();
      const answers = await Promise.all(
        [1, 2].map(() => everyone(w, w.kracht.id, w.sarah, { clientRequestId: requestId })),
      );
      expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
      for (const client of [w.bram, w.chris, ...w.others]) {
        expect(await history(w.kracht.id, client.id)).toHaveLength(1);
      }
    });

    it('follows the rules of one change: another Trainer 403, before 17:30 422, a cancelled class 409', async () => {
      const w = await started();
      w.now('18:12');
      const tom = await everyone(w, w.kracht.id, w.tom);
      expect(tom.status).toBe(403);
      w.now('17:20');
      const early = await everyone(w, w.kracht.id, w.sarah);
      expect(early.status).toBe(422);
      expect(await early.json()).toEqual({
        code: 'attendance_too_early',
        opensAt: amsterdam(`${TUESDAY}T17:30`).toISOString(),
      });
      w.now('18:12');
      expect((await everyone(w, w.kracht.id, w.john)).status).toBe(200);
      const cancelledClass = await addSession(admin.db, {
        workspaceId: w.workspaceId,
        type: 'group',
        participant: false,
        status: 'cancelled',
        trainerProfileId: w.sarahProfile,
        startsAt: amsterdam(`${TUESDAY}T17:00`),
      });
      await addParticipants(admin.db, {
        workspaceId: w.workspaceId,
        session: cancelledClass,
        clients: [w.bram],
      });
      const cancelled = await everyone(w, cancelledClass.id, w.sarah);
      expect(cancelled.status).toBe(409);
      expect(await cancelled.json()).toEqual({ code: 'session_cancelled' });
      expect(await historySize(cancelledClass.id)).toBe(0);
    });

    it('is for a class date only, and an app must name its surface', async () => {
      const w = await started();
      w.now('18:12');
      expect((await everyone(w, w.privateSession.id, w.sarah)).status).toBe(404);
      const nameless = await everyone(w, w.kracht.id, w.sarah, {}, BEARER);
      expect(nameless.status).toBe(400);
      const ios = await everyone(w, w.kracht.id, w.sarah, { surface: 'ios' }, BEARER);
      expect(ios.status).toBe(200);
      const lines = await history(w.kracht.id, w.bram.id);
      expect(lines[0]?.source).toBe('ios');
    });

    it('does nothing and answers the list when nobody is open', async () => {
      const w = await world();
      w.now('18:10');
      const empty = await addSession(admin.db, {
        workspaceId: w.workspaceId,
        type: 'group',
        participant: false,
        trainerProfileId: w.sarahProfile,
        startsAt: amsterdam(`${TUESDAY}T18:00`),
      });
      const shown = (await (await everyone(w, empty.id, w.sarah)).json()) as AttendanceBody;
      expect(shown.participants).toEqual([]);
      expect(await historySize(empty.id)).toBe(0);
    });
  });

  describe('F025 events', () => {
    it('AC16: events carry no personal data: attendance_marked has the workspace ID, the platform, the session type and the new status only', async () => {
      const logs = (['log', 'info', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
      );
      const posthog = createProductEventCaptureTransport();
      const productEvents = createProductEvents({
        env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
        transport: posthog,
        errorReporter: createErrorReporter({ env: {} }),
      });
      const w = await world({ productEvents });
      const events = () => posthog.events.filter(({ event }) => event === 'attendance_marked');
      const properties = () =>
        events().map((event) =>
          Object.fromEntries(
            Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
          ),
        );

      // Too early, forbidden, cancelled participant and a bad request record nothing.
      w.now('08:00');
      await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'attended' });
      w.now('10:05');
      await put(w, w.privateSession.id, w.anna.id, w.tom, { status: 'attended' });
      await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'cancelled' });
      expect(events()).toEqual([]);

      // The web, then an app that names its surface.
      const clientRequestId = crypto.randomUUID();
      await put(w, w.privateSession.id, w.anna.id, w.sarah, {
        status: 'attended',
        clientRequestId,
      });
      // A retry and a status that is set already record nothing.
      await put(w, w.privateSession.id, w.anna.id, w.sarah, {
        status: 'attended',
        clientRequestId,
      });
      await put(w, w.privateSession.id, w.anna.id, w.sarah, { status: 'attended' });
      w.now('18:10');
      await put(
        w,
        w.kracht.id,
        w.bram.id,
        w.sarah,
        { status: 'no_show', surface: 'android' },
        BEARER,
      );
      expect(properties()).toEqual([
        {
          workspace_id: w.workspaceId,
          platform: 'web',
          session_type: 'private',
          status: 'attended',
        },
        {
          workspace_id: w.workspaceId,
          platform: 'android',
          session_type: 'group',
          status: 'no_show',
        },
      ]);

      // *Iedereen aanwezig*: one event for each participant it moved (six: Bram is no-show).
      await everyone(w, w.kracht.id, w.john, { surface: 'ios' }, BEARER);
      expect(events()).toHaveLength(2 + 6);
      expect(properties().slice(2)).toEqual(
        Array.from({ length: 6 }, () => ({
          workspace_id: w.workspaceId,
          platform: 'ios',
          session_type: 'group',
          status: 'attended',
        })),
      );
      expect(events()[0]?.distinct_id).toBe(w.sarah.id);
      expect(events()[2]?.distinct_id).toBe(w.john.id);
      const sent = JSON.stringify(events());
      for (const personal of [
        'Anna de Vries',
        'Bram Jansen',
        w.anna.id,
        w.bram.id,
        w.privateSession.id,
        w.kracht.id,
        w.sarah.email,
        '2026-09-22',
        clientRequestId,
      ]) {
        expect(sent).not.toContain(personal);
      }
      for (const log of logs) log.mockRestore();
    });
  });

  it('AC15: the routes are in the contract with their x-access', () => {
    const operations = {
      listSessionParticipants: ['get', 'clients.view'],
      setParticipantAttendance: ['put', 'attendance.mark.own'],
      markEveryoneAttended: ['post', 'attendance.mark.own'],
    } as const;
    for (const [operationId, [method, capability]] of Object.entries(operations)) {
      const found = Object.values(
        contract.paths as Record<string, Record<string, ContractOperation>>,
      )
        .flatMap((path) => Object.values(path))
        .find((operation) => operation?.operationId === operationId);
      if (!found) throw new Error(`${operationId} is not in the contract`);
      expect(found['x-access']).toMatchObject({
        type: 'workspace',
        capability,
        client: 'none',
      });
      expect(method).toBeTruthy();
    }
    const put =
      contract.paths[
        '/v1/workspaces/{workspaceId}/sessions/{sessionId}/participants/{clientId}/attendance'
      ].put;
    expect(Object.keys(put.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '409', '422']),
    );
  });

  it('AC12: a team member removed later leaves the history of what they marked', async () => {
    const w = await world();
    w.now('10:05');
    const mike = await createAccount(admin.db, { label: 'substitute' });
    const role = await addTeamRole(admin.db, { workspaceId: w.workspaceId, accountId: mike.id });
    await admin.db
      .update(sessions)
      .set({ trainerProfileId: await profileOf(role.id) })
      .where(eq(sessions.id, w.privateSession.id));
    expect(
      (await put(w, w.privateSession.id, w.anna.id, mike, { status: 'attended' })).status,
    ).toBe(200);
    // Removing the team member is not blocked by the lines they wrote, and the lines stay.
    const removed = await call(
      w.server,
      'DELETE',
      `/v1/workspaces/${w.workspaceId}/team-members/${role.id}`,
      w.john,
    );
    expect(removed.status).toBe(204);
    const lines = await history(w.privateSession.id, w.anna.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.actorTeamMemberId).toBe(role.id);
  });
});
