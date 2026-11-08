import { describe, expect, it, vi } from 'vitest';
import { signOut } from './sign-out-client';

const reply = (status: number, body: unknown = { success: true }) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F001 AC12 sign-out client', () => {
  it('posts to the sign-out endpoint of this site, which ends only the session of the cookie', async () => {
    const fetchFn = reply(200);

    expect(await signOut(fetchFn)).toEqual({ ok: true });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/sign-out');
    expect(init?.method).toBe('POST');
  });

  it('says it failed on an error answer', async () => {
    expect(await signOut(reply(500, { message: 'x' }))).toEqual({ ok: false });
  });

  it('says it failed when there is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await signOut(fetchFn)).toEqual({ ok: false });
  });
});
