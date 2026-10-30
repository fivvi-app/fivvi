import { describe, expect, it, vi } from 'vitest';
import { saveName } from './save-name-client';

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const validation = (...issues: { path: string; code: string }[]) => ({
  code: 'validation_failed',
  issues,
});

describe('F005 TW-09 save-name client', () => {
  it('AC1: patches the name on the account route of this site', async () => {
    const fetchFn = reply(200, { name: 'Sarah de Vries' });

    const result = await saveName('Sarah de Vries', fetchFn);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/me');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Sarah de Vries' });
  });

  it.each([
    ['too_small', 'nameRequired'],
    ['invalid_type', 'nameRequired'],
    ['too_big', 'nameTooLong'],
  ])('AC1: the API refuses the name with %s: %s', async (code, error) => {
    const result = await saveName('', reply(400, validation({ path: 'name', code })));

    expect(result).toEqual({ ok: false, reason: 'name', error });
  });

  it('a 401 means the sign-in ended', async () => {
    expect(await saveName('Sarah', reply(401, { code: 'not_signed_in' }))).toEqual({
      ok: false,
      reason: 'signedOut',
    });
  });

  it('any other answer is a generic failure', async () => {
    expect(await saveName('Sarah', reply(500, {}))).toEqual({ ok: false, reason: 'generic' });
    expect(await saveName('Sarah', reply(400, validation()))).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await saveName('Sarah', fetchFn)).toEqual({ ok: false, reason: 'noConnection' });
  });
});
