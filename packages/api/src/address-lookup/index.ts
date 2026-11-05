import { cacheAddressLookup } from './cache.ts';
import { createFakeAddressLookup } from './fake.ts';
import type { AddressLookup } from './lookup.ts';
import { createPdokAddressLookup, type PdokAddressLookupOptions } from './pdok.ts';

export { ADDRESS_LOOKUP_CACHE_MS, cacheAddressLookup } from './cache.ts';
export {
  createFakeAddressLookup,
  FAKE_ADDRESSES,
  FAKE_UNAVAILABLE_POSTCODE,
  type FakeAddress,
} from './fake.ts';
export type { AddressLookup, AddressLookupResult, FoundAddress } from './lookup.ts';
export {
  ADDRESS_LOOKUP_TIMEOUT_MS,
  createPdokAddressLookup,
  PDOK_FREE_SEARCH_URL,
  type PdokAddressLookupOptions,
} from './pdok.ts';

/**
 * The lookup this process runs (F015). `ADDRESS_LOOKUP=pdok` switches the PDOK adapter on and
 * `fake` the in-memory one; unset, PDOK runs in the production environment
 * (`RAILWAY_ENVIRONMENT_NAME=production`) and the fake everywhere else, so CI, e2e, development
 * and previews never call PDOK. The PDOK adapter is cached for a day.
 */
export function createAddressLookup(
  env: Readonly<Record<string, string | undefined>>,
  options: PdokAddressLookupOptions = {},
): AddressLookup {
  const chosen = env.ADDRESS_LOOKUP?.trim().toLowerCase();
  if (chosen && chosen !== 'pdok' && chosen !== 'fake') {
    // Not the value: it is a variable of the environment, but an error never quotes input.
    throw new Error('ADDRESS_LOOKUP must be "pdok" or "fake" (ENVIRONMENTS.md §7).');
  }
  const pdok = chosen ? chosen === 'pdok' : env.RAILWAY_ENVIRONMENT_NAME?.trim() === 'production';
  return pdok ? cacheAddressLookup(createPdokAddressLookup(options)) : createFakeAddressLookup();
}
