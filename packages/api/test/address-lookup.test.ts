import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADDRESS_LOOKUP_CACHE_MS,
  ADDRESS_LOOKUP_TIMEOUT_MS,
  type AddressLookup,
  cacheAddressLookup,
  createAddressLookup,
  createFakeAddressLookup,
  createPdokAddressLookup,
} from '../src/address-lookup/index.ts';

// F015 (spec #424), AC14 and AC16: the PDOK adapter against recorded answers of the Locatieserver
// (test/fixtures/pdok, a public address of the BAG), the fake, the cache and which one runs. No
// test calls the network: `fetch` is always a stub.

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/pdok/${name}.json`, import.meta.url), 'utf8');

const answer = (body: string, init?: ResponseInit) =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('F015 the PDOK address lookup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('AC16: sends the postcode, the house number and the type of an address, and nothing else', async () => {
    const fetch = vi.fn(async (..._args: [URL | string, RequestInit?]) => answer(fixture('found')));
    const lookup = createPdokAddressLookup({ fetch });
    await lookup.lookup('2513 AA', '1', null);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    const target = new URL(String(url));
    expect(`${target.origin}${target.pathname}`).toBe(
      'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free',
    );
    expect([...target.searchParams.keys()].sort()).toEqual(['fl', 'fq', 'fq', 'fq', 'q', 'rows']);
    expect(target.searchParams.get('q')).toBe('*');
    expect(target.searchParams.getAll('fq').sort()).toEqual([
      'huisnummer:1',
      'postcode:2513AA',
      'type:adres',
    ]);
    expect(target.searchParams.get('fl')).toBe('straatnaam,woonplaatsnaam');
    // A plain GET: no body, no cookies, no custom headers (no workspace, no person, no client IP).
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toBeUndefined();
    expect(init?.credentials).toBeUndefined();
    expect(String(url)).not.toMatch(/workspace|email|@/i);
  });

  it('AC16: a single letter addition is a house letter filter, not a free text search', async () => {
    const fetch = vi.fn(async (..._args: [URL | string, RequestInit?]) =>
      answer(fixture('found-with-letter')),
    );
    await createPdokAddressLookup({ fetch }).lookup('2513 AA', '1', 'a');
    const target = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(target.searchParams.getAll('fq').sort()).toEqual([
      'huisletter:A',
      'huisnummer:1',
      'postcode:2513AA',
      'type:adres',
    ]);
  });

  it('AC16: any other addition is a house number addition filter, quoted', async () => {
    const fetch = vi.fn(async (..._args: [URL | string, RequestInit?]) => answer(fixture('none')));
    await createPdokAddressLookup({ fetch }).lookup('1012 AB', '19', '2 hoog');
    const target = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(target.searchParams.getAll('fq')).toContain('huisnummertoevoeging:"2 hoog"');
  });

  it('AC14, AC16: parses the street and the city of a recorded answer', async () => {
    const lookup = createPdokAddressLookup({ fetch: async () => answer(fixture('found')) });
    expect(await lookup.lookup('2513 AA', '1', null)).toEqual({
      street: 'Binnenhof',
      city: "'s-Gravenhage",
    });
  });

  it('AC14: an answer with no address is not-found', async () => {
    const lookup = createPdokAddressLookup({ fetch: async () => answer(fixture('none')) });
    expect(await lookup.lookup('9999 ZZ', '1', null)).toBe('not-found');
  });

  it.each([
    ['a server error', () => answer('oops', { status: 500 })],
    ['a rate limit', () => answer('{}', { status: 429 })],
    ['text that is no JSON', () => answer('<html>maintenance</html>')],
    ['JSON of another shape', () => answer('{"response":{"docs":[{"straatnaam":3}]}}')],
    ['an address without a city', () => answer('{"response":{"docs":[{"straatnaam":"Weg"}]}}')],
  ])('AC14: %s is unavailable', async (_name, respond) => {
    const lookup = createPdokAddressLookup({ fetch: async () => respond() });
    expect(await lookup.lookup('2513 AA', '1', null)).toBe('unavailable');
  });

  it('AC14: a network error is unavailable', async () => {
    const lookup = createPdokAddressLookup({
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    expect(await lookup.lookup('2513 AA', '1', null)).toBe('unavailable');
  });

  it('AC14: waits 3 seconds, then gives up with unavailable, and does not retry', async () => {
    expect(ADDRESS_LOOKUP_TIMEOUT_MS).toBe(3000);
    const fetch = vi.fn(
      (_url: URL | string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const lookup = createPdokAddressLookup({ fetch, timeoutMs: 20 });
    expect(await lookup.lookup('2513 AA', '1', null)).toBe('unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('AC16: logs nothing, neither the query nor the answer, also when PDOK fails', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const failing = createPdokAddressLookup({
      fetch: () => Promise.reject(new Error('fetch failed for 2513AA 1')),
    });
    await failing.lookup('2513 AA', '1', null);
    await createPdokAddressLookup({ fetch: async () => answer(fixture('found')) }).lookup(
      '2513 AA',
      '1',
      null,
    );
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('F015 the fake address lookup', () => {
  it('answers from its entries, case and spacing as the normalized query', async () => {
    const lookup = createFakeAddressLookup([
      { postcode: '1234 AB', houseNumber: '1', street: 'Voorbeeldstraat', city: 'Amsterdam' },
      {
        postcode: '1234 AB',
        houseNumber: '1',
        houseNumberAddition: 'A',
        street: 'Voorbeeldstraat',
        city: 'Amsterdam',
      },
    ]);
    expect(await lookup.lookup('1234 AB', '1', null)).toEqual({
      street: 'Voorbeeldstraat',
      city: 'Amsterdam',
    });
    expect(await lookup.lookup('1234 AB', '1', 'a')).toEqual({
      street: 'Voorbeeldstraat',
      city: 'Amsterdam',
    });
    expect(await lookup.lookup('1234 AB', '1', 'B')).toBe('not-found');
    expect(await lookup.lookup('9999 ZZ', '1', null)).toBe('not-found');
  });

  it('has invented entries by default', async () => {
    const lookup = createFakeAddressLookup();
    expect(await lookup.lookup('1234 AB', '1', null)).toEqual({
      street: 'Voorbeeldstraat',
      city: 'Amsterdam',
    });
    expect(await lookup.lookup('9999 ZZ', '1', null)).toBe('not-found');
  });

  it('answers unavailable for the postcode of the unavailable case, to try the screens of it', async () => {
    expect(await createFakeAddressLookup().lookup('1000 AA', '1', null)).toBe('unavailable');
  });
});

describe('F015 the address lookup cache', () => {
  const found = { street: 'Voorbeeldstraat', city: 'Amsterdam' } as const;
  const counting = (result: Awaited<ReturnType<AddressLookup['lookup']>>) => {
    const lookup = vi.fn(async (_p: string, _n: string, _a: string | null) => result);
    return { lookup } satisfies AddressLookup & { lookup: typeof lookup };
  };

  it('AC14: one day, on the normalized query', async () => {
    expect(ADDRESS_LOOKUP_CACHE_MS).toBe(24 * 60 * 60 * 1000);
    let now = 1_000;
    const inner = counting(found);
    const cached = cacheAddressLookup(inner, { now: () => now });
    expect(await cached.lookup('1234 AB', '1', 'A')).toEqual(found);
    expect(await cached.lookup('1234 AB', '1', 'a')).toEqual(found);
    expect(await cached.lookup('1234 AB', '1', ' a ')).toEqual(found);
    expect(inner.lookup).toHaveBeenCalledTimes(1);

    now += ADDRESS_LOOKUP_CACHE_MS - 1;
    await cached.lookup('1234 AB', '1', 'A');
    expect(inner.lookup).toHaveBeenCalledTimes(1);

    now += 1;
    await cached.lookup('1234 AB', '1', 'A');
    expect(inner.lookup).toHaveBeenCalledTimes(2);
  });

  it('keeps a no-match too, and asks again for another query', async () => {
    const inner = counting('not-found');
    const cached = cacheAddressLookup(inner, { now: () => 0 });
    expect(await cached.lookup('9999 ZZ', '1', null)).toBe('not-found');
    expect(await cached.lookup('9999 ZZ', '1', null)).toBe('not-found');
    expect(await cached.lookup('9999 ZZ', '2', null)).toBe('not-found');
    expect(inner.lookup).toHaveBeenCalledTimes(2);
  });

  it('does not keep unavailable: the next lookup tries again', async () => {
    const inner = counting('unavailable');
    const cached = cacheAddressLookup(inner, { now: () => 0 });
    await cached.lookup('1234 AB', '1', null);
    await cached.lookup('1234 AB', '1', null);
    expect(inner.lookup).toHaveBeenCalledTimes(2);
  });

  it('is bounded: the oldest entry makes room', async () => {
    const inner = counting(found);
    const cached = cacheAddressLookup(inner, { now: () => 0, maxEntries: 2 });
    await cached.lookup('1234 AB', '1', null);
    await cached.lookup('1234 AB', '2', null);
    await cached.lookup('1234 AB', '3', null);
    expect(inner.lookup).toHaveBeenCalledTimes(3);
    await cached.lookup('1234 AB', '3', null);
    expect(inner.lookup).toHaveBeenCalledTimes(3);
    await cached.lookup('1234 AB', '1', null);
    expect(inner.lookup).toHaveBeenCalledTimes(4);
  });
});

describe('F015 which address lookup runs', () => {
  const fetch = vi.fn(async () => answer(fixture('found')));

  afterEach(() => fetch.mockClear());

  it('AC16: the fake by default, outside production: CI and previews never call PDOK', async () => {
    for (const env of [{}, { RAILWAY_ENVIRONMENT_NAME: 'pr-130' }, { NODE_ENV: 'production' }]) {
      const lookup = createAddressLookup(env, { fetch });
      expect(await lookup.lookup('2513 AA', '1', null)).toBe('not-found');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is PDOK in the production environment', async () => {
    const lookup = createAddressLookup({ RAILWAY_ENVIRONMENT_NAME: 'production' }, { fetch });
    expect(await lookup.lookup('2513 AA', '1', null)).toEqual({
      street: 'Binnenhof',
      city: "'s-Gravenhage",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('is PDOK anywhere ADDRESS_LOOKUP=pdok switches it on, and the fake where it says fake', async () => {
    const on = createAddressLookup({ ADDRESS_LOOKUP: 'pdok' }, { fetch });
    expect(await on.lookup('2513 AA', '1', null)).toMatchObject({ street: 'Binnenhof' });
    const off = createAddressLookup(
      { ADDRESS_LOOKUP: 'fake', RAILWAY_ENVIRONMENT_NAME: 'production' },
      { fetch },
    );
    expect(await off.lookup('2513 AA', '1', null)).toBe('not-found');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a value it does not know, without echoing it', () => {
    expect(() => createAddressLookup({ ADDRESS_LOOKUP: 'googel' })).toThrow(/ADDRESS_LOOKUP/);
    expect(() => createAddressLookup({ ADDRESS_LOOKUP: 'googel' })).not.toThrow(/googel/);
  });

  it('caches what PDOK answered', async () => {
    const lookup = createAddressLookup({ ADDRESS_LOOKUP: 'pdok' }, { fetch });
    await lookup.lookup('2513 AA', '1', null);
    await lookup.lookup('2513 AA', '1', null);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
