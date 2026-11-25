import { describe, expect, it, vi } from 'vitest';
import { setTrainerWord } from './trainer-word-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F068 TW-08 Woordkeuze client', () => {
  it('AC1, AC11: patches only the word on the workspace route of this site', async () => {
    const fetchFn = reply(200, { id: 'w1', trainerWord: 'instructeur' });

    const result = await setTrainerWord('w1', 'instructeur', fetchFn);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ trainerWord: 'instructeur' });
  });

  it.each([401, 403, 404])('AC10: a %s means this person may not set it', async (status) => {
    expect(await setTrainerWord('w1', 'coach', reply(status))).toEqual({
      ok: false,
      reason: 'home',
    });
  });

  it('any other answer is a generic failure', async () => {
    expect(await setTrainerWord('w1', 'coach', reply(500))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(await setTrainerWord('w1', 'coach', reply(422))).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await setTrainerWord('w1', 'coach', fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});
