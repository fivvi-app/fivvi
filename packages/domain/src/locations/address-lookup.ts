// The query of an address lookup (F015, spec #424): a Dutch postcode, a house number and an
// optional addition, checked before anything leaves the server. Pure rules, no I/O: the API asks,
// then hands the normalized query to whichever lookup is switched on.

import {
  ADDRESS_ADDITION_MAX_LENGTH,
  type AddressIssue,
  checkPostcodeAndHouseNumber,
} from './address.ts';

/** A lookup query as the API hands it on: the postcode as `1234 AB`, the addition trimmed. */
export interface AddressLookupQuery {
  readonly postcode: string;
  readonly houseNumber: string;
  readonly houseNumberAddition: string | null;
}

export interface AddressLookupInput {
  readonly postcode: string;
  readonly houseNumber: string;
  readonly houseNumberAddition?: string | null | undefined;
}

export type AddressLookupDecision =
  | { readonly ok: true; readonly query: AddressLookupQuery }
  | { readonly ok: false; readonly issues: readonly AddressIssue[] };

// Letters, digits, spaces and hyphens: what a house number addition is made of ("A", "2 hoog",
// "1-3"), and nothing that has a meaning in a search query (quotes, colons, wildcards).
const ADDITION = /^[A-Za-z0-9][A-Za-z0-9 -]*$/;

/**
 * Whether the typed query may be looked up, and as what. The postcode must be a Dutch one, the
 * house number one to five digits, the addition (optional) at most 10 characters of letters,
 * digits, spaces and hyphens. The issues come in field order.
 */
export function decideAddressLookup(input: AddressLookupInput): AddressLookupDecision {
  const postcode = input.postcode.trim();
  const houseNumber = input.houseNumber.trim();
  const addition = (input.houseNumberAddition ?? '').trim();

  const { postcode: normalized, issues } = checkPostcodeAndHouseNumber(postcode, houseNumber);
  if (addition.length > ADDRESS_ADDITION_MAX_LENGTH) {
    issues.push({ field: 'houseNumberAddition', problem: 'too-long' });
  } else if (addition && !ADDITION.test(addition)) {
    issues.push({ field: 'houseNumberAddition', problem: 'invalid' });
  }
  if (issues.length > 0 || !normalized) return { ok: false, issues };

  return {
    ok: true,
    query: { postcode: normalized, houseNumber, houseNumberAddition: addition || null },
  };
}
