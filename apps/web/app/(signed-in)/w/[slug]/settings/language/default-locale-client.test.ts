import { describe, expect, it, vi } from 'vitest';
import { setDefaultLocale } from './default-locale-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F010 TW-08 default-language client', () => {
  it('AC7: patches only the default language on the workspace route of this site', async () => {
    const fetchFn = reply(200, { id: 'w1', defaultLocale: 'en' });

    const result = await setDefaultLocale('w1', 'en', fetchFn);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ defaultLocale: 'en' });
  });

  it.each([401, 403, 404])('AC8, AC9: a %s means this person may not set it', async (status) => {
    expect(await setDefaultLocale('w1', 'en', reply(status))).toEqual({
      ok: false,
      reason: 'home',
    });
  });

  it('any other answer is a generic failure', async () => {
    expect(await setDefaultLocale('w1', 'en', reply(500))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(await setDefaultLocale('w1', 'en', reply(400))).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await setDefaultLocale('w1', 'en', fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});
