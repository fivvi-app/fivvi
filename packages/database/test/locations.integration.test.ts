import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cloneTemplateDatabase,
  createTestDatabase,
  type TestDatabase,
} from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createTenantScopes,
  createWorkspaceWithOwner,
  type DatabaseClient,
  type DatabaseExecutor,
  listLocations,
  locations,
  updateLocation,
  type WorkspaceScope,
} from '../src/index.ts';
import { migrationsFolder, runMigrations } from '../src/migrate.ts';
import { addTeamRole, createAccount, createWorkspace } from '../src/testing/index.ts';

// The locations of a workspace (F015, spec #424): the table, the creation with the workspace, the
// backfill and the repository functions, as the app role where RLS applies.

const OWN = { type: 'organization_location' } as const;
const ADDRESS = {
  postcode: '1234 AB',
  houseNumber: '1',
  houseNumberAddition: null,
  street: 'Voorbeeldstraat',
  city: 'Amsterdam',
} as const;

async function rows<T>(db: DatabaseExecutor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

describe('F015 locations', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 6 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const scopes = () => createTenantScopes(() => app.db);

  /** Runs as a team member of the workspace and returns what `run` returns. */
  async function asTeam<T>(
    accountId: string,
    workspaceId: string,
    run: (scope: WorkspaceScope) => Promise<T>,
  ): Promise<T> {
    const entry = await scopes().inWorkspaceScope(
      { accountId, workspaceId, admit: () => 'team' },
      run,
    );
    if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
    return entry.value;
  }

  /** The constraint a statement violates, or `undefined` when it succeeds (rolled back either way). */
  async function violated(insert: (db: DatabaseExecutor) => Promise<unknown>) {
    try {
      await admin.db.transaction(async (tx) => {
        await insert(tx);
        throw new Error('rollback');
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
      if (cause?.code) return cause.constraint ?? cause.code;
      if ((error as Error).message !== 'rollback') throw error;
    }
    return undefined;
  }

  it('AC1: the database allows one default location per workspace and refuses a second', async () => {
    const gym = await createWorkspace(admin.db, { location: false });
    const other = await createWorkspace(admin.db, { location: false });
    await admin.db.insert(locations).values({
      organizationId: gym.id,
      name: 'Own',
      ...OWN,
      isDefault: true,
    });

    expect(
      await violated((tx) =>
        tx
          .insert(locations)
          .values({ organizationId: gym.id, name: 'Second', ...OWN, isDefault: true }),
      ),
    ).toBe('locations_organization_id_default_unique');
    // Not default: any number; another workspace has its own default.
    expect(
      await violated((tx) =>
        tx.insert(locations).values([
          { organizationId: gym.id, name: 'Elsewhere', type: 'external_gym' },
          { organizationId: gym.id, name: 'Elsewhere 2', type: 'external_gym' },
          { organizationId: other.id, name: 'Own', ...OWN, isDefault: true },
        ]),
      ),
    ).toBeUndefined();
  });

  it('AC1: has the six location types of PRODUCT.md §12', async () => {
    const [row] = await rows<{ values: string[] }>(
      admin.db,
      sql`select array_agg(enumlabel::text order by enumsortorder) as values
          from pg_enum where enumtypid = 'location_type'::regtype`,
    );
    expect(row?.values).toEqual([
      'organization_location',
      'external_gym',
      'client_home',
      'outdoor',
      'online',
      'other',
    ]);
  });

  it('AC15: the database refuses an address that is not all or nothing, a bad postcode and a bad name', async () => {
    const gym = await createWorkspace(admin.db, { location: false });
    const insert = (values: Partial<typeof locations.$inferInsert>) =>
      violated((tx) =>
        tx.insert(locations).values({ organizationId: gym.id, name: 'Own', ...OWN, ...values }),
      );

    expect(await insert({})).toBeUndefined();
    expect(await insert(ADDRESS)).toBeUndefined();
    expect(await insert({ ...ADDRESS, houseNumberAddition: '2 hoog' })).toBeUndefined();
    // Half-filled, or an addition on its own.
    expect(await insert({ postcode: '1234 AB' })).toBe('locations_address_all_or_nothing');
    expect(await insert({ ...ADDRESS, city: null })).toBe('locations_address_all_or_nothing');
    expect(await insert({ houseNumberAddition: 'A' })).toBe('locations_address_all_or_nothing');
    // The postcode is stored as 1234 AB.
    expect(await insert({ ...ADDRESS, postcode: '12345' })).toBe('locations_postcode_format');
    expect(await insert({ ...ADDRESS, postcode: '1234ab' })).toBe('locations_postcode_format');
    expect(await insert({ ...ADDRESS, postcode: '1234 ab' })).toBe('locations_postcode_format');
    expect(await insert({ ...ADDRESS, postcode: '0123 AB' })).toBe('locations_postcode_format');
    expect(await insert({ ...ADDRESS, houseNumber: '123456' })).toBe(
      'locations_house_number_format',
    );
    expect(await insert({ ...ADDRESS, houseNumber: '1a' })).toBe('locations_house_number_format');
    expect(await insert({ ...ADDRESS, street: ' ' })).toBe('locations_address_text_valid');
    expect(await insert({ name: ' ' })).toBe('locations_name_valid');
    expect(await insert({ name: 'x'.repeat(121) })).toBe('locations_name_valid');
    expect(await insert({ name: 'x'.repeat(120) })).toBeUndefined();
  });

  it('AC2: creating a workspace creates its location named after it, with no address, in the same transaction', async () => {
    const account = await createAccount(admin.db, { label: 'pilot' });
    const created = await scopes().inAccountScope(
      { accountId: account.id, workspaces: 'team' },
      (scope) =>
        createWorkspaceWithOwner(scope, {
          name: 'Pilot Two',
          slug: 'pilot-two',
          defaultLocale: 'nl-NL',
          timeZone: 'Europe/Amsterdam',
          ownerTrains: true,
        }),
    );
    const workspaceId = created?.id ?? '';

    expect(
      await admin.db.select().from(locations).where(eq(locations.organizationId, workspaceId)),
    ).toEqual([
      expect.objectContaining({
        name: 'Pilot Two',
        type: 'organization_location',
        isDefault: true,
        postcode: null,
        houseNumber: null,
        houseNumberAddition: null,
        street: null,
        city: null,
      }),
    ]);

    // A taken slug creates nothing: no workspace, so no location either.
    const before = await admin.db.$count(locations);
    const again = await scopes().inAccountScope(
      { accountId: account.id, workspaces: 'team' },
      (scope) =>
        createWorkspaceWithOwner(scope, {
          name: 'Pilot Three',
          slug: 'pilot-two',
          defaultLocale: 'nl-NL',
          timeZone: 'Europe/Amsterdam',
          ownerTrains: false,
        }),
    );
    expect(again).toBeUndefined();
    expect(await admin.db.$count(locations)).toBe(before);
  });

  it('AC4: reads the location and updates its name and address; null clears the address', async () => {
    const gym = await createWorkspace(admin.db);
    const owner = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: owner.id, role: 'owner' });

    const result = await asTeam(owner.id, gym.id, async (scope) => {
      const [own] = await listLocations(scope);
      if (!own) throw new Error('no location');
      const renamed = await updateLocation(scope, own.id, {
        name: "John's Gym Centrum",
        address: ADDRESS,
      });
      const afterRename = await listLocations(scope);
      const nameOnly = await updateLocation(scope, own.id, { name: 'Centrum' });
      const cleared = await updateLocation(scope, own.id, { address: null });
      const unknown = await updateLocation(scope, crypto.randomUUID(), { name: 'Nowhere' });
      return { own, renamed, afterRename, nameOnly, cleared, unknown };
    });

    expect(result.own).toEqual({
      id: expect.any(String),
      name: gym.marker,
      type: 'organization_location',
      address: null,
      isDefault: true,
    });
    expect(result.renamed).toEqual({
      ...result.own,
      name: "John's Gym Centrum",
      address: ADDRESS,
    });
    expect(result.afterRename).toEqual([result.renamed]);
    expect(result.nameOnly).toMatchObject({ name: 'Centrum', address: ADDRESS });
    expect(result.cleared).toMatchObject({ name: 'Centrum', address: null });
    expect(result.unknown).toBeUndefined();
  });

  it('AC7: a location of another workspace is out of reach, to read and to update', async () => {
    const gym = await createWorkspace(admin.db);
    const studio = await createWorkspace(admin.db);
    const owner = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: owner.id, role: 'owner' });
    const [studios] = await admin.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, studio.id));

    await asTeam(owner.id, gym.id, async (scope) => {
      expect((await listLocations(scope)).map((location) => location.name)).toEqual([gym.marker]);
      expect(
        await updateLocation(scope, studios?.id ?? '', { name: 'Taken over' }),
      ).toBeUndefined();
    });
    const [untouched] = await admin.db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, studios?.id ?? ''));
    expect(untouched?.name).toBe(studio.marker);
  });
});

