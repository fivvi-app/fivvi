import { describe, expect, it, vi } from 'vitest';
import { createWorkspace } from './create-workspace-client';

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const validation = (...issues: { path: string; code: string }[]) => ({
  code: 'validation_failed',
  issues,
});

describe('F002 TW-11 create-workspace client', () => {
  it('AC1: posts the names to the workspaces route of this site and returns the new slug', async () => {
    const fetchFn = reply(201, { id: 'w1', name: "John's Gym", slug: 'johns-gym' });

    const result = await createWorkspace({ name: "John's Gym", personName: 'Sarah' }, fetchFn);

    expect(result).toEqual({ ok: true, slug: 'johns-gym' });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ name: "John's Gym", personName: 'Sarah' });
  });

  it('leaves the person’s name out when the account has one', async () => {
    const fetchFn = reply(201, { id: 'w1', name: 'Gym', slug: 'gym' });

    await createWorkspace({ name: 'Gym' }, fetchFn);

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({ name: 'Gym' });
  });

  it.each([
    ['too_small', 'workspaceNameRequired'],
    ['invalid_type', 'workspaceNameRequired'],
    ['too_big', 'workspaceNameTooLong'],
  ])('AC3: the API refuses the workspace name with %s: %s', async (code, error) => {
    const result = await createWorkspace(
      { name: '' },
      reply(400, validation({ path: 'name', code })),
    );

    expect(result).toEqual({ ok: false, reason: 'fields', fields: { name: error } });
  });

  it.each([
    ['too_small', 'personNameRequired'],
    ['too_big', 'personNameTooLong'],
  ])('AC3: the API refuses the person’s name with %s: %s', async (code, error) => {
    const result = await createWorkspace(
      { name: 'Gym', personName: '' },
      reply(400, validation({ path: 'personName', code })),
    );

    expect(result).toEqual({ ok: false, reason: 'fields', fields: { personName: error } });
  });

  it('AC3: both names can be wrong at once', async () => {
    const result = await createWorkspace(
      { name: '', personName: '' },
      reply(
        400,
        validation({ path: 'name', code: 'too_small' }, { path: 'personName', code: 'too_big' }),
      ),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'fields',
      fields: { name: 'workspaceNameRequired', personName: 'personNameTooLong' },
    });
  });

  it('is a general error for a 400 that names no field it knows', async () => {
    const result = await createWorkspace(
      { name: 'Gym' },
      reply(400, validation({ path: 'other', code: 'too_small' })),
    );

    expect(result).toEqual({ ok: false, reason: 'generic' });
  });

  it('AC4: a 403 means the account may not (or no longer) set one up: it goes to the signed-in home', async () => {
    expect(await createWorkspace({ name: 'Gym' }, reply(403, { code: 'forbidden' }))).toEqual({
      ok: false,
      reason: 'home',
    });
  });

  it('a 401 sends the person to the signed-in home too, which sends them to sign-in', async () => {
    expect(await createWorkspace({ name: 'Gym' }, reply(401, { code: 'not_signed_in' }))).toEqual({
      ok: false,
      reason: 'home',
    });
  });

  it('says there is no connection when the request does not get through', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await createWorkspace({ name: 'Gym' }, fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });

  it('is a general error for a server error or an answer it cannot read', async () => {
    expect(await createWorkspace({ name: 'Gym' }, reply(500, 'Internal Server Error'))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(await createWorkspace({ name: 'Gym' }, reply(201, { unexpected: true }))).toEqual({
      ok: false,
      reason: 'generic',
    });
  });
});
