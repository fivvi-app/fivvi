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

const markSession = {
  sessionId: 's2',
  type: 'private' as const,
  startsAt: '2026-10-08T07:00:00.000Z',
  endsAt: '2026-10-08T08:00:00.000Z',
  displayName: 'Mark Jansen',
  displayNameEn: null,
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

    expect(result).toEqual({ ok: true, session });
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

  it('F023 AC5: a 409 trainer_conflict hands the overlapping sessions to the form (PS-07)', async () => {
    const fetchFn = reply(409, { code: 'trainer_conflict', conflicts: [markSession] });

    expect(await planPrivateSession('w1', { ...input, trainerId: 't2' }, fetchFn)).toEqual({
      ok: false,
      reason: 'trainerConflict',
      conflicts: [markSession],
    });
  });

  it('F023 AC5: Toch opslaan sends the same request again with allowConflicts', async () => {
    const fetchFn = reply(201, {
      session,
      past: false,
      repeatedStart: false,
      confirmationEmail: false,
    });

    await planPrivateSession('w1', { ...input, trainerId: 't2', allowConflicts: true }, fetchFn);

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      ...input,
      trainerId: 't2',
      allowConflicts: true,
    });
  });

  it('F023: a 409 without any overlapping session is a generic failure, not an empty warning', async () => {
    expect(
      await planPrivateSession(
        'w1',
        input,
        reply(409, { code: 'trainer_conflict', conflicts: [] }),
      ),
    ).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('AC5: a past session is saved like any other (the form warned about it before)', async () => {
    const fetchFn = reply(201, {
      session,
      past: true,
      repeatedStart: false,
      confirmationEmail: false,
    });

    expect(await planPrivateSession('w1', input, fetchFn)).toEqual({ ok: true, session });
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

    expect(result).toEqual({ ok: true, session: moved });
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

  it('F023 AC5: a 409 trainer_conflict hands the overlapping sessions to the form (PS-07), not a changed session', async () => {
    const fetchFn = reply(409, { code: 'trainer_conflict', conflicts: [markSession] });

    expect(await reschedulePrivateSession('w1', 's1', move, fetchFn)).toEqual({
      ok: false,
      reason: 'trainerConflict',
      conflicts: [markSession],
    });
  });

  it('F023 AC5: Toch opslaan sends the same move again with allowConflicts, on the same version', async () => {
    const fetchFn = reply(200, { session: { ...session, version: 2 }, past: false });

    await reschedulePrivateSession('w1', 's1', { ...move, allowConflicts: true }, fetchFn);

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      ...move,
      allowConflicts: true,
    });
  });

  it('F023: a move without Toch opslaan does not send allowConflicts at all', async () => {
    const fetchFn = reply(200, { session: { ...session, version: 2 }, past: false });

    await reschedulePrivateSession('w1', 's1', move, fetchFn);

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).not.toHaveProperty(
      'allowConflicts',
    );
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
    // Two trainers with the same name: only the team-member ID tells them apart.
    '/api/v1/workspaces/w1/trainers': [
      { id: 't1', name: 'Sarah' },
      { id: 't2', name: 'Sarah' },
    ],
  };
  const routed = (overrides: Record<string, number> = {}) =>
    vi.fn<typeof fetch>((url) => {
      const key = String(url);
      return Promise.resolve(Response.json(answers[key] ?? {}, { status: overrides[key] ?? 200 }));
    });

  it('AC2: an Owner gets every trainer and finds their own place by their team-member ID', async () => {
    const result = await loadPlanningContext(
      'w1',
      { forAnyTrainer: true, teamMemberId: 't1' },
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

  it('F020 #1414 AC2: two trainers with the same name are told apart by the ID, and no team list is read', async () => {
    const fetchFn = routed();

    const second = await loadPlanningContext(
      'w1',
      { forAnyTrainer: true, teamMemberId: 't2' },
      fetchFn,
    );

    expect(second).toMatchObject({ ok: true, context: { myTrainerId: 't2' } });
    expect(fetchFn.mock.calls.map(([url]) => String(url))).not.toContain(
      '/api/v1/workspaces/w1/team-members',
    );
  });

  it('AC2: a Trainer asks neither for the trainers nor for the team', async () => {
    const fetchFn = routed();

    const result = await loadPlanningContext(
      'w1',
      { forAnyTrainer: false, teamMemberId: 't2' },
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
      { forAnyTrainer: true, teamMemberId: 'm-owner-without-profile' },
      routed(),
    );

    expect(result).toMatchObject({ ok: true, context: { myTrainerId: null } });
  });

  it('a person who may not see the workspace goes home; any other failure is a failure', async () => {
    expect(
      await loadPlanningContext(
        'w1',
        { forAnyTrainer: false, teamMemberId: 'm1' },
        routed({ '/api/v1/workspaces/w1/locations': 403 }),
      ),
    ).toEqual({ ok: false, reason: 'home' });
    expect(
      await loadPlanningContext(
        'w1',
        { forAnyTrainer: false, teamMemberId: 'm1' },
        routed({ '/api/v1/workspaces/w1': 500 }),
      ),
    ).toEqual({ ok: false, reason: 'failed' });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(
      await loadPlanningContext('w1', { forAnyTrainer: false, teamMemberId: 'm1' }, offline),
    ).toEqual({ ok: false, reason: 'failed' });
  });
});