describe('F015 the backfill', () => {
  it('AC3: gives every existing workspace one location named after it, and running it twice changes nothing', async () => {
    const backfill = '0018_locations_backfill';
    const journal = JSON.parse(
      await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    const index = journal.entries.findIndex((entry) => entry.tag === backfill);
    expect(index).toBeGreaterThanOrEqual(0);

    const previous = await mkdtemp(join(tmpdir(), 'fivvi-migrations-'));
    const database = await createTestDatabase();
    const client = createDatabase({ url: database.url, maxConnections: 2 });
    try {
      await cp(migrationsFolder, previous, { recursive: true });
      // The journal cut just before the backfill: the table exists, the workspaces have no location.
      await writeFile(
        join(previous, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }),
      );
      await migrate(client.db, { migrationsFolder: previous });
      await client.db.execute(
        sql`insert into organizations (name, slug, default_locale, time_zone)
            values ('Older Gym', 'older-gym', 'nl-NL', 'Europe/Amsterdam'),
                   ('Older Studio', 'older-studio', 'en', 'Europe/Amsterdam')`,
      );
      expect(await client.db.$count(locations)).toBe(0);

      await runMigrations(client.db);
      const located = async () =>
        rows<{ name: string; type: string; is_default: boolean; street: string | null }>(
          client.db,
          sql`select o.slug, l.name, l.type, l.is_default, l.street
              from organizations o join locations l on l.organization_id = o.id order by o.slug`,
        );
      const afterMigration = await located();
      expect(afterMigration).toEqual([
        expect.objectContaining({
          name: 'Older Gym',
          type: 'organization_location',
          is_default: true,
          street: null,
        }),
        expect.objectContaining({
          name: 'Older Studio',
          type: 'organization_location',
          is_default: true,
          street: null,
        }),
      ]);

      // A workspace renamed since, and a location the Owner edited, stay as they are when the SQL runs again.
      await client.db.execute(sql`update locations set name = 'Edited' where name = 'Older Gym'`);
      const statements = (await readFile(join(migrationsFolder, `${backfill}.sql`), 'utf8')).split(
        '--> statement-breakpoint',
      );
      for (const statement of statements) await client.db.execute(sql.raw(statement));
      expect(await client.db.$count(locations)).toBe(2);
      expect((await located()).map((row) => row.name)).toEqual(['Edited', 'Older Studio']);
    } finally {
      await client.close();
      await database.drop();
      await rm(previous, { recursive: true, force: true });
    }
  });
});
