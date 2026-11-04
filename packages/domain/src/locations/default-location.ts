// The locations of a workspace (F015, F016, spec #424). At go-live a workspace has exactly one,
// its own (`organization_location`), and it is the default every session takes (`PRODUCT.md §12`,
// §13). The type list is complete now so that M7's types are additive; only the first is written.

/** The location types of `PRODUCT.md §12`. Only `organization_location` is written in M3. */
export const LOCATION_TYPES = [
  'organization_location',
  'external_gym',
  'client_home',
  'outdoor',
  'online',
  'other',
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** The longest location name, in characters. */
export const LOCATION_NAME_MAX_LENGTH = 120;

/**
 * The location every new session of the workspace takes (F016): its one default. The session
 * features of M4 call it; inference across locations is F019 and is not built here. A workspace
 * always has exactly one default (the database holds it to at most one, the creation of the
 * workspace to one), so anything else is a broken workspace and throws.
 */
export function defaultLocation<L extends { readonly isDefault: boolean }>(workspace: {
  readonly locations: readonly L[];
}): L {
  const defaults = workspace.locations.filter((location) => location.isDefault);
  const [only] = defaults;
  if (defaults.length !== 1 || !only) {
    throw new Error(`A workspace has exactly one default location, found ${defaults.length}.`);
  }
  return only;
}
