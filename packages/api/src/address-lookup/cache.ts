import { type AddressLookup, type AddressLookupResult, normalizeAddition } from './lookup.ts';

/** How long an answer is kept: the BAG changes slowly, and a repeat is not a call to PDOK. */
export const ADDRESS_LOOKUP_CACHE_MS = 24 * 60 * 60 * 1000;

/** The most queries kept, so the cache can't grow without bound. */
const MAX_ENTRIES = 5000;

export interface CacheOptions {
  /** Where "now" comes from, in milliseconds. */
  now?: () => number;
  maxEntries?: number;
}

/**
 * Keeps what a lookup found, and what it found nothing for, for a day, in memory, on the
 * query as the service is asked for it (`normalizeAddition`: a house letter `a` or `A` is one entry). `unavailable` is not kept:
 * the next lookup tries again. The cache holds the postcode, number and addition only for the
 * time of its entry, in this process, and never writes them anywhere.
 */
export function cacheAddressLookup(
  inner: AddressLookup,
  options: CacheOptions = {},
): AddressLookup {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  // A Map keeps insertion order, so the first key is the oldest entry.
  const entries = new Map<string, { until: number; result: AddressLookupResult }>();
  return {
    async lookup(postcode, houseNumber, houseNumberAddition) {
      const key = [
        postcode.replace(/\s+/g, '').toUpperCase(),
        houseNumber.trim(),
        normalizeAddition(houseNumberAddition),
      ].join('|');
      const kept = entries.get(key);
      if (kept && kept.until > now()) return kept.result;
      entries.delete(key);
      const result = await inner.lookup(postcode, houseNumber, houseNumberAddition);
      if (result !== 'unavailable') {
        if (entries.size >= maxEntries) {
          const oldest = entries.keys().next();
          if (!oldest.done) entries.delete(oldest.value);
        }
        entries.set(key, { until: now() + ADDRESS_LOOKUP_CACHE_MS, result });
      }
      return result;
    },
  };
}
