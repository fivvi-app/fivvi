import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type BillingDetailsChange,
  clientBillingDetails,
  clients,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  findBillingDetails,
  saveBillingDetails,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addClient,
  addClientBillingDetails,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The billing details of a client (F059, ticket #853): one row per client, the repository as the
// app role (RLS applies, as a team member and as a client) and the checks of the table.

const JANSEN: BillingDetailsChange = {
  companyName: 'Jansen Advies B.V.',
  street: 'Testweg',
  houseNumber: '2',
  houseNumberAddition: null,
  postcode: '5678 CD',
  city: 'Utrecht',
  vatNumber: 'NL000000000B02',
};

describe('F059 client billing details', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 4 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const scopes = () => createTenantScopes(() => app.db);

  async function as<T>(
    accountId: string,
    workspaceId: string,
    hat: 'team' | 'client',
    run: (scope: WorkspaceScope) => Promise<T>,
  ): Promise<T> {
    const entry = await scopes().inWorkspaceScope(
      { accountId, workspaceId, admit: () => hat },
      run,
    );
    if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
    return entry.value;
  }

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

  async function world() {
    const gym = await createWorkspace(admin.db);
    const john = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    const annaAccount = await createAccount(admin.db, { label: 'anna' });
    const markAccount = await createAccount(admin.db, { label: 'mark' });
    const anna = await addClient(admin.db, { workspaceId: gym.id, accountId: annaAccount.id });
    const mark = await addClient(admin.db, { workspaceId: gym.id, accountId: markAccount.id });
    return { gym, john, anna, annaAccount, mark, markAccount };
  }

  it('a client with nothing saved has the empty details: the invoice uses the client’s name', async () => {
    const { gym, john, anna } = await world();

    const view = await as(john.id, gym.id, 'team', (scope) => findBillingDetails(scope, anna.id));

    expect(view).toEqual({
      clientId: anna.id,
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
  });

  it('#853: the client saves their company details and reads them back, noted as changed by the client', async () => {
    const { gym, mark, markAccount } = await world();

    const saved = await as(markAccount.id, gym.id, 'client', (scope) =>
      saveBillingDetails(scope, mark.id, JANSEN, 'client'),
    );
    const read = await as(markAccount.id, gym.id, 'client', (scope) =>
      findBillingDetails(scope, mark.id),
    );

    expect(saved).toMatchObject({ ...JANSEN, asCompany: true, changedBy: 'client' });
    expect(read).toEqual(saved);
    expect(read?.changedAt).toBeInstanceOf(Date);
  });

  it('AC12: the Owner edits a client’s details on their behalf, noted as changed by the team', async () => {
    const { gym, john, anna, annaAccount } = await world();
    await as(annaAccount.id, gym.id, 'client', (scope) =>
      saveBillingDetails(scope, anna.id, JANSEN, 'client'),
    );

    const changed = await as(john.id, gym.id, 'team', (scope) =>
      saveBillingDetails(scope, anna.id, { ...JANSEN, companyName: 'Anna Training B.V.' }, 'team'),
    );

    expect(changed).toMatchObject({ companyName: 'Anna Training B.V.', changedBy: 'team' });
    expect(await admin.db.select().from(clientBillingDetails)).toSatisfy(
      (rows: { clientId: string }[]) => rows.filter((row) => row.clientId === anna.id).length === 1,
    );
  });

  it('switching the company off clears the company fields and keeps who changed it', async () => {
    const { gym, mark, markAccount } = await world();
    await as(markAccount.id, gym.id, 'client', (scope) =>
      saveBillingDetails(scope, mark.id, JANSEN, 'client'),
    );

    const off = await as(markAccount.id, gym.id, 'client', (scope) =>
      saveBillingDetails(scope, mark.id, null, 'client'),
    );

    expect(off).toMatchObject({
      asCompany: false,
      companyName: null,
      street: null,
      vatNumber: null,
      changedBy: 'client',
    });
  });

  it('#853: a client of two workspaces has a separate, empty set in the second', async () => {
    const { gym, mark, markAccount } = await world();
    const studio = await createWorkspace(admin.db, { label: 'fit-studio' });
    const markAtStudio = await addClient(admin.db, {
      workspaceId: studio.id,
      accountId: markAccount.id,
    });
    await as(markAccount.id, gym.id, 'client', (scope) =>
      saveBillingDetails(scope, mark.id, JANSEN, 'client'),
    );

    const atStudio = await as(markAccount.id, studio.id, 'client', (scope) =>
      findBillingDetails(scope, markAtStudio.id),
    );

    expect(atStudio).toMatchObject({ asCompany: false, companyName: null, changedBy: null });
  });

  it('a client reaches only their own details, a team member those of the workspace, nobody another workspace’s', async () => {
    const { gym, john, anna, mark, annaAccount } = await world();
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const mike = await createAccount(admin.db, { label: 'mike' });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: mike.id, role: 'owner' });
    await addClientBillingDetails(admin.db, { workspaceId: gym.id, clientId: mark.id });

    // Anna is a client: Mark's client record is not visible to her scope.
    expect(
      await as(annaAccount.id, gym.id, 'client', (scope) => findBillingDetails(scope, mark.id)),
    ).toBeUndefined();
    expect(
      await as(annaAccount.id, gym.id, 'client', (scope) =>
        saveBillingDetails(scope, mark.id, JANSEN, 'client'),
      ),
    ).toBeUndefined();
    expect(
      await as(annaAccount.id, gym.id, 'client', (scope) => findBillingDetails(scope, anna.id)),
    ).toMatchObject({ asCompany: false });
    // John reads Mark's; Mike (Owner of another workspace) sees no client of John's Gym.
    expect(
      await as(john.id, gym.id, 'team', (scope) => findBillingDetails(scope, mark.id)),
    ).toMatchObject({ asCompany: true });
    expect(
      await as(mike.id, other.id, 'team', (scope) => findBillingDetails(scope, mark.id)),
    ).toBeUndefined();
    expect(
      await as(mike.id, other.id, 'team', (scope) =>
        saveBillingDetails(scope, mark.id, JANSEN, 'team'),
      ),
    ).toBeUndefined();
  });

  it('goes with the client when the client is deleted', async () => {
    const { gym, anna } = await world();
    await addClientBillingDetails(admin.db, { workspaceId: gym.id, clientId: anna.id });

    await admin.db.delete(clients).where(eq(clients.id, anna.id));

    expect(
      (await admin.db.select().from(clientBillingDetails)).filter(
        (row) => row.clientId === anna.id,
      ),
    ).toHaveLength(0);
  });

  it('the database allows one row per client and refuses a company invoice without its name and address', async () => {
    const { gym, anna, mark } = await world();
    await addClientBillingDetails(admin.db, { workspaceId: gym.id, clientId: anna.id });
    const insert = (values: Partial<typeof clientBillingDetails.$inferInsert>) =>
      violated((tx) =>
        tx.insert(clientBillingDetails).values({
          organizationId: gym.id,
          clientId: mark.id,
          asCompany: true,
          companyName: 'Jansen Advies B.V.',
          street: 'Testweg',
          houseNumber: '2',
          postcode: '5678 CD',
          city: 'Utrecht',
          changedBy: 'client',
          ...values,
        }),
      );

    expect(await insert({ clientId: anna.id })).toBe(
      'client_billing_details_organization_id_client_id_unique',
    );
    expect(await insert({})).toBeUndefined();
    expect(await insert({ vatNumber: 'NL000000000B02' })).toBeUndefined();
    expect(await insert({ companyName: null })).toBe('client_billing_details_company_shape');
    expect(await insert({ city: null })).toBe('client_billing_details_company_shape');
    expect(await insert({ asCompany: false })).toBe('client_billing_details_company_shape');
    expect(await insert({ vatNumber: 'NL00000000B02' })).toBe(
      'client_billing_details_vat_number_format',
    );
    expect(await insert({ postcode: '5678cd' })).toBe('client_billing_details_text_valid');
    expect(await insert({ companyName: ' ' })).toBe('client_billing_details_text_valid');
    expect(
      await violated((tx) =>
        tx.insert(clientBillingDetails).values({
          organizationId: gym.id,
          clientId: mark.id,
          asCompany: false,
          changedBy: 'team',
        }),
      ),
    ).toBeUndefined();
  });
});
