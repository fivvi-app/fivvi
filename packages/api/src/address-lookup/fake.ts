import type { AddressLookup } from './lookup.ts';

export interface FakeAddress {
  postcode: string;
  houseNumber: string;
  houseNumberAddition?: string;
  street: string;
  city: string;
}

/** Invented addresses, for tests, e2e and previews without the network. */
export const FAKE_ADDRESSES: readonly FakeAddress[] = [
  { postcode: '1234 AB', houseNumber: '1', street: 'Voorbeeldstraat', city: 'Amsterdam' },
  {
    postcode: '1234 AB',
    houseNumber: '1',
    houseNumberAddition: 'A',
    street: 'Voorbeeldstraat',
    city: 'Amsterdam',
  },
  { postcode: '5678 CD', houseNumber: '22', street: 'Proefplein', city: 'Utrecht' },
];

/** The postcode the fake treats as a lookup that does not answer, to try the screens of it. */
export const FAKE_UNAVAILABLE_POSTCODE = '1000 AA';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * An in-memory lookup (F015): answers from a list, never calls the network. A query without an
 * addition matches any address of that postcode and number, as the real service does.
 */
export function createFakeAddressLookup(
  addresses: readonly FakeAddress[] = FAKE_ADDRESSES,
): AddressLookup {
  return {
    lookup(postcode, houseNumber, houseNumberAddition) {
      if (postcode === FAKE_UNAVAILABLE_POSTCODE) return Promise.resolve('unavailable');
      const found = addresses.find(
        (address) =>
          same(address.postcode, postcode) &&
          address.houseNumber === houseNumber &&
          (houseNumberAddition === null ||
            same(address.houseNumberAddition ?? '', houseNumberAddition)),
      );
      return Promise.resolve(
        found ? { street: found.street, city: found.city } : ('not-found' as const),
      );
    },
  };
}
