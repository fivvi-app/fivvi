import { z } from '@hono/zod-openapi';
import type { AddressLookup, AddressLookupResult } from './lookup.ts';

// The PDOK Locatieserver, free search (https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui/,
// checked 2026-11-05): no key, no sign-up, a public service of the Dutch government. It is asked for
// the one address, filtered on its type, postcode and house number (and addition), and answers the
// street and the city of the BAG.
//
// What leaves: the postcode, the house number and the addition, as filters of a plain GET. No
// cookie, no header of ours, no name, no workspace; the request is made by the server, so the
// client's IP address never reaches PDOK. Nothing is logged here and no error is passed on: an
// error message can quote the URL.

export const PDOK_FREE_SEARCH_URL = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

/** How long a lookup waits for PDOK. There is no retry: the person can try again. */
export const ADDRESS_LOOKUP_TIMEOUT_MS = 3000;

const AnswerSchema = z.object({
  response: z.object({
    docs: z.array(z.object({ straatnaam: z.string().min(1), woonplaatsnaam: z.string().min(1) })),
  }),
});

type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

export interface PdokAddressLookupOptions {
  /** For tests: the real `fetch` otherwise. */
  fetch?: Fetch;
  timeoutMs?: number;
}

/**
 * The filter for the addition: a single letter is a house letter (`1A`), anything else a house
 * number addition (`1-3`, `2 hoog`). The query of the domain allows letters, digits, spaces and
 * hyphens only, so the quotes can't be left.
 */
function additionFilter(addition: string): string {
  return /^[A-Za-z]$/.test(addition)
    ? `huisletter:${addition.toUpperCase()}`
    : `huisnummertoevoeging:"${addition}"`;
}

export function createPdokAddressLookup(options: PdokAddressLookupOptions = {}): AddressLookup {
  const send: Fetch = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? ADDRESS_LOOKUP_TIMEOUT_MS;
  return {
    async lookup(postcode, houseNumber, houseNumberAddition): Promise<AddressLookupResult> {
      const url = new URL(PDOK_FREE_SEARCH_URL);
      url.searchParams.set('q', '*');
      url.searchParams.append('fq', 'type:adres');
      url.searchParams.append('fq', `postcode:${postcode.replace(/\s+/g, '')}`);
      url.searchParams.append('fq', `huisnummer:${houseNumber}`);
      if (houseNumberAddition) url.searchParams.append('fq', additionFilter(houseNumberAddition));
      url.searchParams.set('fl', 'straatnaam,woonplaatsnaam');
      url.searchParams.set('rows', '1');
      try {
        const response = await send(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) return 'unavailable';
        const answer = AnswerSchema.safeParse(await response.json());
        if (!answer.success) return 'unavailable';
        const [found] = answer.data.response.docs;
        return found ? { street: found.straatnaam, city: found.woonplaatsnaam } : 'not-found';
      } catch {
        // A timeout, a network error, an answer that is no JSON: PDOK can't be reached for now.
        return 'unavailable';
      }
    },
  };
}
