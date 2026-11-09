import { describe, expect, it, vi } from 'vitest';
import { setTrainsHere } from './trains-here-client';

const reply = (status: number) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      status === 204 ? new Response(null, { status }) : Response.json({}, { status }),
    ),
  );

describe('F005 TW-09 trains-here client', () => {
  it('AC4: switching on puts the trainer profile on the route of this workspace', async () => {
    const fetchFn = reply(200);

    expect(await setTrainsHere('w1', true, fetchFn)).toEqual({ ok: true });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/trainer-profile');
    expect(init?.method).toBe('PUT');
  });

  it('AC4: switching off deletes it', async () => {
    const fetchFn = reply(204);

    expect(await setTrainsHere('w1', false, fetchFn)).toEqual({ ok: true });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/trainer-profile');
    expect(init?.method).toBe('DELETE');
  });

  it('a 401 means the sign-in ended', async () => {
    expect(await setTrainsHere('w1', true, reply(401))).toEqual({
      ok: false,
      reason: 'signedOut',
    });
  });

  it.each([403, 404, 500])(
    'AC5: a %s is a failure, and the page shows what the API holds',
    async (status) => {
      expect(await setTrainsHere('w1', true, reply(status))).toEqual({
        ok: false,
        reason: 'generic',
      });
    },
  );

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await setTrainsHere('w1', true, fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});
