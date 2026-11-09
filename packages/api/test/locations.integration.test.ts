import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  locations,
  type SignedInAccount,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F015 (spec #424): GET /v1/workspaces/{workspaceId}/locations and PATCH …/locations/{locationId}.
// Synthetic people: John (Owner) and Sarah (Trainer) of John's Gym, Mike (Owner of Fit Studio),
// Anna (a client of John's Gym with no team role). The addresses are invented.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface LocationBody {
  id: string;
  name: string;
  type: string;
  address: null | Record<string, string | null>;
  isDefault: boolean;
}

const ADDRESS = {
  postcode: '1234 AB',
  houseNumber: '1',
  houseNumberAddition: null,
  street: 'Voorbeeldstraat',
  city: 'Amsterdam',
};

describe('F015 the locations of a workspace', () => {
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

  const api = (overrides: Partial<ApiDependencies> = {}) =>
    createApp({
      ...NO_DEPENDENCIES,
      findSignedInAccount: async (headers) => {
        const id = headers.get('x-test-account');
        if (!id) return undefined;
        const [row] = await admin.db
          .select({
            id: authUsers.id,
            email: authUsers.email,
            name: authUsers.name,
            preferredLocale: authUsers.preferredLocale,
          })
          .from(authUsers)
          .where(eq(authUsers.id, id));
        return row satisfies SignedInAccount | undefined;
      },
      tenantScopes: createTenantScopes(() => app.db),
      ...overrides,
    });

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    const anna = await createAccount(admin.db, { label: 'anna' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    await addClient(admin.db, { workspaceId: gym.id, accountId: anna.id });
    const [location] = await admin.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, gym.id));
    const [otherLocation] = await admin.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, other.id));
    return {
      gym,
      other,
      john,
      sarah,
      mike,
      anna,
      locationId: location?.id ?? '',
      otherLocationId: otherLocation?.id ?? '',
    };
  }

  const list = (workspaceId: string, who?: { id: string }, server = api()) =>
    server.request(`/v1/workspaces/${workspaceId}/locations`, {
      headers: who ? { 'x-test-account': who.id } : {},
    });

  const patch = (
    workspaceId: string,
    locationId: string,
    body: unknown,
    who?: { id: string },
    server = api(),
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/locations/${locationId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(who ? { 'x-test-account': who.id } : {}) },
      body: JSON.stringify(body),
    });

  it('AC8: the list holds the one default location: id, name, type, address or null, isDefault', async () => {
    const { gym, john, locationId } = await world();

    const response = await list(gym.id, john);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: locationId,
        name: gym.marker,
        type: 'organization_location',
        address: null,
        isDefault: true,
      },
    ]);
  });

  it('AC8: there is no route to create or delete a location', async () => {
    const { gym, john, locationId } = await world();
    const headers = { 'x-test-account': john.id };

    const created = await api().request(`/v1/workspaces/${gym.id}/locations`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Second' }),
    });
    const deleted = await api().request(`/v1/workspaces/${gym.id}/locations/${locationId}`, {
      method: 'DELETE',
      headers,
    });

    expect([created.status, deleted.status]).toEqual([404, 404]);
    expect(Object.keys(contract.paths['/v1/workspaces/{workspaceId}/locations'])).toEqual(['get']);
    expect(
      Object.keys(contract.paths['/v1/workspaces/{workspaceId}/locations/{locationId}']),
    ).toEqual(['patch']);
  });

  it('AC4: John updates the name and the address; the next read returns them', async () => {
    const { gym, john, locationId } = await world();

    const response = await patch(
      gym.id,
      locationId,
      {
        name: "John's Gym Centrum",
        address: { ...ADDRESS, houseNumberAddition: '2 hoog' },
      },
      john,
    );

    expect(response.status).toBe(200);
    const expected = {
      id: locationId,
      name: "John's Gym Centrum",
      type: 'organization_location',
      address: { ...ADDRESS, houseNumberAddition: '2 hoog' },
      isDefault: true,
    };
    expect(await response.json()).toEqual(expected);
    expect(await (await list(gym.id, john)).json()).toEqual([expected]);
  });

  it('AC4: the name alone keeps the address, the address alone keeps the name, null removes the address', async () => {
    const { gym, john, locationId } = await world();
    await patch(gym.id, locationId, { address: ADDRESS }, john);

    const renamed = await patch(gym.id, locationId, { name: '  Centrum  ' }, john);
    expect(await renamed.json()).toMatchObject({ name: 'Centrum', address: ADDRESS });

    const cleared = await patch(gym.id, locationId, { address: null }, john);
    expect(await cleared.json()).toMatchObject({ name: 'Centrum', address: null });

    // Emptying every field is the same as no address.
    await patch(gym.id, locationId, { address: ADDRESS }, john);
    const emptied = await patch(
      gym.id,
      locationId,
      { address: { postcode: '', houseNumber: '', houseNumberAddition: '', street: '', city: '' } },
      john,
    );
    expect(emptied.status).toBe(200);
    expect(await emptied.json()).toMatchObject({ address: null });
  });

  it('AC15: "1234ab" is stored as "1234 AB"', async () => {
    const { gym, john, locationId } = await world();

    const response = await patch(
      gym.id,
      locationId,
      { address: { ...ADDRESS, postcode: '1234ab' } },
      john,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ address: { postcode: '1234 AB' } });
    const [row] = await admin.db
      .select({ postcode: locations.postcode })
      .from(locations)
      .where(eq(locations.id, locationId));
    expect(row?.postcode).toBe('1234 AB');
  });

  it('AC15: invalid postcodes and half-filled addresses are refused with the field named, and nothing changes', async () => {
    const { gym, john, locationId } = await world();
    const unchanged = async () => (await (await list(gym.id, john)).json()) as LocationBody[];
    const before = await unchanged();

    const cases: [unknown, { path: string; code: string }[]][] = [
      [
        { address: { ...ADDRESS, postcode: '12345' } },
        [{ path: 'address.postcode', code: 'invalid_format' }],
      ],
      [
        { address: { ...ADDRESS, postcode: '1234 A' } },
        [{ path: 'address.postcode', code: 'invalid_format' }],
      ],
      [
        { address: { ...ADDRESS, houseNumber: '123456' } },
        [{ path: 'address.houseNumber', code: 'invalid_format' }],
      ],
      [
        { address: { ...ADDRESS, street: '', city: ' ' } },
        [
          { path: 'address.street', code: 'too_small' },
          { path: 'address.city', code: 'too_small' },
        ],
      ],
      [
        { address: { ...ADDRESS, postcode: '', houseNumber: '' } },
        [
          { path: 'address.postcode', code: 'too_small' },
          { path: 'address.houseNumber', code: 'too_small' },
        ],
      ],
      [
        {
          address: {
            postcode: '',
            houseNumber: '',
            houseNumberAddition: 'A',
            street: '',
            city: '',
          },
        },
        [
          { path: 'address.postcode', code: 'too_small' },
          { path: 'address.houseNumber', code: 'too_small' },
          { path: 'address.street', code: 'too_small' },
          { path: 'address.city', code: 'too_small' },
        ],
      ],
      [
        { address: { ...ADDRESS, street: 'x'.repeat(121) } },
        [{ path: 'address.street', code: 'too_big' }],
      ],
      // The name is valid; the address refuses the whole change.
      [
        { name: 'Renamed', address: { ...ADDRESS, postcode: '12345' } },
        [{ path: 'address.postcode', code: 'invalid_format' }],
      ],
    ];
    for (const [body, issues] of cases) {
      const response = await patch(gym.id, locationId, body, john);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: 'validation_failed', issues });
    }

    expect(await unchanged()).toEqual(before);
  });

  it('AC5: an empty or over-120-character name is refused with a field error, and nothing changes', async () => {
    const { gym, john, locationId } = await world();

    for (const [name, code] of [
      ['', 'too_small'],
      ['   ', 'too_small'],
      ['x'.repeat(121), 'too_big'],
    ] as const) {
      const response = await patch(gym.id, locationId, { name }, john);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'name', code }],
      });
    }
    expect((await patch(gym.id, locationId, { name: 'x'.repeat(120) }, john)).status).toBe(200);
    // A body that changes nothing is refused on the name; so is one that is no object.
    expect((await patch(gym.id, locationId, {}, john)).status).toBe(400);
    expect((await patch(gym.id, locationId, 'name', john)).status).toBe(400);
    const [row] = (await (await list(gym.id, john)).json()) as LocationBody[];
    expect(row?.name).toBe('x'.repeat(120));
  });

  it('keeps the type and the default: they are not in the body, and a body that names them changes nothing', async () => {
    const { gym, john, locationId } = await world();

    const response = await patch(
      gym.id,
      locationId,
      { name: 'Same', type: 'online', isDefault: false, organizationId: crypto.randomUUID() },
      john,
    );

    expect(await response.json()).toMatchObject({
      name: 'Same',
      type: 'organization_location',
      isDefault: true,
    });
  });

  it('AC6: Sarah (Trainer) reads (200) and cannot update (403)', async () => {
    const { gym, sarah, locationId } = await world();

    const read = await list(gym.id, sarah);
    const update = await patch(gym.id, locationId, { name: 'Sarah’s now' }, sarah);

    expect(read.status).toBe(200);
    expect(((await read.json()) as LocationBody[]).map(({ name }) => name)).toEqual([gym.marker]);
    expect(update.status).toBe(403);
    expect(await update.json()).toEqual({ code: 'forbidden' });
    const [row] = await admin.db.select().from(locations).where(eq(locations.id, locationId));
    expect(row?.name).toBe(gym.marker);
  });

  it('AC7: Mike (Owner of Fit Studio) gets 404 on every John’s Gym location route; anonymous 401; Anna (client only) 403', async () => {
    const { gym, other, mike, anna, locationId, otherLocationId } = await world();

    const answers = [
      await list(gym.id, mike),
      await patch(gym.id, locationId, { name: 'Taken over' }, mike),
    ];
    expect(answers.map((r) => r.status)).toEqual([404, 404]);
    for (const answer of answers) expect(await answer.json()).toEqual({ code: 'not_found' });

    // His own workspace, John’s location: the record is out of reach, the answer the same.
    const crossed = await patch(other.id, locationId, { name: 'Taken over' }, mike);
    expect(crossed.status).toBe(404);
    expect(await crossed.json()).toEqual({ code: 'not_found' });
    expect((await list(other.id, mike)).status).toBe(200);
    expect((await patch(other.id, otherLocationId, { name: 'Fit Studio Zuid' }, mike)).status).toBe(
      200,
    );

    expect((await list(gym.id)).status).toBe(401);
    expect((await patch(gym.id, locationId, { name: 'Anonymous' })).status).toBe(401);
    expect((await list(gym.id, anna)).status).toBe(403);
    expect((await patch(gym.id, locationId, { name: 'Anna' }, anna)).status).toBe(403);

    const [row] = await admin.db.select().from(locations).where(eq(locations.id, locationId));
    expect(row?.name).toBe(gym.marker);
    // A workspace or a location that does not exist, or no ID at all.
    const { john } = await world();
    expect((await list(crypto.randomUUID(), john)).status).toBe(404);
    expect((await list('not-a-uuid', john)).status).toBe(404);
  });

  it('AC7: an unknown location of the workspace is 404 for its Owner, a malformed ID 400', async () => {
    const { gym, john } = await world();

    const unknown = await patch(gym.id, crypto.randomUUID(), { name: 'Nowhere' }, john);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ code: 'not_found' });
    expect((await patch(gym.id, 'not-a-uuid', { name: 'Nowhere' }, john)).status).toBe(400);
  });

  it('AC9 (the other way): renaming the location does not rename the workspace', async () => {
    const { gym, john, locationId } = await world();

    await patch(gym.id, locationId, { name: 'Centrum' }, john);

    const workspace = await api().request(`/v1/workspaces/${gym.id}`, {
      headers: { 'x-test-account': john.id },
    });
    expect(await workspace.json()).toMatchObject({ name: gym.marker });
  });

  it('AC10: both routes are in the committed contract with their access', () => {
    const read = contract.paths['/v1/workspaces/{workspaceId}/locations'].get;
    const update = contract.paths['/v1/workspaces/{workspaceId}/locations/{locationId}'].patch;

    expect(read.operationId).toBe('listLocations');
    expect(read['x-access']).toEqual({
      type: 'workspace',
      capability: 'location.read',
      roles: ['owner', 'trainer'],
      client: 'none',
    });
    expect(update.operationId).toBe('updateLocation');
    expect(update['x-access']).toEqual({
      type: 'workspace',
      capability: 'settings.manage',
      roles: ['owner'],
      client: 'none',
    });
    expect(Object.keys(update.responses).toSorted().map(Number)).toEqual([
      200, 400, 401, 403, 404, 500,
    ]);
    const name = contract.components.schemas.UpdateLocationRequest.properties.name;
    expect(name).toMatchObject({ type: 'string', minLength: 1, maxLength: 120 });
    expect(contract.components.schemas.LocationType.enum).toEqual([
      'organization_location',
      'external_gym',
      'client_home',
      'outdoor',
      'online',
      'other',
    ]);
  });

  it('AC11: location_updated carries the workspace ID only: no name, no address, anywhere', async () => {
    const lines: string[] = [];
    const logs = (['error', 'log', 'warn', 'info'] as const).map((level) =>
      vi
        .spyOn(console, level)
        .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const { gym, john, sarah, locationId } = await world();
    const server = api({ productEvents });

    // A refusal and an invalid change record nothing.
    await patch(gym.id, locationId, { name: 'Geheime Naam' }, sarah, server);
    await patch(gym.id, locationId, { name: '' }, john, server);
    await patch(gym.id, locationId, { address: { ...ADDRESS, postcode: '12345' } }, john, server);
    expect(posthog.events).toEqual([]);

    const secret = { ...ADDRESS, street: 'Geheimstraat', city: 'Geheimdorp' };
    expect(
      (await patch(gym.id, locationId, { name: 'Geheime Naam', address: secret }, john, server))
        .status,
    ).toBe(200);

    expect(posthog.events.map(({ event }) => event)).toEqual(['location_updated']);
    // The SDK adds its own `$…` properties; ours are exactly this one.
    expect(
      Object.fromEntries(
        Object.entries(posthog.events[0]?.properties ?? {}).filter(([key]) => !key.startsWith('$')),
      ),
    ).toEqual({ workspace_id: gym.id });
    expect(posthog.events[0]?.distinct_id).toBe(john.id);
    const sent = JSON.stringify([posthog.events, lines]);
    for (const personal of ['Geheime Naam', 'Geheimstraat', 'Geheimdorp', '1234 AB', john.email]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });
});
