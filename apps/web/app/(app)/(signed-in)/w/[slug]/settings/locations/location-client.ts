/** The fields of the location form the API can refuse. */
export type LocationField =
  | 'name'
  | 'postcode'
  | 'houseNumber'
  | 'houseNumberAddition'
  | 'street'
  | 'city';

/**
 * Why the API refused a field: `required` is an empty name or an empty field of a half-filled
 * address (`too_small`), `tooLong` a text over its limit (`too_big`), `invalid` a postcode or house
 * number in the wrong format (`invalid_format`).
 */
export type FieldProblem = 'required' | 'tooLong' | 'invalid';

export type LocationRefusals = Partial<Record<LocationField, FieldProblem>>;

/** What the form holds, as typed. */
export interface LocationInput {
  name: string;
  postcode: string;
  houseNumber: string;
  houseNumberAddition: string;
  street: string;
  city: string;
}

export type SaveLocationResult =
  | { ok: true }
  /** The API refused fields: the page shows the messages under them; nothing changed. */
  | { ok: false; reason: 'fields'; refusals: LocationRefusals }
  /** Not signed in, or no longer allowed to change it: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

const FIELD_OF_PATH: Record<string, LocationField> = {
  name: 'name',
  'address.postcode': 'postcode',
  'address.houseNumber': 'houseNumber',
  'address.houseNumberAddition': 'houseNumberAddition',
  'address.street': 'street',
  'address.city': 'city',
};

const PROBLEM_OF_CODE: Record<string, FieldProblem> = {
  too_small: 'required',
  too_big: 'tooLong',
  invalid_format: 'invalid',
};

/** The refused fields of a `validation_failed` answer. Empty when the body names none we know. */
function refusalsOf(body: unknown): LocationRefusals {
  const issues = (body as { issues?: { path?: unknown; code?: unknown }[] } | null)?.issues;
  const refusals: LocationRefusals = {};
  if (!Array.isArray(issues)) return refusals;
  for (const { path, code } of issues) {
    const field = typeof path === 'string' ? FIELD_OF_PATH[path] : undefined;
    const problem = typeof code === 'string' ? PROBLEM_OF_CODE[code] : undefined;
    if (field && problem) refusals[field] = problem;
  }
  return refusals;
}

/**
 * Saves the name and the address of the location
 * (`PATCH /api/v1/workspaces/{workspaceId}/locations/{locationId}`, F015 AC4, AC5, AC15). Nothing
 * is checked before it asks: the API's rules are the only ones (the postcode, an address all or
 * nothing, which it stores as `1234 AB`), and its validation codes word the field errors. An
 * address with nothing in it removes the address.
 */
export async function saveLocation(
  workspaceId: string,
  locationId: string,
  input: LocationInput,
  fetchFn: typeof fetch = fetch,
): Promise<SaveLocationResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/locations/${locationId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        address: {
          postcode: input.postcode,
          houseNumber: input.houseNumber,
          houseNumberAddition: input.houseNumberAddition.trim() || null,
          street: input.street,
          city: input.city,
        },
      }),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 200) return { ok: true };
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status === 400) {
    const refusals = refusalsOf(await response.json().catch(() => null));
    if (Object.keys(refusals).length > 0) return { ok: false, reason: 'fields', refusals };
  }
  return { ok: false, reason: 'generic' };
}

/** The part of the form a lookup is made from. */
export interface AddressQuery {
  postcode: string;
  houseNumber: string;
  houseNumberAddition: string;
}

export type LookupAddressResult =
  | { kind: 'found'; street: string; city: string }
  /** No address has this postcode, number and addition (`404`). */
  | { kind: 'not-found' }
  /** The service did not answer, failed, or this workspace used its lookups of the hour. */
  | { kind: 'unavailable' }
  /** The API refused the query as typed (`422`): not a postcode and number yet; nothing to say. */
  | { kind: 'invalid' };

/**
 * Looks up the street and the city of a postcode and house number
 * (`GET /api/v1/workspaces/{workspaceId}/address-lookup`, F015 AC13, AC14). Always through our API,
 * never from the browser to the address service. The API decides whether the query is a valid one
 * (`422` when it isn't), so the form keeps no postcode rules of its own.
 */
export async function lookupAddress(
  workspaceId: string,
  query: AddressQuery,
  fetchFn: typeof fetch = fetch,
): Promise<LookupAddressResult> {
  const params = new URLSearchParams({
    postcode: query.postcode.trim(),
    houseNumber: query.houseNumber.trim(),
  });
  const addition = query.houseNumberAddition.trim();
  if (addition) params.set('addition', addition);
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/address-lookup?${params}`);
  } catch {
    return { kind: 'unavailable' };
  }
  if (response.status === 404) return { kind: 'not-found' };
  if (response.status === 422) return { kind: 'invalid' };
  if (response.status === 200) {
    const body = (await response.json().catch(() => null)) as {
      street?: unknown;
      city?: unknown;
    } | null;
    if (typeof body?.street === 'string' && typeof body.city === 'string') {
      return { kind: 'found', street: body.street, city: body.city };
    }
  }
  return { kind: 'unavailable' };
}
