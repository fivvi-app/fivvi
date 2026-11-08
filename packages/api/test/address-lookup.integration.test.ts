import { readFileSync } from 'node:fs';
import {
  authUsers,
  consumeRateLimit,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type AddressLookup,
  type AddressLookupResult,
  createFakeAddressLookup,
} from '../src/address-lookup/index.ts';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F015 (spec #424), AC14 and AC16: GET /v1/workspaces/{workspaceId}/address-lookup. Synthetic
// people: John (Owner) and Sarah (Trainer) of John's Gym, Mike (Owner of Fit Studio), Anna (a
// client of John's Gym). The lookup behind the route is a stub or the fake: no network.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const FOUND = { street: 'Voorbeeldstraat', city: 'Amsterdam' };

describe('F015 the address lookup route', () => {
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

  afterEach(() => vi.restoreAllMocks());

  const stub = (result: AddressLookupResult) => {
    const lookup = vi.fn(async (_p: string, _n: string, _a: string | null) => result);
    return { lookup } satisfies AddressLookup & { lookup: typeof lookup };
  };

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
      consumeRateLimit: (key, rule) => consumeRateLimit(app.db, key, rule, new Date()),
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
    return { gym, other, john, sarah, mike, anna };
  }

  const lookup = (
    workspaceId: string,
    who?: { id: string },
    query = '?postcode=1234AB&houseNumber=1',
    server = api(),
  ) =>
    server.request(`/v1/workspaces/${workspaceId}/address-lookup${query}`, {
      headers: who ? { 'x-test-account': who.id } : {},
    });

  it('AC14: John looks up a known postcode and number and gets the street and the city', async () => {
    const { gym, john } = await world();
    const addressLookup = createFakeAddressLookup();

    const response = await lookup(
      gym.id,
      john,
      '?postcode=1234AB&houseNumber=1',
      api({ addressLookup }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(FOUND);
  });

  it('AC14: hands the normalized query to the lookup: the postcode as 1234 AB, the addition trimmed', async () => {
    const { gym, john } = await world();
    const addressLookup = stub(FOUND);

    await lookup(
      gym.id,
      john,
      '?postcode=1234ab&houseNumber=12&addition=%20A%20',
      api({ addressLookup }),
    );
    await lookup(gym.id, john, '?postcode=1234%20ab&houseNumber=12', api({ addressLookup }));

    expect(addressLookup.lookup.mock.calls).toEqual([
      ['1234 AB', '12', 'A'],
      ['1234 AB', '12', null],
    ]);
  });

  it('AC14: an unknown postcode and number answer 404', async () => {
    const { gym, john } = await world();

    const response = await lookup(
      gym.id,
      john,
      '?postcode=9999ZZ&houseNumber=1',
      api({ addressLookup: stub('not-found') }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 'not_found' });
  });

  it('AC14: a lookup that is unavailable answers 503, with a machine-readable body', async () => {
    const { gym, john } = await world();

    const response = await lookup(
      gym.id,
      john,
      undefined,
      api({ addressLookup: stub('unavailable') }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'unavailable' });
  });

  it.each([
    ['a bad postcode', '?postcode=12345&houseNumber=1', 'postcode'],
    ['a postcode that is only letters', '?postcode=abcd&houseNumber=1', 'postcode'],
    ['a non-numeric house number', '?postcode=1234AB&houseNumber=abc', 'houseNumber'],
    ['a house number with a letter', '?postcode=1234AB&houseNumber=1a', 'houseNumber'],
    [
      'an addition that is too long',
      `?postcode=1234AB&houseNumber=1&addition=${'A'.repeat(11)}`,
      'addition',
    ],
    ['an addition with a quote', '?postcode=1234AB&houseNumber=1&addition=a%22b', 'addition'],
    ['no postcode', '?houseNumber=1', 'postcode'],
    ['no house number', '?postcode=1234AB', 'houseNumber'],
    ['a blank postcode', '?postcode=%20&houseNumber=1', 'postcode'],
  ])('AC14: %s answers 422 and never calls the lookup', async (_name, query, field) => {
    const { gym, john } = await world();
    const addressLookup = stub(FOUND);

    const response = await lookup(gym.id, john, query, api({ addressLookup }));

    expect(response.status).toBe(422);
    const body = (await response.json()) as { code: string; issues: { path: string }[] };
    expect(body.code).toBe('validation_failed');
    expect(body.issues.map((issue) => issue.path)).toContain(field);
    expect(addressLookup.lookup).not.toHaveBeenCalled();
  });

  it('AC16: Owner only: a Trainer gets 403, a client 403, a person of another workspace 404, anonymous 401', async () => {
    const { gym, john, sarah, anna, mike } = await world();
    const addressLookup = stub(FOUND);
    const server = api({ addressLookup });

    const statuses = [
      (await lookup(gym.id, john, undefined, server)).status,
      (await lookup(gym.id, sarah, undefined, server)).status,
      (await lookup(gym.id, anna, undefined, server)).status,
      (await lookup(gym.id, mike, undefined, server)).status,
      (await lookup(gym.id, undefined, undefined, server)).status,
    ];

    expect(statuses).toEqual([200, 403, 403, 404, 401]);
    expect(addressLookup.lookup).toHaveBeenCalledTimes(1);
  });

  it('AC16: a refused caller learns nothing from the query: a bad query is still 403 for a Trainer', async () => {
    const { gym, sarah } = await world();
    const response = await lookup(gym.id, sarah, '?postcode=x&houseNumber=y');
    expect(response.status).toBe(403);
  });

  it('AC16: the 61st lookup in an hour answers 429, and a refused caller does not use the limit up', async () => {
    const { gym, other, john, sarah, mike } = await world();
    const addressLookup = stub(FOUND);
    const server = api({ addressLookup });
    for (let i = 0; i < 20; i++) await lookup(gym.id, sarah, undefined, server);

    const statuses: number[] = [];
    for (let i = 0; i < 61; i++)
      statuses.push((await lookup(gym.id, john, undefined, server)).status);

    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(200));
    expect(statuses[60]).toBe(429);
    const limited = await lookup(gym.id, john, undefined, server);
    expect(await limited.json()).toEqual({ code: 'rate_limited' });
    expect(addressLookup.lookup).toHaveBeenCalledTimes(60);
    // The limit is the workspace's: another workspace has its own.
    expect((await lookup(other.id, mike, undefined, server)).status).toBe(200);
  });

  it('AC16: nothing is logged, and no error report or product event is made', async () => {
    const { gym, john } = await world();
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const captureError = vi.fn();
    const track = vi.fn();
    const base = NO_DEPENDENCIES;
    const dependencies = {
      errorReporter: { ...base.errorReporter, captureError },
      productEvents: { ...base.productEvents, track },
    };

    for (const result of [FOUND, 'not-found', 'unavailable'] as const) {
      await lookup(gym.id, john, undefined, api({ ...dependencies, addressLookup: stub(result) }));
    }
    await lookup(gym.id, john, '?postcode=x&houseNumber=1', api(dependencies));

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(captureError).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('AC14: the route is in the contract with its access, query and answers', () => {
    const operation = contract.paths['/v1/workspaces/{workspaceId}/address-lookup']?.get;
    expect(operation.operationId).toBe('lookupAddress');
    expect(operation['x-access']).toEqual({
      type: 'workspace',
      capability: 'settings.manage',
      roles: ['owner'],
      client: 'none',
    });
    expect(operation.parameters.map((p: { name: string }) => p.name).sort()).toEqual([
      'addition',
      'houseNumber',
      'postcode',
      'workspaceId',
    ]);
    expect(Object.keys(operation.responses).sort()).toEqual(
      ['200', '401', '403', '404', '422', '429', '500', '503'].sort(),
    );
  });
});
