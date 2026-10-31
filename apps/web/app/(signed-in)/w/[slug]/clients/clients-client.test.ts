import { describe, expect, it, vi } from 'vitest';
import { addClient, findExistingClient, searchClients } from './clients-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const anna = { id: 'c1', name: 'Anna de Vries', email: 'anna@example.com', emailLocale: null };

describe('F006 TW-01 clients client: search', () => {
  it('AC6: asks the clients route of this site, with the search text and the biggest page', async () => {
    const fetchFn = reply(200, { items: [anna], total: 1 });

    const result = await searchClients('w1', 'vrie & co', fetchFn);

    expect(result).toEqual({ ok: true, items: [anna], total: 1 });
    const [url] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/clients?search=vrie+%26+co&pageSize=100');
  });

  it('a blank search is no search', async () => {
    const fetchFn = reply(200, { items: [], total: 0 });

    await searchClients('w1', '   ', fetchFn);

    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/v1/workspaces/w1/clients?pageSize=100');
  });

  it.each([401, 403, 404])(
    'a %s means this person may not see the clients (any more)',
    async (status) => {
      expect(await searchClients('w1', '', reply(status))).toEqual({ ok: false, reason: 'home' });
    },
  );

  it('any other answer is a generic failure, and no connection is its own', async () => {
    expect(await searchClients('w1', '', reply(500))).toEqual({ ok: false, reason: 'generic' });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await searchClients('w1', '', offline)).toEqual({ ok: false, reason: 'noConnection' });
  });
});

describe('F006 TW-01 clients client: add', () => {
  it('AC1: posts the name only when nothing else was filled in', async () => {
    const mark = { id: 'c2', name: 'Mark Jansen', email: null, emailLocale: null };
    const fetchFn = reply(201, mark);

    const result = await addClient(
      'w1',
      { name: 'Mark Jansen', email: '', emailLocale: '' },
      fetchFn,
    );

    expect(result).toEqual({ ok: true, client: mark });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/clients');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Mark Jansen' });
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('AC2: posts the address and the language when they were chosen', async () => {
    const fetchFn = reply(201, anna);

    await addClient(
      'w1',
      { name: 'Anna', email: ' Anna@Example.com ', emailLocale: 'en' },
      fetchFn,
    );

    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      name: 'Anna',
      email: 'Anna@Example.com',
      emailLocale: 'en',
    });
  });

  it('AC2: words the refused fields from the API’s validation codes, checking nothing itself', async () => {
    const refuse = (...issues: { path: string; code: string }[]) =>
      reply(400, { code: 'validation_failed', issues });
    const input = { name: '', email: '', emailLocale: '' } as const;

    expect(await addClient('w1', input, refuse({ path: 'name', code: 'too_small' }))).toEqual({
      ok: false,
      reason: 'fields',
      name: 'nameRequired',
    });
    expect(await addClient('w1', input, refuse({ path: 'name', code: 'too_big' }))).toEqual({
      ok: false,
      reason: 'fields',
      name: 'nameTooLong',
    });
    expect(
      await addClient(
        'w1',
        input,
        refuse({ path: 'name', code: 'too_small' }, { path: 'email', code: 'invalid_format' }),
      ),
    ).toEqual({ ok: false, reason: 'fields', name: 'nameRequired', email: 'emailInvalid' });
  });

  it('AC3: a 409 client_exists carries the existing client’s ID', async () => {
    expect(
      await addClient(
        'w1',
        { name: 'Anna', email: 'anna@example.com', emailLocale: '' },
        reply(409, { code: 'client_exists', clientId: 'c1' }),
      ),
    ).toEqual({ ok: false, reason: 'exists', clientId: 'c1' });
  });

  it.each([401, 403, 404])(
    'a %s means this person may not add clients (any more)',
    async (status) => {
      expect(
        await addClient('w1', { name: 'A', email: '', emailLocale: '' }, reply(status)),
      ).toEqual({ ok: false, reason: 'home' });
    },
  );

  it('a 400 naming no field, a 500 and a 409 without the code are generic failures', async () => {
    const input = { name: 'A', email: '', emailLocale: '' } as const;
    for (const response of [
      reply(400, { code: 'validation_failed', issues: [] }),
      reply(500),
      reply(409, {}),
    ]) {
      expect(await addClient('w1', input, response)).toEqual({ ok: false, reason: 'generic' });
    }
  });

  it('no connection is its own failure', async () => {
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await addClient('w1', { name: 'A', email: '', emailLocale: '' }, offline)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});

describe('F006 TW-01 clients client: the client behind a duplicate address', () => {
  it('AC3: finds the existing client by the address that was typed', async () => {
    const other = { ...anna, id: 'c9', email: 'hanna@example.com' };
    const fetchFn = reply(200, { items: [other, anna], total: 2 });

    expect(await findExistingClient('w1', 'c1', 'Anna@Example.com', fetchFn)).toEqual(anna);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      '/api/v1/workspaces/w1/clients?search=Anna%40Example.com&pageSize=100',
    );
  });

  it('is null when the search does not list that client', async () => {
    expect(
      await findExistingClient('w1', 'c1', 'a@example.com', reply(200, { items: [], total: 0 })),
    ).toBeNull();
    expect(await findExistingClient('w1', 'c1', 'a@example.com', reply(500))).toBeNull();
  });
});
