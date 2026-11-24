import { describe, expect, it, vi } from 'vitest';
import {
  loadFutureSessions,
  removeTeamMember,
  removeWithHandover,
} from './remove-team-member-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      status === 204 ? new Response(null, { status }) : Response.json(body, { status }),
    ),
  );

describe('F003 TW-06 remove-team-member client', () => {
  it('AC4: deletes the team member on the team-member route of this site', async () => {
    const fetchFn = reply(204);

    const result = await removeTeamMember('w1', 'tm1', fetchFn);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/team-members/tm1');
    expect(init?.method).toBe('DELETE');
  });

  it.each([401, 403, 404])(
    'a %s means this person may not remove anyone (any more)',
    async (status) => {
      expect(await removeTeamMember('w1', 'tm1', reply(status))).toEqual({
        ok: false,
        reason: 'home',
      });
    },
  );

  it('AC7: a 409 (the last Owner) and any other answer are a generic failure', async () => {
    for (const status of [409, 500]) {
      expect(await removeTeamMember('w1', 'tm1', reply(status))).toEqual({
        ok: false,
        reason: 'generic',
      });
    }
  });

  it('no connection is its own failure', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await removeTeamMember('w1', 'tm1', fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});

// F023 (spec #459, ticket #540): the handover when a trainer with sessions in the coming weeks is removed.
const future = {
  teamMemberId: 'tm1',
  nextTwoWeeks: { privateSessions: 3, classDates: 4 },
  later: { privateSessions: 2, classDates: 6 },
  regularTrainerOfSeries: true,
  hasFutureSessions: true,
};

describe('F023 TW-06 the handover: what the trainer has coming', () => {
  it('AC9: reads the counts of the next 2 weeks and of the sessions after them from the future-sessions route', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(future)));

    const result = await loadFutureSessions('w1', 'tm1', fetchFn);

    expect(result).toEqual({ ok: true, future });
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      '/api/v1/workspaces/w1/team-members/tm1/future-sessions',
    );
  });

  it.each([401, 403, 404])(
    'a %s means this person may not remove anyone (any more)',
    async (status) => {
      expect(await loadFutureSessions('w1', 'tm1', reply(status))).toEqual({
        ok: false,
        reason: 'home',
      });
    },
  );

  it('any other answer, and a lost connection, are a failure to load', async () => {
    expect(await loadFutureSessions('w1', 'tm1', reply(500))).toEqual({
      ok: false,
      reason: 'failed',
    });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await loadFutureSessions('w1', 'tm1', offline)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('F023 TW-06 the handover: removing with it', () => {
  const handover = { privateTo: 'tom', classesTo: null, notifyClients: true };
  const done = {
    nextTwoWeeks: {
      privateHandedOver: 3,
      privateCancelled: 0,
      classesHandedOver: 0,
      classesTrainerNeeded: 4,
    },
    later: { privateTrainerNeeded: 2, classesTrainerNeeded: 6 },
  };

  it('AC9: sends who takes the private sessions, who takes the classes and the notify box, and answers with what changed', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(done)));

    const result = await removeWithHandover('w1', 'tm1', handover, fetchFn);

    expect(result).toEqual({ ok: true, handover: done });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/team-members/tm1');
    expect(init?.method).toBe('DELETE');
    expect(JSON.parse(String(init?.body))).toEqual(handover);
  });

  it('AC9a: Niemand for the private sessions is sent as null', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(done)));

    await removeWithHandover(
      'w1',
      'tm1',
      { privateTo: null, classesTo: null, notifyClients: false },
      fetchFn,
    );

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      privateTo: null,
      classesTo: null,
      notifyClients: false,
    });
  });

  it('a removal without a handover for a trainer with sessions comes back with the counts, to ask for one', async () => {
    const refusal = {
      code: 'has_future_sessions',
      nextTwoWeeks: future.nextTwoWeeks,
      later: future.later,
      regularTrainerOfSeries: true,
    };

    expect(await removeTeamMember('w1', 'tm1', reply(409, refusal))).toEqual({
      ok: false,
      reason: 'hasFutureSessions',
      future: { ...future, teamMemberId: 'tm1' },
    });
  });

  it('a handover to someone who is not a trainer here (422) and a 409 for the last Owner are failures', async () => {
    expect(await removeWithHandover('w1', 'tm1', handover, reply(422))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(
      await removeWithHandover('w1', 'tm1', handover, reply(409, { code: 'last_owner' })),
    ).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('a 401, 403 or 404 sends the person home', async () => {
    expect(await removeWithHandover('w1', 'tm1', handover, reply(403))).toEqual({
      ok: false,
      reason: 'home',
    });
  });
});
