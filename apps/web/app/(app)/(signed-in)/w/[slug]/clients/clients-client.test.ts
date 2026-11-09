import { describe, expect, it, vi } from 'vitest';
import { addClient, findExistingClient, searchClients, updateClient } from './clients-client';

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
  it('AC1: posts the name and the email address, and leaves the language out when none was chosen', async () => {
    const mark = { id: 'c2', name: 'Mark Jansen', email: 'mark@example.com', emailLocale: null };
    const fetchFn = reply(201, mark);

    const result = await addClient(
      'w1',
      { name: 'Mark Jansen', email: 'mark@example.com', emailLocale: '' },
      fetchFn,
    );

    expect(result).toEqual({ ok: true, client: mark });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/clients');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Mark Jansen',
      email: 'mark@example.com',
    });
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('AC2: posts the trimmed address and the language when it was chosen', async () => {
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

  it.each(['', '   '])(
    'AC2: an empty or blank email address (%j) is refused before anything is asked, and the name with it',
    async (email) => {
      const fetchFn = reply(201, anna);

      expect(await addClient('w1', { name: 'Anna', email, emailLocale: '' }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        email: 'emailRequired',
      });
      expect(await addClient('w1', { name: '  ', email, emailLocale: '' }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        name: 'nameRequired',
        email: 'emailRequired',
      });
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it('AC2: the API’s 400 for a missing address is worded as required, any other as invalid', async () => {
    const input = { name: 'Anna', email: 'x@example.com', emailLocale: '' } as const;
    const refuse = (code: string) =>
      reply(400, { code: 'validation_failed', issues: [{ path: 'email', code }] });

    expect(await addClient('w1', input, refuse('invalid_type'))).toEqual({
      ok: false,
      reason: 'fields',
      email: 'emailRequired',
    });
    expect(await addClient('w1', input, refuse('invalid_format'))).toEqual({
      ok: false,
      reason: 'fields',
      email: 'emailInvalid',
    });
  });

  it('AC2: words the refused fields from the API’s validation codes', async () => {
    const refuse = (...issues: { path: string; code: string }[]) =>
      reply(400, { code: 'validation_failed', issues });
    const input = { name: 'A', email: 'a@example.com', emailLocale: '' } as const;

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
        await addClient(
          'w1',
          { name: 'A', email: 'a@example.com', emailLocale: '' },
          reply(status),
        ),
      ).toEqual({ ok: false, reason: 'home' });
    },
  );

  it('a 400 naming no field, a 500 and a 409 without the code are generic failures', async () => {
    const input = { name: 'A', email: 'a@example.com', emailLocale: '' } as const;
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
    expect(
      await addClient('w1', { name: 'A', email: 'a@example.com', emailLocale: '' }, offline),
    ).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});

describe('F006 TW-01 clients client: the client behind a duplicate address', () => {
  it('AC3: reads the existing client by the ID the 409 named', async () => {
    const fetchFn = reply(200, anna);

    expect(await findExistingClient('w1', 'c1', fetchFn)).toEqual(anna);
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/v1/workspaces/w1/clients/c1',
    ]);
  });

  it.each([401, 403, 404, 500])('is null when the client can’t be read (a %s)', async (status) => {
    expect(await findExistingClient('w1', 'c1', reply(status))).toBeNull();
  });

  it('is null when there is no connection or the answer is no client', async () => {
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await findExistingClient('w1', 'c1', offline)).toBeNull();
    expect(await findExistingClient('w1', 'c1', reply(200, null))).toBeNull();
  });
});

describe('F006 TW-02 clients client: edit', () => {
  const edit = { name: 'Anna de Vries', email: 'anna@example.com', emailLocale: '' } as const;
  const sent = (fetchFn: ReturnType<typeof reply>) => {
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    return { url, init, body: JSON.parse(String(init?.body)) };
  };

  it('AC7: patches the client’s route with the name and the email address that changed', async () => {
    const saved = { ...anna, name: 'Anna Bakker', email: 'anna.bakker@example.com' };
    const fetchFn = reply(200, saved);

    const result = await updateClient(
      'w1',
      anna,
      { name: 'Anna Bakker', email: ' Anna.Bakker@Example.com ', emailLocale: '' },
      fetchFn,
    );

    expect(result).toEqual({ ok: true, client: saved });
    const { url, init, body } = sent(fetchFn);
    expect(url).toBe('/api/v1/workspaces/w1/clients/c1');
    expect(init?.method).toBe('PATCH');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(body).toEqual({ name: 'Anna Bakker', email: 'Anna.Bakker@Example.com' });
  });

  it('AC7: leaves the email address out when it is the one the client has (any case, any padding)', async () => {
    const fetchFn = reply(200, anna);

    await updateClient('w1', anna, { ...edit, email: ' ANNA@example.com ' }, fetchFn);

    expect(sent(fetchFn).body).toEqual({ name: 'Anna de Vries' });
  });

  it('AC7: a language is sent as chosen; the default again is clearEmailLocale, never null', async () => {
    const english = { ...anna, emailLocale: 'en' as const };
    const chosen = reply(200, english);
    await updateClient('w1', anna, { ...edit, emailLocale: 'en' }, chosen);
    expect(sent(chosen).body).toEqual({ name: 'Anna de Vries', emailLocale: 'en' });

    const cleared = reply(200, anna);
    await updateClient('w1', english, edit, cleared);
    expect(sent(cleared).body).toEqual({ name: 'Anna de Vries', clearEmailLocale: true });

    // A client that follows the default and still does: nothing is sent about the language.
    const kept = reply(200, anna);
    await updateClient('w1', anna, edit, kept);
    expect(sent(kept).body).toEqual({ name: 'Anna de Vries' });
  });

  it.each(['', '   '])(
    'AC7: the email address can’t be cleared: %j is refused before anything is asked, and the name with it',
    async (email) => {
      const fetchFn = reply(200, anna);

      expect(await updateClient('w1', anna, { ...edit, email }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        email: 'emailRequired',
      });
      expect(await updateClient('w1', anna, { ...edit, name: '  ', email }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        name: 'nameRequired',
        email: 'emailRequired',
      });
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it('AC7: words the API’s refused fields like a quick add does', async () => {
    const refuse = (...issues: { path: string; code: string }[]) =>
      reply(400, { code: 'validation_failed', issues });

    expect(
      await updateClient(
        'w1',
        anna,
        { ...edit, email: 'x@example.com' },
        refuse({ path: 'name', code: 'too_big' }, { path: 'email', code: 'invalid_format' }),
      ),
    ).toEqual({ ok: false, reason: 'fields', name: 'nameTooLong', email: 'emailInvalid' });
  });

  it('AC7: a 409 client_exists carries the other client’s ID', async () => {
    expect(
      await updateClient(
        'w1',
        anna,
        { ...edit, email: 'mark@example.com' },
        reply(409, { code: 'client_exists', clientId: 'c2' }),
      ),
    ).toEqual({ ok: false, reason: 'exists', clientId: 'c2' });
  });

  it.each([401, 403, 404])(
    'a %s means this person may not edit clients (any more)',
    async (status) => {
      expect(await updateClient('w1', anna, edit, reply(status))).toEqual({
        ok: false,
        reason: 'home',
      });
    },
  );

  it('a 500 is a generic failure, and no connection is its own', async () => {
    expect(await updateClient('w1', anna, edit, reply(500))).toEqual({
      ok: false,
      reason: 'generic',
    });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await updateClient('w1', anna, edit, offline)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});
