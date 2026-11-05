/** What a lookup finds: the street and the city of an address. */
export interface FoundAddress {
  readonly street: string;
  readonly city: string;
}

/**
 * `not-found`: the service answered and no address has that postcode, number and addition.
 * `unavailable`: it did not answer in time, or answered with an error; nothing is known.
 */
export type AddressLookupResult = FoundAddress | 'not-found' | 'unavailable';

/**
 * The addition as the service is asked for it, and so the one thing a cache keys on: trimmed, and
 * a single letter (a house letter) upper case. Any other addition keeps its case, because the
 * service may tell `2 hoog` and `2 Hoog` apart; a key that agrees with the query never gives one
 * casing the answer of the other.
 */
export function normalizeAddition(addition: string | null): string | null {
  const trimmed = addition?.trim() ?? '';
  if (!trimmed) return null;
  return /^[A-Za-z]$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

/**
 * The address lookup of a Dutch postcode, house number and optional addition (F015, spec #424).
 * The arguments are the normalized query of `decideAddressLookup` (`@fivvi/domain`): the API has
 * checked them. An implementation never throws for a service that does not answer.
 */
export interface AddressLookup {
  lookup(
    postcode: string,
    houseNumber: string,
    houseNumberAddition: string | null,
  ): Promise<AddressLookupResult>;
}
