import { describe, expect, it, vi } from 'vitest';
import { answerInvitation } from './invitation-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F011 invitation page client', () => {
  it('AC3: accepting posts to the accept route of the token and gives the workspace to open', async () => {
    const fetchFn = reply(200, { workspaceId: 'w1', slug: 'johns-gym', name: "John's Gym" });

    const result = await answerInvitation('tok-en_1', 'accept', fetchFn);

    expect(result).toEqual({ ok: true, answer: 'accept', slug: 'johns-gym' });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/invitations/tok-en_1/accept');
    expect(init?.method).toBe('POST');
  });

  it('AC5: declining posts to the decline route and has no workspace', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));

    expect(await answerInvitation('tok', 'decline', fetchFn)).toEqual({
      ok: true,
      answer: 'decline',
    });
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/v1/invitations/tok/decline');
  });

  it('AC6: a 403 is the wrong account, a 404 an invitation that is no longer valid, a 401 sign-in', async () => {
    expect(await answerInvitation('tok', 'accept', reply(403))).toEqual({
      ok: false,
      reason: 'wrongAccount',
    });
    expect(await answerInvitation('tok', 'decline', reply(404))).toEqual({
      ok: false,
      reason: 'noLongerValid',
    });
    expect(await answerInvitation('tok', 'accept', reply(401))).toEqual({
      ok: false,
      reason: 'signIn',
    });
  });

  it('an accept that answers without a workspace, any other answer and no connection fail', async () => {
    expect(await answerInvitation('tok', 'accept', reply(200, {}))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(await answerInvitation('tok', 'accept', reply(500))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(
      await answerInvitation(
        'tok',
        'accept',
        vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
      ),
    ).toEqual({ ok: false, reason: 'noConnection' });
  });

  it('puts the token in the path as one segment', async () => {
    const fetchFn = reply(404);

    await answerInvitation('a/b?c', 'accept', fetchFn);

    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/v1/invitations/a%2Fb%3Fc/accept');
  });
});
