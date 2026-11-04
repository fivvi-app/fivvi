// The address of a location (F015, spec #424): Dutch only (no country field), all or nothing, the
// postcode stored as `1234 AB`. Pure rules, no I/O: the route asks, the repository stores the
// answer, and the database repeats the shape in check constraints.

/** The longest street and city, in characters (a bound against abuse, not a postal rule). */
export const ADDRESS_TEXT_MAX_LENGTH = 120;
/** The longest house number addition, e.g. "A" or "2 hoog". */
export const ADDRESS_ADDITION_MAX_LENGTH = 10;

const POSTCODE = /^([1-9][0-9]{3}) ?([A-Za-z]{2})$/;
const HOUSE_NUMBER = /^[0-9]{1,5}$/;

/**
 * A Dutch postcode as stored: four digits (not starting with 0), an optional space, two letters,
 * written `1234 AB`. `undefined` when the text is no postcode.
 */
export function normalizePostcode(input: string): string | undefined {
  const match = POSTCODE.exec(input.trim());
  return match ? `${match[1]} ${match[2]?.toUpperCase()}` : undefined;
}

/** The fields of an address as typed; every one may be empty. */
export interface AddressInput {
  readonly postcode: string;
  readonly houseNumber: string;
  readonly houseNumberAddition?: string | null | undefined;
  readonly street: string;
  readonly city: string;
}

/** An address as stored: complete, trimmed, the postcode normalized. */
export interface Address {
  readonly postcode: string;
  readonly houseNumber: string;
  readonly houseNumberAddition: string | null;
  readonly street: string;
  readonly city: string;
}

export type AddressField = 'postcode' | 'houseNumber' | 'houseNumberAddition' | 'street' | 'city';

export interface AddressIssue {
  readonly field: AddressField;
  /** `missing`: a field of a half-filled address is empty; `invalid`: the format is wrong. */
  readonly problem: 'missing' | 'invalid' | 'too-long';
}

export type AddressDecision =
  | { readonly ok: true; readonly address: Address | null }
  | { readonly ok: false; readonly issues: readonly AddressIssue[] };

/**
 * Whether the typed address is stored, and as what. An address is all or nothing: with any field
 * filled, the postcode, house number, street and city are required; with none filled (or no
 * address at all) there is no address. A filled postcode must be a Dutch one, a house number is
 * one to five digits. The issues come in field order.
 */
export function decideAddress(input: AddressInput | null | undefined): AddressDecision {
  if (!input) return { ok: true, address: null };
  const postcode = input.postcode.trim();
  const houseNumber = input.houseNumber.trim();
  const addition = (input.houseNumberAddition ?? '').trim();
  const street = input.street.trim();
  const city = input.city.trim();
  if (!postcode && !houseNumber && !addition && !street && !city) {
    return { ok: true, address: null };
  }

  const issues: AddressIssue[] = [];
  const normalized = postcode ? normalizePostcode(postcode) : undefined;
  if (!postcode) issues.push({ field: 'postcode', problem: 'missing' });
  else if (!normalized) issues.push({ field: 'postcode', problem: 'invalid' });
  if (!houseNumber) issues.push({ field: 'houseNumber', problem: 'missing' });
  else if (!HOUSE_NUMBER.test(houseNumber))
    issues.push({ field: 'houseNumber', problem: 'invalid' });
  if (addition.length > ADDRESS_ADDITION_MAX_LENGTH) {
    issues.push({ field: 'houseNumberAddition', problem: 'too-long' });
  }
  if (!street) issues.push({ field: 'street', problem: 'missing' });
  else if (street.length > ADDRESS_TEXT_MAX_LENGTH) {
    issues.push({ field: 'street', problem: 'too-long' });
  }
  if (!city) issues.push({ field: 'city', problem: 'missing' });
  else if (city.length > ADDRESS_TEXT_MAX_LENGTH)
    issues.push({ field: 'city', problem: 'too-long' });
  if (issues.length > 0 || !normalized) return { ok: false, issues };

  return {
    ok: true,
    address: {
      postcode: normalized,
      houseNumber,
      houseNumberAddition: addition || null,
      street,
      city,
    },
  };
}
