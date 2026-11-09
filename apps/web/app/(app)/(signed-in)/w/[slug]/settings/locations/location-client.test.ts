import { describe, expect, it, vi } from 'vitest';
import { lookupAddress, saveLocation } from './location-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const validation = (...issues: { path: string; code: string }[]) => ({
  code: 'validation_failed',
  issues,
});

const INPUT = {
  name: "John's Gym Centrum",
  postcode: '1234ab',
  houseNumber: '1',
  houseNumberAddition: ' A ',
  street: 'Voorbeeldstraat',
  city: 'Amsterdam',
};

describe('F015 TW-08 location client: saving', () => {
  it('AC4: patches the name and the address on the location route of this site', async () => {
    const fetchFn = reply(200, { id: 'l1' });

    const result = await saveLocation('w1', 'l1', INPUT, fetchFn);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/locations/l1');
    expect(init?.method).toBe('PATCH');
    // Nothing is normalized here: the API stores `1234 AB` and trims the addition.
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "John's Gym Centrum",
      address: {
        postcode: '1234ab',
        houseNumber: '1',
        houseNumberAddition: 'A',
        street: 'Voorbeeldstraat',
        city: 'Amsterdam',
      },
    });
  });

  it('AC4: an empty addition is sent as none, and an empty address as an address with nothing in it', async () => {
    const fetchFn = reply(200);

    await saveLocation(
      'w1',
      'l1',
      { ...INPUT, postcode: '', houseNumber: '', houseNumberAddition: '', street: '', city: '' },
      fetchFn,
    );

    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body)).address).toEqual({
      postcode: '',
      houseNumber: '',
      houseNumberAddition: null,
      street: '',
      city: '',
    });
  });

  it.each([
    ['too_small', 'required'],
    ['too_big', 'tooLong'],
  ])('AC5: the API refuses the name with %s: %s', async (code, problem) => {
    const result = await saveLocation(
      'w1',
      'l1',
      INPUT,
      reply(400, validation({ path: 'name', code })),
    );

    expect(result).toEqual({ ok: false, reason: 'fields', refusals: { name: problem } });
  });

  it('AC15: the refusals of the address are told per field', async () => {
    const result = await saveLocation(
      'w1',
      'l1',
      INPUT,
      reply(
        400,
        validation(
          { path: 'address.postcode', code: 'invalid_format' },
          { path: 'address.houseNumber', code: 'invalid_format' },
          { path: 'address.houseNumberAddition', code: 'too_big' },
          { path: 'address.street', code: 'too_small' },
          { path: 'address.city', code: 'too_small' },
        ),
      ),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'fields',
      refusals: {
        postcode: 'invalid',
        houseNumber: 'invalid',
        houseNumberAddition: 'tooLong',
        street: 'required',
        city: 'required',
      },
    });
  });

  it.each([401, 403, 404])('a %s means this person may not change it', async (status) => {
    expect(await saveLocation('w1', 'l1', INPUT, reply(status))).toEqual({
      ok: false,
      reason: 'home',
    });
  });

  it('any other answer is a generic failure', async () => {
    expect(await saveLocation('w1', 'l1', INPUT, reply(500))).toEqual({
      ok: false,
      reason: 'generic',
    });
    expect(await saveLocation('w1', 'l1', INPUT, reply(400, validation()))).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await saveLocation('w1', 'l1', INPUT, fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});

describe('F015 TW-08 location client: the address lookup', () => {
  const QUERY = { postcode: '1234 AB', houseNumber: '1', houseNumberAddition: '' };

  it('AC13: asks the lookup route of this site, never PDOK, and returns the street and city', async () => {
    const fetchFn = reply(200, { street: 'Voorbeeldstraat', city: 'Amsterdam' });

    const result = await lookupAddress('w1', QUERY, fetchFn);

    expect(result).toEqual({ kind: 'found', street: 'Voorbeeldstraat', city: 'Amsterdam' });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/address-lookup?postcode=1234+AB&houseNumber=1');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('AC13: a typed addition goes along, trimmed', async () => {
    const fetchFn = reply(200, { street: 'S', city: 'C' });

    await lookupAddress('w1', { ...QUERY, houseNumberAddition: ' 2 hoog ' }, fetchFn);

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      '/api/v1/workspaces/w1/address-lookup?postcode=1234+AB&houseNumber=1&addition=2+hoog',
    );
  });

  it('AC14: 404 is no match', async () => {
    expect(await lookupAddress('w1', QUERY, reply(404, { code: 'not_found' }))).toEqual({
      kind: 'not-found',
    });
  });

  it.each([503, 429, 401, 403, 500])(
    'AC14: a %s means the lookup is unavailable',
    async (status) => {
      expect(await lookupAddress('w1', QUERY, reply(status))).toEqual({ kind: 'unavailable' });
    },
  );

  it('AC14: a request that cannot reach the server is unavailable', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await lookupAddress('w1', QUERY, fetchFn)).toEqual({ kind: 'unavailable' });
  });

  it('a query the API refuses (422) is no lookup at all: the form says nothing about it', async () => {
    expect(await lookupAddress('w1', QUERY, reply(422, validation()))).toEqual({
      kind: 'invalid',
    });
  });
});
