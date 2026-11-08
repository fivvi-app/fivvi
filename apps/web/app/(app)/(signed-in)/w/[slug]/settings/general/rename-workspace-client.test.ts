import { describe, expect, it, vi } from 'vitest';
import { renameWorkspace } from './rename-workspace-client';

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const validation = (...issues: { path: string; code: string }[]) => ({
  code: 'validation_failed',
  issues,
});

describe('F002 TW-08 rename-workspace client', () => {
  it('AC6: patches the name of the workspace on the workspace route of this site', async () => {
    const fetchFn = reply(200, { id: 'w1', name: "John's Gym Utrecht", slug: 'johns-gym' });

    const result = await renameWorkspace('w1', "John's Gym Utrecht", fetchFn);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ name: "John's Gym Utrecht" });
  });

  it.each([
    ['too_small', 'nameRequired'],
    ['invalid_type', 'nameRequired'],
    ['too_big', 'nameTooLong'],
  ])('AC3: the API refuses the name with %s: %s', async (code, error) => {
    const result = await renameWorkspace('w1', '', reply(400, validation({ path: 'name', code })));

    expect(result).toEqual({ ok: false, reason: 'name', error });
  });

  it.each([401, 403, 404])('a %s means this person may not rename it', async (status) => {
    const result = await renameWorkspace('w1', 'Gym', reply(status, { code: 'forbidden' }));

    expect(result).toEqual({ ok: false, reason: 'home' });
  });

  it('any other answer is a generic failure', async () => {
    expect(await renameWorkspace('w1', 'Gym', reply(500, {}))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(await renameWorkspace('w1', 'Gym', reply(400, validation()))).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await renameWorkspace('w1', 'Gym', fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});
