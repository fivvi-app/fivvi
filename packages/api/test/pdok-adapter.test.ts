import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADDRESS_LOOKUP_TIMEOUT_MS, createPdokAddressLookup } from '../src/address-lookup/index.ts';

// F015 (spec #424), AC14 and AC16: the PDOK adapter against recorded answers of the Locatieserver
// (test/fixtures/pdok, a public address of the BAG). No test calls the network: `fetch` is always a
// stub, and the timeout is a signal the test controls, not the clock.

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/pdok/${name}.json`, import.meta.url), 'utf8');

const answer = (body: string, init?: ResponseInit) =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('F015 the PDOK adapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('AC16: sends only postcode, house number and addition; parses street and city', async () => {
    const fetch = vi.fn(async (..._args: [URL | string, RequestInit?]) => answer(fixture('found')));
    const lookup = createPdokAddressLookup({ fetch });
    expect(await lookup.lookup('2513 AA', '1', null)).toEqual({
      street: 'Binnenhof',
      city: "'s-Gravenhage",
    });

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

  it('AC14: gives up with unavailable when the 3 second signal fires, and does not retry', async () => {
    // The timeout is a signal the test owns: no clock, no waiting.
    const timeout = new AbortController();
    const timeouts = vi.fn((_ms: number) => timeout.signal);
    const fetch = vi.fn(
      (_url: URL | string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          timeout.abort(new DOMException('timed out', 'TimeoutError'));
        }),
    );
    const lookup = createPdokAddressLookup({ fetch, timeoutSignal: timeouts });
    expect(await lookup.lookup('2513 AA', '1', null)).toBe('unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ADDRESS_LOOKUP_TIMEOUT_MS).toBe(3000);
    expect(timeouts).toHaveBeenCalledWith(3000);
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(timeout.signal);
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
