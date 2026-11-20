import { readFileSync } from 'node:fs';
import {
  authUsers,
  clientBillingDetails,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F059 (spec #474, ticket #853): the billing details of a client. The client's own, GET and PUT
// /v1/workspaces/{workspaceId}/me/billing-details, and the Owner's on their behalf, GET and PUT
// …/clients/{clientId}/billing-details. Synthetic people: John (Owner of John's Gym), Sarah
// (Trainer), Mike (Owner of Fit Studio), Anna and Mark (clients of John's Gym, Mark of Fit Studio
// too).

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const JANSEN = {
  asCompany: true,
  companyName: 'Jansen Advies B.V.',
  street: 'Testweg',
  houseNumber: '2',
  houseNumberAddition: null,
  postcode: '5678 CD',
  city: 'Utrecht',
  vatNumber: 'NL000000000B02',
};

const emptyFor = (clientId: string) => ({
  clientId,
  asCompany: false,
  companyName: null,
  street: null,
  houseNumber: null,
  houseNumberAddition: null,
  postcode: null,
  city: null,
  vatNumber: null,
  changedBy: null,
  changedAt: null,
});

describe('F059 the billing details of a client', () => {
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

  const api = () =>
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
    });

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const studio = await createWorkspace(admin.db, { label: 'fit-studio' });
    const john = await createAccount(admin.db, { label: 'john' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    const anna = await createAccount(admin.db, { label: 'anna' });
    const mark = await createAccount(admin.db, { label: 'mark' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id, role: 'trainer' });
    await addTeamRole(admin.db, { workspaceId: studio.id, accountId: mike.id, role: 'owner' });
    const annaClient = await addClient(admin.db, { workspaceId: gym.id, accountId: anna.id });
    const markClient = await addClient(admin.db, { workspaceId: gym.id, accountId: mark.id });
    const markAtStudio = await addClient(admin.db, { workspaceId: studio.id, accountId: mark.id });
    return { gym, studio, john, sarah, mike, anna, mark, annaClient, markClient, markAtStudio };
  }

  const request = (method: string, path: string, who?: { id: string }, body?: unknown) =>
    api().request(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(who ? { 'x-test-account': who.id } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const mine = (workspaceId: string) => `/v1/workspaces/${workspaceId}/me/billing-details`;
  const ofClient = (workspaceId: string, clientId: string) =>
    `/v1/workspaces/${workspaceId}/clients/${clientId}/billing-details`;

  const rowsOf = (clientId: string) =>
    admin.db.select().from(clientBillingDetails).where(eq(clientBillingDetails.clientId, clientId));

  it('#853: Mark saves Jansen Advies B.V. and reads it back, changed by the client', async () => {
    const { gym, mark, markClient } = await world();

    const saved = await request('PUT', mine(gym.id), mark, JANSEN);
    const readBack = await request('GET', mine(gym.id), mark);

    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { changedAt: unknown };
    expect(body).toMatchObject({ ...JANSEN, changedBy: 'client' });
    expect(typeof body.changedAt).toBe('string');
    expect(await readBack.json()).toEqual(body);
    expect(await rowsOf(markClient.id)).toHaveLength(1);
  });

  it('a client with nothing saved has the empty details (invoice in their own name)', async () => {
    const { gym, anna, annaClient } = await world();

    const response = await request('GET', mine(gym.id), anna);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(emptyFor(annaClient.id));
  });

  it('#853: Mark’s details at Fit Studio are separate and empty', async () => {
    const { gym, studio, mark, markAtStudio } = await world();
    await request('PUT', mine(gym.id), mark, JANSEN);

    const atStudio = await request('GET', mine(studio.id), mark);

    expect(await atStudio.json()).toEqual(emptyFor(markAtStudio.id));
    const saved = await request('PUT', mine(studio.id), mark, {
      ...JANSEN,
      companyName: 'Jansen Studio B.V.',
    });
    expect(await saved.json()).toMatchObject({ companyName: 'Jansen Studio B.V.' });
    expect(await (await request('GET', mine(gym.id), mark)).json()).toMatchObject({
      companyName: 'Jansen Advies B.V.',
    });
  });

  it('an empty VAT number is accepted, a given one has the VAT number format', async () => {
    const { gym, anna } = await world();

    for (const vatNumber of [null, '', '  ']) {
      const response = await request('PUT', mine(gym.id), anna, { ...JANSEN, vatNumber });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ vatNumber: null });
    }
    const bad = await request('PUT', mine(gym.id), anna, { ...JANSEN, vatNumber: 'NL12B' });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'vatNumber', code: 'invalid_vat_number' }],
    });
    // Capitals are kept.
    const lower = await request('PUT', mine(gym.id), anna, {
      ...JANSEN,
      vatNumber: 'nl000000000b02',
    });
    expect(await lower.json()).toMatchObject({ vatNumber: 'NL000000000B02' });
  });

  it('a company invoice without a company name answers 422 with the field and saves nothing', async () => {
    const { gym, anna, annaClient } = await world();

    const response = await request('PUT', mine(gym.id), anna, { ...JANSEN, companyName: '  ' });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'companyName', code: 'required' }],
    });
    expect(await rowsOf(annaClient.id)).toHaveLength(0);
    const empty = await request('PUT', mine(gym.id), anna, { asCompany: true });
    expect(empty.status).toBe(422);
    expect(
      ((await empty.json()) as { issues: { path: string }[] }).issues.map(
        (issue: { path: string }) => issue.path,
      ),
    ).toEqual(['companyName', 'postcode', 'houseNumber', 'street', 'city']);
  });

  it('switching the company off clears the details, and a body of the wrong shape answers 400', async () => {
    const { gym, anna } = await world();
    await request('PUT', mine(gym.id), anna, JANSEN);

    const off = await request('PUT', mine(gym.id), anna, {
      asCompany: false,
      companyName: 'Ignored',
    });

    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({
      asCompany: false,
      companyName: null,
      street: null,
      vatNumber: null,
      changedBy: 'client',
    });
    expect((await request('PUT', mine(gym.id), anna, { companyName: 'x' })).status).toBe(400);
    expect((await request('PUT', mine(gym.id), anna, { ...JANSEN, asCompany: 'yes' })).status).toBe(
      400,
    );
  });

  it('AC12: John edits Anna’s billing details on her behalf; the record notes the team changed it', async () => {
    const { gym, john, anna, annaClient } = await world();
    await request('PUT', mine(gym.id), anna, JANSEN);

    const changed = await request('PUT', ofClient(gym.id, annaClient.id), john, {
      ...JANSEN,
      companyName: 'Anna Training B.V.',
    });

    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      companyName: 'Anna Training B.V.',
      changedBy: 'team',
    });
    // Anna sees it as the team's change; John reads it as well.
    expect(await (await request('GET', mine(gym.id), anna)).json()).toMatchObject({
      companyName: 'Anna Training B.V.',
      changedBy: 'team',
    });
    expect(
      await (await request('GET', ofClient(gym.id, annaClient.id), john)).json(),
    ).toMatchObject({
      companyName: 'Anna Training B.V.',
    });
    expect(await rowsOf(annaClient.id)).toHaveLength(1);
    // The client changes it again: it is the client's change then.
    const again = await request('PUT', mine(gym.id), anna, JANSEN);
    expect(await again.json()).toMatchObject({ changedBy: 'client' });
  });

  it('on behalf: a client with nothing saved is empty, a company invoice needs its name (422), an unknown client is 404', async () => {
    const { gym, john, annaClient } = await world();

    expect(await (await request('GET', ofClient(gym.id, annaClient.id), john)).json()).toEqual(
      emptyFor(annaClient.id),
    );
    const refused = await request('PUT', ofClient(gym.id, annaClient.id), john, {
      ...JANSEN,
      companyName: '',
    });
    expect(refused.status).toBe(422);
    expect(await rowsOf(annaClient.id)).toHaveLength(0);
    const unknown = ofClient(gym.id, crypto.randomUUID());
    expect((await request('GET', unknown, john)).status).toBe(404);
    expect((await request('PUT', unknown, john, JANSEN)).status).toBe(404);
    expect((await request('GET', ofClient(gym.id, 'not-a-uuid'), john)).status).toBe(400);
  });

  it('@permission AC13: Sarah (Trainer) gets 403 on the Owner routes and nothing is saved', async () => {
    const { gym, sarah, annaClient } = await world();

    const answers = [
      await request('GET', ofClient(gym.id, annaClient.id), sarah),
      await request('PUT', ofClient(gym.id, annaClient.id), sarah, JANSEN),
    ];

    expect(answers.map((answer) => answer.status)).toEqual([403, 403]);
    for (const answer of answers) expect(await answer.json()).toEqual({ code: 'forbidden' });
    expect(await rowsOf(annaClient.id)).toHaveLength(0);
  });

  it('@isolation @permission AC13: Mike gets 404 for John’s Gym’s clients; Anna cannot reach Mark’s details; anonymous gets 401', async () => {
    const { gym, studio, john, mike, anna, annaClient, markClient } = await world();
    await request('PUT', ofClient(gym.id, markClient.id), john, JANSEN);

    // Mike has no place in John's Gym: the workspace is not there for him.
    const crossed = [
      await request('GET', ofClient(gym.id, markClient.id), mike),
      await request('PUT', ofClient(gym.id, markClient.id), mike, JANSEN),
      await request('GET', mine(gym.id), mike),
    ];
    expect(crossed.map((answer) => answer.status)).toEqual([404, 404, 404]);
    for (const answer of crossed) expect(await answer.json()).toEqual({ code: 'not_found' });
    // His own workspace, John's client: out of reach all the same.
    const wrongWorkspace = await request('GET', ofClient(studio.id, markClient.id), mike);
    expect(wrongWorkspace.status).toBe(404);

    // Anna is a client: she has no Owner route (403) and her own route shows only her own.
    expect((await request('GET', ofClient(gym.id, markClient.id), anna)).status).toBe(403);
    expect((await request('PUT', ofClient(gym.id, markClient.id), anna, JANSEN)).status).toBe(403);
    expect(await (await request('GET', mine(gym.id), anna)).json()).toEqual(
      emptyFor(annaClient.id),
    );
    expect(await rowsOf(markClient.id)).toHaveLength(1);

    expect((await request('GET', mine(gym.id))).status).toBe(401);
    expect((await request('PUT', mine(gym.id), undefined, JANSEN)).status).toBe(401);
    expect((await request('GET', ofClient(gym.id, markClient.id))).status).toBe(401);
    expect((await request('PUT', ofClient(gym.id, markClient.id), undefined, JANSEN)).status).toBe(
      401,
    );
  });

  it('@permission the client route is for clients: a team member who is not a client gets 403', async () => {
    const { gym, john, sarah } = await world();

    expect((await request('GET', mine(gym.id), john)).status).toBe(403);
    expect((await request('PUT', mine(gym.id), sarah, JANSEN)).status).toBe(403);
  });

  it('@permission a Trainer who is also a client reaches their own details as a client, never another client’s', async () => {
    const { gym, sarah, markClient } = await world();
    await addClient(admin.db, { workspaceId: gym.id, accountId: sarah.id });

    const own = await request('PUT', mine(gym.id), sarah, JANSEN);

    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ changedBy: 'client' });
    expect((await request('GET', ofClient(gym.id, markClient.id), sarah)).status).toBe(403);
  });

  it('AC17: the four routes are in the committed contract with their access', () => {
    const own = contract.paths['/v1/workspaces/{workspaceId}/me/billing-details'];
    const owner = contract.paths['/v1/workspaces/{workspaceId}/clients/{clientId}/billing-details'];

    expect(own.get.operationId).toBe('getMyBillingDetails');
    expect(own.put.operationId).toBe('putMyBillingDetails');
    expect(owner.get.operationId).toBe('getClientBillingDetails');
    expect(owner.put.operationId).toBe('putClientBillingDetails');
    for (const operation of [own.get, own.put]) {
      expect(operation['x-access']).toEqual({
        type: 'workspace',
        roles: [],
        client: 'own-records',
      });
    }
    for (const operation of [owner.get, owner.put]) {
      expect(operation['x-access']).toEqual({
        type: 'workspace',
        capability: 'invoices.manage',
        roles: ['owner'],
        client: 'none',
      });
    }
    expect(Object.keys(own.put.responses).toSorted().map(Number)).toEqual([
      200, 400, 401, 403, 404, 422, 500,
    ]);
  });
});
