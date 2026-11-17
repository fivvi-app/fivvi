import { describe, expect, it, vi } from 'vitest';
import { renewJoinLink } from './renew-join-link-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F029 renew-join-link client', () => {
  it('AC6: posts to the renew route of this workspace, with no body, and returns the new URL', async () => {
    const fetchFn = reply(200, { url: 'https://fivvi.app/j/7KQ2M9XA', renewedAt: null });

    const result = await renewJoinLink('w1', fetchFn);

    expect(result).toEqual({ ok: true, url: 'https://fivvi.app/j/7KQ2M9XA' });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/join-link/renew');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
  });

  it.each([401, 403, 404])('a %s means this person may not renew it (any more)', async (status) => {
    expect(await renewJoinLink('w1', reply(status))).toEqual({ ok: false, reason: 'home' });
  });

  it('any other answer is a generic failure', async () => {
    expect(await renewJoinLink('w1', reply(500))).toEqual({ ok: false, reason: 'generic' });
  });

  it('an answer without the URL is a generic failure', async () => {
    expect(await renewJoinLink('w1', reply(200, {}))).toEqual({ ok: false, reason: 'generic' });
  });

  it('no connection is its own failure', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await renewJoinLink('w1', fetchFn)).toEqual({ ok: false, reason: 'noConnection' });
  });
});
