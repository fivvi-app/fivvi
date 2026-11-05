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
