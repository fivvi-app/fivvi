/** The street and the city as the form holds them, and whether a lookup (not the Owner) wrote each. */
export interface FilledAddress {
  street: string;
  city: string;
  streetFilled: boolean;
  cityFilled: boolean;
}

/**
 * What the street and the city become when a lookup found an address (F015 AC13): a field that is
 * empty or was filled by an earlier lookup takes the new text; a field the Owner typed is never
 * replaced.
 */
export function fillFromLookup(
  current: FilledAddress,
  found: { street: string; city: string },
): FilledAddress {
  const takes = (value: string, filled: boolean) => filled || value.trim() === '';
  const street = takes(current.street, current.streetFilled);
  const city = takes(current.city, current.cityFilled);
  return {
    street: street ? found.street : current.street,
    city: city ? found.city : current.city,
    streetFilled: street || current.streetFilled,
    cityFilled: city || current.cityFilled,
  };
}

/**
 * What the street and the city become when the query they were looked up from no longer has an
 * address (no match, not a postcode and number, or blank): the fields a lookup filled are emptied
 * and lose their mark; a field the Owner typed is never touched.
 */
export function clearLookupFilled(current: FilledAddress): FilledAddress {
  return {
    street: current.streetFilled ? '' : current.street,
    city: current.cityFilled ? '' : current.city,
    streetFilled: false,
    cityFilled: false,
  };
}
