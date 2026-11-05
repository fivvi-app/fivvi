import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADDRESS_LOOKUP_CACHE_MS,
  type AddressLookup,
  cacheAddressLookup,
  createAddressLookup,
  createFakeAddressLookup,
} from '../src/address-lookup/index.ts';

// F015 (spec #424), AC14 and AC16: the fake, the cache and which lookup runs (the PDOK adapter is
// in pdok-adapter.test.ts). No test calls the network: `fetch` is always a stub.

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/pdok/${name}.json`, import.meta.url), 'utf8');

const answer = (body: string, init?: ResponseInit) =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init });

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

  it('knows house number 3 with another street and city, for the form that refills the city (AC13)', async () => {
    const lookup = createFakeAddressLookup();
    expect(await lookup.lookup('1234 AB', '3', null)).toEqual({
      street: 'Proeflaan',
      city: 'Haarlem',
    });
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

  it('keys on the addition as PDOK is asked for it: a house letter in any case is one entry', async () => {
    const inner = counting(found);
    const cached = cacheAddressLookup(inner, { now: () => 0 });
    await cached.lookup('1234 AB', '1', 'a');
    await cached.lookup('1234 AB', '1', 'A');
    expect(inner.lookup).toHaveBeenCalledTimes(1);
  });

  it('keys other additions as written, so one casing never gets the other answer', async () => {
    const inner = counting(found);
    const cached = cacheAddressLookup(inner, { now: () => 0 });
    await cached.lookup('1234 AB', '1', '2 hoog');
    await cached.lookup('1234 AB', '1', '2 Hoog');
    expect(inner.lookup).toHaveBeenCalledTimes(2);
    await cached.lookup('1234 AB', '1', '2 hoog');
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
