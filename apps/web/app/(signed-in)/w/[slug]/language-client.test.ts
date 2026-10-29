import { describe, expect, it, vi } from 'vitest';
import { saveLanguage } from './language-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F010 language client', () => {
  it('AC1: patches the account with the chosen language', async () => {
    const fetchFn = reply(200);

    expect(await saveLanguage('en', fetchFn)).toEqual({ ok: true });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/me');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ preferredLocale: 'en' });
  });

  it.each([
    ['a refusal', reply(400, { code: 'validation_failed', issues: [] })],
    ['no sign-in', reply(401, { code: 'not_signed_in' })],
    ['a server error', reply(500, 'Internal Server Error')],
  ])('says it was not saved on %s', async (_, fetchFn) => {
    expect(await saveLanguage('nl-NL', fetchFn)).toEqual({ ok: false });
  });

  it('says it was not saved without a connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await saveLanguage('en', fetchFn)).toEqual({ ok: false });
  });
});
