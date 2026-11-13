import { describe, expect, it, vi } from 'vitest';
import {
  loadPlanningContext,
  planPrivateSession,
  reschedulePrivateSession,
} from './sessions-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const session = {
  id: 's1',
  type: 'private',
  status: 'scheduled',
  startsAt: '2026-09-24T07:00:00.000Z',
  endsAt: '2026-09-24T08:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 1,
  version: 1,
  location: {
    id: 'l1',
    name: "John's Gym",
    type: 'organization_location',
    address: null,
    isDefault: true,
  },
  participants: [{ clientId: 'c1', name: 'Anna de Vries', attendanceStatus: 'booked' }],
};

const input = {
  clientId: 'c1',
  localDate: '2026-09-24',
  localStart: '09:00',
  durationMinutes: 60,
  notify: true,
};

describe('F020 sessions client: planning', () => {
  it('AC1: posts the local date, start and length to the private sessions route of this site', async () => {
    const fetchFn = reply(201, {
      session,
      past: false,
      repeatedStart: false,
      confirmationEmail: true,
    });

    const result = await planPrivateSession('w1', input, fetchFn);

    expect(result).toEqual({ ok: true, session, past: false, confirmationEmail: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/sessions/private');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it('AC2: a trainer is sent only when one was chosen (a Trainer plans for themself)', async () => {
    const fetchFn = reply(201, {
      session,
      past: false,
      repeatedStart: false,
      confirmationEmail: false,
    });

    await planPrivateSession('w1', { ...input, trainerId: 't2' }, fetchFn);

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({ trainerId: 't2' });
  });

  it('AC5: a past session is saved and says so', async () => {
    const fetchFn = reply(201, {
      session,
      past: true,
      repeatedStart: false,
      confirmationEmail: false,
    });

    expect(await planPrivateSession('w1', input, fetchFn)).toMatchObject({
      ok: true,
      past: true,
      confirmationEmail: false,
    });
  });

  it('AC4: a start the clocks skip is worded on the start field', async () => {
    const fetchFn = reply(400, {
      code: 'validation_failed',
      issues: [{ path: 'localStart', code: 'time_does_not_exist' }],
    });

    expect(await planPrivateSession('w1', input, fetchFn)).toEqual({
      ok: false,
      reason: 'fields',
      start: 'timeDoesNotExist',
    });
  });

  it('a date that is none and a start that is no time are worded on their fields', async () => {
    const fetchFn = reply(400, {
      code: 'validation_failed',
      issues: [
        { path: 'localDate', code: 'invalid_format' },
        { path: 'localStart', code: 'invalid_format' },
      ],
    });

    expect(await planPrivateSession('w1', input, fetchFn)).toEqual({
      ok: false,
      reason: 'fields',
      date: 'invalidDate',
      start: 'invalidTime',
    });
  });

  it('AC2: a 403 means this person may not plan for that trainer, a 401 sends them home', async () => {
    expect(await planPrivateSession('w1', input, reply(403))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await planPrivateSession('w1', input, reply(401))).toEqual({
      ok: false,
      reason: 'home',
    });
  });

  it('any other answer is a generic failure, and no connection is its own', async () => {
    expect(await planPrivateSession('w1', input, reply(500))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(await planPrivateSession('w1', input, reply(404))).toEqual({
      ok: false,
      reason: 'generic',
    });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await planPrivateSession('w1', input, offline)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});

describe('F020 sessions client: rescheduling', () => {
  const move = {
    localDate: '2026-09-25',
    localStart: '10:00',
    durationMinutes: 60,
    notify: true,
    version: 1,
  };

  it('AC6: posts the new time and the version the person saw', async () => {
    const moved = { ...session, version: 2 };
    const fetchFn = reply(200, {
      session: moved,
      past: false,
      repeatedStart: false,
      changeEmail: true,
    });

    const result = await reschedulePrivateSession('w1', 's1', move, fetchFn);

    expect(result).toEqual({ ok: true, session: moved, past: false, changeEmail: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/sessions/s1/reschedule');
    expect(JSON.parse(String(init?.body))).toEqual(move);
  });

  it('AC8: a 409 brings the session as it is now and who changed it', async () => {
    const now = { ...session, version: 3 };
    const fetchFn = reply(409, {
      code: 'session_changed',
      session: now,
      changedBy: { name: 'Sarah' },
    });

    expect(await reschedulePrivateSession('w1', 's1', move, fetchFn)).toEqual({
      ok: false,
      reason: 'conflict',
      code: 'session_changed',
      session: now,
      changedBy: 'Sarah',
    });
  });

  it('AC8: a 409 without a name says nobody in particular', async () => {
    const fetchFn = reply(409, { code: 'session_changed', session });

    const result = await reschedulePrivateSession('w1', 's1', move, fetchFn);

    expect(result).toMatchObject({ ok: false, reason: 'conflict' });
    expect(result).not.toHaveProperty('changedBy');
  });

  it('AC7: a 403 is a refusal, the DST refusal sits on the start field', async () => {
    expect(await reschedulePrivateSession('w1', 's1', move, reply(403))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    const dst = reply(400, {
      code: 'validation_failed',
      issues: [{ path: 'localStart', code: 'time_does_not_exist' }],
    });
    expect(await reschedulePrivateSession('w1', 's1', move, dst)).toMatchObject({
      ok: false,
      reason: 'fields',
      start: 'timeDoesNotExist',
    });
  });
});

describe('F020 sessions client: the context of PS-01', () => {
  const answers: Record<string, unknown> = {
    '/api/v1/workspaces/w1': { id: 'w1', timeZone: 'Europe/Amsterdam', defaultLocale: 'nl-NL' },
    '/api/v1/workspaces/w1/locations': [
      { id: 'l2', name: 'Annex', isDefault: false },
      { id: 'l1', name: "John's Gym", isDefault: true },
    ],
    '/api/v1/workspaces/w1/trainers': [
      { id: 't1', name: 'John' },
      { id: 't2', name: 'Sarah' },
    ],
    '/api/v1/workspaces/w1/team-members': [
      { id: 't1', name: 'John', email: 'john@example.com', role: 'owner' },
      { id: 't2', name: 'Sarah', email: 'sarah@example.com', role: 'trainer' },
    ],
  };
  const routed = (overrides: Record<string, number> = {}) =>
    vi.fn<typeof fetch>((url) => {
      const key = String(url);
      return Promise.resolve(Response.json(answers[key] ?? {}, { status: overrides[key] ?? 200 }));
    });

  it('AC2: an Owner gets every trainer and finds their own place by their email address', async () => {
    const result = await loadPlanningContext(
      'w1',
      { forAnyTrainer: true, email: 'John@Example.com' },
      routed(),
    );

    expect(result).toEqual({
      ok: true,
      context: {
        timeZone: 'Europe/Amsterdam',
        defaultLocale: 'nl-NL',
        locationName: "John's Gym",
        trainers: answers['/api/v1/workspaces/w1/trainers'],
        myTrainerId: 't1',
      },
    });
  });

  it('AC2: a Trainer asks neither for the trainers nor for the team', async () => {
    const fetchFn = routed();

    const result = await loadPlanningContext(
      'w1',
      { forAnyTrainer: false, email: 'sarah@example.com' },
      fetchFn,
    );

    expect(result).toMatchObject({ ok: true, context: { trainers: [], myTrainerId: null } });
    expect(fetchFn.mock.calls.map(([url]) => String(url)).sort()).toEqual([
      '/api/v1/workspaces/w1',
      '/api/v1/workspaces/w1/locations',
    ]);
  });

  it('an Owner who does not train has no place among the trainers', async () => {
    const result = await loadPlanningContext(
      'w1',
      { forAnyTrainer: true, email: 'mike@example.com' },
      routed(),
    );

    expect(result).toMatchObject({ ok: true, context: { myTrainerId: null } });
  });

  it('a person who may not see the workspace goes home; any other failure is a failure', async () => {
    expect(
      await loadPlanningContext(
        'w1',
        { forAnyTrainer: false, email: 'a@example.com' },
        routed({ '/api/v1/workspaces/w1/locations': 403 }),
      ),
    ).toEqual({ ok: false, reason: 'home' });
    expect(
      await loadPlanningContext(
        'w1',
        { forAnyTrainer: false, email: 'a@example.com' },
        routed({ '/api/v1/workspaces/w1': 500 }),
      ),
    ).toEqual({ ok: false, reason: 'failed' });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(
      await loadPlanningContext('w1', { forAnyTrainer: false, email: 'a@example.com' }, offline),
    ).toEqual({ ok: false, reason: 'failed' });
  });
});
