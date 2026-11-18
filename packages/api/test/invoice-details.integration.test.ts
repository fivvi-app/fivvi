import { readFileSync } from 'node:fs';
import {
  authUsers,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  workspaceInvoiceDetails,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F059 (spec #474, ticket #852): GET and PUT /v1/workspaces/{workspaceId}/settings/invoice-details.
// Synthetic people: John (Owner of John's Gym), Sarah (Trainer), Mike (Owner of Fit Studio) and
// Anna (a client of John's Gym with no team role). The details are invented.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const JOHNS_GYM = {
  legalName: "John's Gym B.V.",
  street: 'Voorbeeldstraat',
  houseNumber: '1',
  houseNumberAddition: null,
  postcode: '1234 AB',
  city: 'Amsterdam',
  kvkNumber: '12345678',
  vatNumber: 'NL000000000B01',
  questionEmail: null,
  noVat: false,
};

const NEVER_SAVED = {
  legalName: null,
  street: null,
  houseNumber: null,
  houseNumberAddition: null,
  postcode: null,
  city: null,
  kvkNumber: null,
  vatNumber: null,
  questionEmail: null,
  noVat: false,
  complete: false,
};

describe('F059 the invoice details of a workspace', () => {
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

  const read = (workspaceId: string, who?: { id: string }) =>
    api().request(`/v1/workspaces/${workspaceId}/settings/invoice-details`, {
      headers: who ? { 'x-test-account': who.id } : {},
    });

  const save = (workspaceId: string, body: unknown, who?: { id: string }) =>
    api().request(`/v1/workspaces/${workspaceId}/settings/invoice-details`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(who ? { 'x-test-account': who.id } : {}) },
      body: JSON.stringify(body),
    });

  const rowsOf = (workspaceId: string) =>
    admin.db
      .select()
      .from(workspaceInvoiceDetails)
      .where(eq(workspaceInvoiceDetails.organizationId, workspaceId));

  it('a new workspace has no invoice details: null fields, no VAT switch off, not complete', async () => {
    const { gym, john } = await world();

    const response = await read(gym.id, john);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...NEVER_SAVED,
      effectiveQuestionEmail: john.email,
    });
  });

  it('AC1: John saves complete details and reads them back; the workspace counts as complete', async () => {
    const { gym, john } = await world();

    const saved = await save(gym.id, JOHNS_GYM, john);
    const readBack = await read(gym.id, john);

    expect(saved.status).toBe(200);
    const expected = { ...JOHNS_GYM, effectiveQuestionEmail: john.email, complete: true };
    expect(await saved.json()).toEqual(expected);
    expect(readBack.status).toBe(200);
    expect(await readBack.json()).toEqual(expected);
    expect(await rowsOf(gym.id)).toHaveLength(1);
  });

  it('saving again replaces what was saved, and keeps one row', async () => {
    const { gym, john } = await world();
    await save(gym.id, JOHNS_GYM, john);

    const response = await save(
      gym.id,
      { ...JOHNS_GYM, street: 'Teststraat', houseNumberAddition: '2 hoog', postcode: '5678cd' },
      john,
    );

    expect(await response.json()).toMatchObject({
      street: 'Teststraat',
      houseNumberAddition: '2 hoog',
      postcode: '5678 CD',
    });
    expect(await rowsOf(gym.id)).toHaveLength(1);
  });

  it('AC2: a KvK number that is not 8 digits answers 422 with the field and its code, and nothing is saved', async () => {
    const { gym, john } = await world();

    const response = await save(gym.id, { ...JOHNS_GYM, kvkNumber: '1234567' }, john);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'kvkNumber', code: 'invalid_kvk_number' }],
    });
    expect(await rowsOf(gym.id)).toHaveLength(0);
    expect(await (await read(gym.id, john)).json()).toMatchObject({ complete: false });
  });

  it('AC2: a malformed VAT number answers 422 with the field and its code, and changes nothing already saved', async () => {
    const { gym, john } = await world();
    await save(gym.id, JOHNS_GYM, john);

    const response = await save(
      gym.id,
      { ...JOHNS_GYM, legalName: 'Taken over B.V.', vatNumber: 'NL12345678B01' },
      john,
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'vatNumber', code: 'invalid_vat_number' }],
    });
    const [row] = await rowsOf(gym.id);
    expect(row?.legalName).toBe("John's Gym B.V.");
    expect(row?.vatNumber).toBe('NL000000000B01');
  });

  it('AC2: every field has its own issue: empty text is required, a bad email is invalid_email', async () => {
    const { gym, john } = await world();

    const response = await save(
      gym.id,
      {
        ...JOHNS_GYM,
        legalName: ' ',
        street: '',
        postcode: '12345',
        kvkNumber: '',
        vatNumber: '',
        questionEmail: 'facturen',
      },
      john,
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: 'validation_failed',
      issues: [
        { path: 'legalName', code: 'required' },
        { path: 'postcode', code: 'invalid' },
        { path: 'street', code: 'required' },
        { path: 'kvkNumber', code: 'required' },
        { path: 'vatNumber', code: 'required' },
        { path: 'questionEmail', code: 'invalid_email' },
      ],
    });
    expect(await rowsOf(gym.id)).toHaveLength(0);
  });

  it('a body that is not shaped like the request answers 400', async () => {
    const { gym, john } = await world();

    expect((await save(gym.id, { legalName: "John's Gym B.V." }, john)).status).toBe(400);
    expect((await save(gym.id, { ...JOHNS_GYM, noVat: 'yes' }, john)).status).toBe(400);
    expect(await rowsOf(gym.id)).toHaveLength(0);
  });

  it('the question email falls back to the Owner’s address when left empty', async () => {
    const { gym, john } = await world();

    const empty = await (await save(gym.id, { ...JOHNS_GYM, questionEmail: '  ' }, john)).json();
    expect(empty).toMatchObject({ questionEmail: null, effectiveQuestionEmail: john.email });

    const given = await (
      await save(gym.id, { ...JOHNS_GYM, questionEmail: 'Facturen@Example.com' }, john)
    ).json();
    expect(given).toMatchObject({
      questionEmail: 'facturen@example.com',
      effectiveQuestionEmail: 'facturen@example.com',
    });
  });

  it('AC4: John turns Ik reken geen btw on and off; it is off for a new workspace', async () => {
    const { gym, john } = await world();
    expect(await (await read(gym.id, john)).json()).toMatchObject({ noVat: false });

    const on = await save(gym.id, { ...JOHNS_GYM, noVat: true }, john);
    expect(await on.json()).toMatchObject({ noVat: true, complete: true });
    expect(await (await read(gym.id, john)).json()).toMatchObject({ noVat: true });

    const off = await save(gym.id, { ...JOHNS_GYM, noVat: false }, john);
    expect(await off.json()).toMatchObject({ noVat: false });
    expect((await rowsOf(gym.id))[0]?.noVat).toBe(false);
  });

  it('@permission AC13: Sarah (Trainer) gets 403 on both routes and nothing is saved', async () => {
    const { gym, sarah } = await world();

    const answers = [await read(gym.id, sarah), await save(gym.id, JOHNS_GYM, sarah)];

    expect(answers.map((response) => response.status)).toEqual([403, 403]);
    for (const answer of answers) expect(await answer.json()).toEqual({ code: 'forbidden' });
    expect(await rowsOf(gym.id)).toHaveLength(0);
  });

  it('@isolation @permission AC13: Mike (Owner of Fit Studio) gets 404 for John’s Gym; anonymous gets 401; a client of the workspace gets 403', async () => {
    const { gym, other, john, mike, anna } = await world();
    await save(gym.id, JOHNS_GYM, john);

    const answers = [
      await read(gym.id, mike),
      await save(gym.id, { ...JOHNS_GYM, legalName: 'Taken over B.V.' }, mike),
    ];

    expect(answers.map((response) => response.status)).toEqual([404, 404]);
    for (const answer of answers) expect(await answer.json()).toEqual({ code: 'not_found' });
    expect((await read(gym.id)).status).toBe(401);
    expect((await save(gym.id, JOHNS_GYM)).status).toBe(401);
    // A client has a place in the workspace, so E011's order answers 403, not 404.
    expect((await read(gym.id, anna)).status).toBe(403);
    expect((await save(gym.id, JOHNS_GYM, anna)).status).toBe(403);
    expect((await read(crypto.randomUUID(), john)).status).toBe(404);
    // Mike's own workspace has none of John's; saving there leaves John's alone.
    expect(await (await read(other.id, mike)).json()).toMatchObject({ complete: false });
    await save(other.id, { ...JOHNS_GYM, legalName: 'Fit Studio B.V.' }, mike);
    expect((await rowsOf(gym.id))[0]?.legalName).toBe("John's Gym B.V.");
    expect(JSON.stringify(await (await read(other.id, mike)).json())).not.toContain("John's Gym");
  });

  it('AC17: both routes are in the committed contract with their access', () => {
    const path = contract.paths['/v1/workspaces/{workspaceId}/settings/invoice-details'];

    expect(path.get.operationId).toBe('getInvoiceDetails');
    expect(path.put.operationId).toBe('putInvoiceDetails');
    for (const operation of [path.get, path.put]) {
      expect(operation['x-access']).toEqual({
        type: 'workspace',
        capability: 'invoices.manage',
        roles: ['owner'],
        client: 'none',
      });
    }
    expect(Object.keys(path.put.responses).toSorted().map(Number)).toEqual([
      200, 400, 401, 403, 404, 422, 500,
    ]);
  });
});
