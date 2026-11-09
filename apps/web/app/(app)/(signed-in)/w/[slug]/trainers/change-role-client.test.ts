import { describe, expect, it, vi } from 'vitest';
import { changeTeamMemberRole } from './change-role-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F004 TW-06 change-role client', () => {
  it('AC4: patches the role on the team-member route of this site', async () => {
    const fetchFn = reply(200, { id: 'tm1', role: 'owner' });

    const result = await changeTeamMemberRole('w1', 'tm1', 'owner', fetchFn);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/team-members/tm1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ role: 'owner' });
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('AC5: a 409 with the code last_owner is its own failure', async () => {
    expect(
      await changeTeamMemberRole('w1', 'tm1', 'trainer', reply(409, { code: 'last_owner' })),
    ).toEqual({ ok: false, reason: 'lastOwner' });
  });

  it.each([401, 403, 404])(
    'a %s means this person may not change roles (any more)',
    async (status) => {
      expect(await changeTeamMemberRole('w1', 'tm1', 'owner', reply(status))).toEqual({
        ok: false,
        reason: 'home',
      });
    },
  );

  it('any other answer is a generic failure', async () => {
    for (const status of [400, 500]) {
      expect(await changeTeamMemberRole('w1', 'tm1', 'owner', reply(status))).toEqual({
        ok: false,
        reason: 'generic',
      });
    }
  });

  it('no connection is its own failure', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await changeTeamMemberRole('w1', 'tm1', 'owner', fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});
