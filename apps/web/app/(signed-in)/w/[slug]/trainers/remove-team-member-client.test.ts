import { describe, expect, it, vi } from 'vitest';
import { removeTeamMember } from './remove-team-member-client';

const reply = (status: number) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      status === 204 ? new Response(null, { status }) : Response.json({}, { status }),
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
