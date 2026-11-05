import { and, asc, desc, eq } from 'drizzle-orm';
import { locations } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The locations of a workspace (F015, spec #424), through a workspace scope. At go-live each
// workspace has exactly one, made with the workspace (`createWorkspaceWithOwner`) or by the
// backfill migration; there is no function to create or delete another. The rules (the postcode
// format, an address all or nothing) are in `packages/domain`; the table repeats them in checks.

/** A location's address as the API shows it: complete, the postcode stored as `1234 AB`. */
export interface LocationAddress {
  readonly postcode: string;
  readonly houseNumber: string;
  readonly houseNumberAddition: string | null;
  readonly street: string;
  readonly city: string;
}

export interface LocationView {
  readonly id: string;
  readonly name: string;
  readonly type: (typeof locations.type.enumValues)[number];
  /** `null` when the location has no address. */
  readonly address: LocationAddress | null;
  readonly isDefault: boolean;
}

/** What an Owner may change: the fields given change, the others stay. */
export interface LocationChanges {
  /** Trimmed and checked by the caller. */
  readonly name?: string;
  /** Checked and normalized by the caller; `null` removes the address. */
  readonly address?: LocationAddress | null;
}

const columns = {
  id: locations.id,
  name: locations.name,
  type: locations.type,
  postcode: locations.postcode,
  houseNumber: locations.houseNumber,
  houseNumberAddition: locations.houseNumberAddition,
  street: locations.street,
  city: locations.city,
  isDefault: locations.isDefault,
};

function toView(row: {
  id: string;
  name: string;
  type: LocationView['type'];
  postcode: string | null;
  houseNumber: string | null;
  houseNumberAddition: string | null;
  street: string | null;
  city: string | null;
  isDefault: boolean;
}): LocationView {
  const { postcode, houseNumber, houseNumberAddition, street, city, ...rest } = row;
  // The table holds the address all or nothing, so one missing field means none.
  const address =
    postcode !== null && houseNumber !== null && street !== null && city !== null
      ? { postcode, houseNumber, houseNumberAddition, street, city }
      : null;
  return { ...rest, address };
}

/** The workspace's locations, the default first, then by name (and ID, so the order is stable). */
export async function listLocations(scope: WorkspaceScope): Promise<LocationView[]> {
  const rows = await executorOf(scope)
    .select(columns)
    .from(locations)
    .where(eq(locations.organizationId, scope.workspaceId))
    .orderBy(desc(locations.isDefault), asc(locations.name), asc(locations.id));
  return rows.map(toView);
}

/** One location of the scope's workspace; `undefined` when it has no such location (RLS shows no row of another). */
export async function findLocation(
  scope: WorkspaceScope,
  locationId: string,
): Promise<LocationView | undefined> {
  const [row] = await executorOf(scope)
    .select(columns)
    .from(locations)
    .where(and(eq(locations.organizationId, scope.workspaceId), eq(locations.id, locationId)));
  return row ? toView(row) : undefined;
}

/**
 * Changes the name and/or the address of one location of the scope's workspace and nothing else:
 * not the type, not which one is the default. `undefined` when the workspace has no such location
 * (RLS shows no row of another). With nothing to change it just reads the location.
 */
export async function updateLocation(
  scope: WorkspaceScope,
  locationId: string,
  changes: LocationChanges,
): Promise<LocationView | undefined> {
  const db = executorOf(scope);
  const values = {
    ...(changes.name === undefined ? {} : { name: changes.name }),
    ...(changes.address === undefined
      ? {}
      : {
          postcode: changes.address?.postcode ?? null,
          houseNumber: changes.address?.houseNumber ?? null,
          houseNumberAddition: changes.address?.houseNumberAddition ?? null,
          street: changes.address?.street ?? null,
          city: changes.address?.city ?? null,
        }),
  };
  const where = and(eq(locations.organizationId, scope.workspaceId), eq(locations.id, locationId));
  const [row] =
    Object.keys(values).length === 0
      ? await db.select(columns).from(locations).where(where)
      : await db.update(locations).set(values).where(where).returning(columns);
  return row ? toView(row) : undefined;
}
