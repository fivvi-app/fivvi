import { describe, expect, it, vi } from 'vitest';
import {
  assignTrainer,
  loadAssignSubject,
  loadTrainerCandidates,
} from './trainer-assignment-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const session = {
  id: 's1',
  type: 'group',
  status: 'scheduled',
  startsAt: '2026-09-24T17:15:00.000Z',
  endsAt: '2026-09-24T18:15:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 10,
  version: 2,
  location: {
    id: 'l1',
    name: "John's Gym",
    type: 'organization_location',
    address: null,
    isDefault: true,
  },
  trainer: { id: 'tom', name: 'Tom' },
  participants: [],
};

const candidates = {
  sessionId: 's1',
  trainers: [
    { id: 'tom', name: 'Tom', conflicts: [], laterConflictingDates: 0 },
    {
      id: 'mike',
      name: 'Mike',
      conflicts: [
        {
          sessionId: 's9',
          type: 'private',
          startsAt: '2026-10-06T16:30:00.000Z',
          endsAt: '2026-10-06T17:30:00.000Z',
          displayName: 'Anna de Vries',
          displayNameEn: null,
        },
      ],
      laterConflictingDates: 2,
    },
  ],
  participantsToNotify: { forThisDate: 1, forFollowingDates: 2 },
};

describe('F023 trainer assignment client: the candidates', () => {
  it('AC3: reads the trainers, their conflicts and who would be told from the candidates route of this site', async () => {
    const fetchFn = reply(200, candidates);

    const result = await loadTrainerCandidates('w1', 's1', fetchFn);

    expect(result).toEqual({ ok: true, candidates });
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/v1/workspaces/w1/sessions/s1/trainer-candidates');
  });

  it.each([401, 403, 404])('a %s means this person may not assign (any more)', async (status) => {
    expect(await loadTrainerCandidates('w1', 's1', reply(status))).toEqual({
      ok: false,
      reason: 'home',
    });
  });

  it('any other answer, and a lost connection, are a failure to load', async () => {
    expect(await loadTrainerCandidates('w1', 's1', reply(500))).toEqual({
      ok: false,
      reason: 'failed',
    });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await loadTrainerCandidates('w1', 's1', offline)).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('F023 trainer assignment client: assigning', () => {
  const input = { trainerId: 'mike', scope: 'following' as const, version: 2, notifyClients: true };

  it('AC1, AC2: posts the trainer, the scope, the version and the notify box to the trainer route of this site', async () => {
    const fetchFn = reply(200, { session, clientsNotified: 2, keptDates: 1 });

    const result = await assignTrainer('w1', 's1', input, fetchFn);

    expect(result).toEqual({ ok: true, session, clientsNotified: 2 });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/sessions/s1/trainer');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      trainerId: 'mike',
      scope: 'following',
      version: 2,
      notifyClients: true,
    });
  });

  it('AC8: a private session sends no scope, and an unchecked box is sent as false', async () => {
    const fetchFn = reply(200, { session, clientsNotified: 0, keptDates: 0 });

    await assignTrainer(
      'w1',
      's1',
      { trainerId: 'tom', version: 1, notifyClients: false },
      fetchFn,
    );

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      trainerId: 'tom',
      version: 1,
      notifyClients: false,
    });
  });

  it('AC5: Toch opslaan sends the same request again with allowConflicts', async () => {
    const fetchFn = reply(200, { session, clientsNotified: 0, keptDates: 0 });

    await assignTrainer('w1', 's1', { ...input, allowConflicts: true }, fetchFn);

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
      allowConflicts: true,
    });
  });

  it('AC7: a 409 trainer_conflict carries the overlapping sessions for PS-07', async () => {
    const conflicts = candidates.trainers[1]?.conflicts;
    const result = await assignTrainer(
      'w1',
      's1',
      input,
      reply(409, { code: 'trainer_conflict', conflicts }),
    );

    expect(result).toEqual({ ok: false, reason: 'trainerConflict', conflicts });
  });

  it('AC13: a 409 session_changed carries the session as it is now and who changed it', async () => {
    const result = await assignTrainer(
      'w1',
      's1',
      input,
      reply(409, { code: 'session_changed', session, changedBy: { name: 'John' } }),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'conflict',
      code: 'session_changed',
      session,
      changedBy: 'John',
    });
  });

  it('a 409 session_cancelled is its own conflict', async () => {
    const result = await assignTrainer(
      'w1',
      's1',
      input,
      reply(409, { code: 'session_cancelled', session }),
    );

    expect(result).toMatchObject({ ok: false, reason: 'conflict', code: 'session_cancelled' });
  });

  it('AC12, AC13: a 403 is forbidden, a 401 sends the person home', async () => {
    expect(await assignTrainer('w1', 's1', input, reply(403))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await assignTrainer('w1', 's1', input, reply(401))).toEqual({
      ok: false,
      reason: 'home',
    });
  });

  it('a 404 (a trainer or session that is gone), a 400 and a lost connection are failures', async () => {
    expect(await assignTrainer('w1', 's1', input, reply(404))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(await assignTrainer('w1', 's1', input, reply(400))).toEqual({
      ok: false,
      reason: 'generic',
    });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await assignTrainer('w1', 's1', input, offline)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});

describe('F023 trainer assignment client: the session of a dialog opened from the calendar', () => {
  const mark = { id: 'c1', name: 'Mark Jansen', email: 'mark@example.com', emailLocale: 'en' };
  const privateSession = {
    ...session,
    id: 's2',
    type: 'private',
    participants: [{ clientId: 'c1', name: 'Mark Jansen', attendanceStatus: 'booked' }],
  };
  /** Answers each route of this site with what it holds. */
  const routes = (answers: Record<string, { status: number; body: unknown }>) =>
    vi.fn<typeof fetch>((input) => {
      const found = answers[String(input)];
      return Promise.resolve(Response.json(found?.body ?? {}, { status: found?.status ?? 404 }));
    });

  it('WC-03: a class date is its session alone', async () => {
    const fetchFn = routes({ '/api/v1/workspaces/w1/sessions/s1': { status: 200, body: session } });

    expect(await loadAssignSubject('w1', 's1', fetchFn)).toEqual({ ok: true, session });
  });

  it('WC-03: a private session comes with its client, in the client’s email language else the workspace’s', async () => {
    const fetchFn = routes({
      '/api/v1/workspaces/w1/sessions/s2': { status: 200, body: privateSession },
      '/api/v1/workspaces/w1/clients/c1': { status: 200, body: mark },
      '/api/v1/workspaces/w1': { status: 200, body: { defaultLocale: 'nl-NL' } },
    });

    expect(await loadAssignSubject('w1', 's2', fetchFn)).toEqual({
      ok: true,
      session: privateSession,
      client: { name: 'Mark Jansen', email: 'mark@example.com', emailLocale: 'en' },
    });
    const anna = routes({
      '/api/v1/workspaces/w1/sessions/s2': { status: 200, body: privateSession },
      '/api/v1/workspaces/w1/clients/c1': { status: 200, body: { ...mark, emailLocale: null } },
      '/api/v1/workspaces/w1': { status: 200, body: { defaultLocale: 'nl-NL' } },
    });
    expect(await loadAssignSubject('w1', 's2', anna)).toMatchObject({
      client: { emailLocale: 'nl-NL' },
    });
  });

  it('a session that is gone, a 401 and a failure to load', async () => {
    expect(await loadAssignSubject('w1', 's1', routes({}))).toEqual({ ok: false, reason: 'home' });
    expect(
      await loadAssignSubject(
        'w1',
        's1',
        routes({ '/api/v1/workspaces/w1/sessions/s1': { status: 500, body: {} } }),
      ),
    ).toEqual({ ok: false, reason: 'failed' });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await loadAssignSubject('w1', 's1', offline)).toEqual({ ok: false, reason: 'failed' });
  });
});
