import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  findInvoiceQuestionEmail,
  findInvoiceSettings,
  saveInvoiceSettings,
  type WorkspaceScope,
  workspaceInvoiceDetails,
} from '../src/index.ts';
import {
  addTeamRole,
  addWorkspaceInvoiceDetails,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The invoice details of a workspace (F059, ticket #852): one row per workspace, the repository
// as the app role (RLS applies) and the checks that hold what the API never writes.

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
} as const;

describe('F059 workspace invoice details', () => {
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

  async function asOwner<T>(
    accountId: string,
    workspaceId: string,
    run: (scope: WorkspaceScope) => Promise<T>,
  ): Promise<T> {
    const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
      { accountId, workspaceId, admit: () => 'team' },
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

  async function ownerOf(workspaceId: string, options: { label?: string } = {}) {
    const owner = await createAccount(admin.db, options);
    await addTeamRole(admin.db, { workspaceId, accountId: owner.id, role: 'owner' });
    return owner;
  }

  it('a new workspace has no invoice details, so they are not complete', async () => {
    const gym = await createWorkspace(admin.db);
    const john = await ownerOf(gym.id);
    expect(await asOwner(john.id, gym.id, (scope) => findInvoiceSettings(scope))).toBeUndefined();
  });

  it('saves complete details, reads them back, and a second save replaces them', async () => {
    const gym = await createWorkspace(admin.db);
    const john = await ownerOf(gym.id);

    const saved = await asOwner(john.id, gym.id, (scope) => saveInvoiceSettings(scope, JOHNS_GYM));
    expect(saved).toEqual(JOHNS_GYM);

    const changed = {
      ...JOHNS_GYM,
      street: 'Teststraat',
      noVat: true,
      questionEmail: 'facturen@example.com',
    };
    await asOwner(john.id, gym.id, (scope) => saveInvoiceSettings(scope, changed));
    expect(await asOwner(john.id, gym.id, (scope) => findInvoiceSettings(scope))).toEqual(changed);
    const count = await admin.db.select().from(workspaceInvoiceDetails);
    expect(count.filter((row) => row.organizationId === gym.id)).toHaveLength(1);
  });

  it('keeps the details of one workspace out of another’s scope', async () => {
    const gym = await createWorkspace(admin.db);
    const other = await createWorkspace(admin.db);
    const john = await ownerOf(gym.id);
    const mike = await ownerOf(other.id);
    await asOwner(john.id, gym.id, (scope) => saveInvoiceSettings(scope, JOHNS_GYM));

    expect(await asOwner(mike.id, other.id, (scope) => findInvoiceSettings(scope))).toBeUndefined();
    await asOwner(mike.id, other.id, (scope) =>
      saveInvoiceSettings(scope, { ...JOHNS_GYM, legalName: 'Fit Studio B.V.' }),
    );
    expect((await asOwner(john.id, gym.id, (scope) => findInvoiceSettings(scope)))?.legalName).toBe(
      "John's Gym B.V.",
    );
  });

  it('the question email falls back to the first Owner’s address', async () => {
    const gym = await createWorkspace(admin.db);
    const john = await ownerOf(gym.id, { label: 'john' });
    await ownerOf(gym.id, { label: 'second-owner' });

    expect(await asOwner(john.id, gym.id, (scope) => findInvoiceQuestionEmail(scope))).toBe(
      john.email,
    );
    await asOwner(john.id, gym.id, (scope) => saveInvoiceSettings(scope, JOHNS_GYM));
    expect(await asOwner(john.id, gym.id, (scope) => findInvoiceQuestionEmail(scope))).toBe(
      john.email,
    );
    await asOwner(john.id, gym.id, (scope) =>
      saveInvoiceSettings(scope, { ...JOHNS_GYM, questionEmail: 'facturen@example.com' }),
    );
    expect(await asOwner(john.id, gym.id, (scope) => findInvoiceQuestionEmail(scope))).toBe(
      'facturen@example.com',
    );
  });

  it('the database allows one row per workspace and refuses what the API never writes', async () => {
    const gym = await createWorkspace(admin.db);
    await addWorkspaceInvoiceDetails(admin.db, { workspaceId: gym.id });
    const insert = (values: Partial<typeof workspaceInvoiceDetails.$inferInsert>) =>
      violated((tx) =>
        tx
          .insert(workspaceInvoiceDetails)
          .values({ organizationId: gym.id, ...JOHNS_GYM, ...values }),
      );

    expect(await insert({})).toBe('workspace_invoice_details_organization_id_unique');
    const fresh = await createWorkspace(admin.db);
    const insertFresh = (values: Partial<typeof workspaceInvoiceDetails.$inferInsert>) =>
      violated((tx) =>
        tx
          .insert(workspaceInvoiceDetails)
          .values({ organizationId: fresh.id, ...JOHNS_GYM, ...values }),
      );
    expect(await insertFresh({})).toBeUndefined();
    expect(await insertFresh({ kvkNumber: '1234567' })).toBe(
      'workspace_invoice_details_kvk_number_format',
    );
    expect(await insertFresh({ vatNumber: 'NL00000000B01' })).toBe(
      'workspace_invoice_details_vat_number_format',
    );
    expect(await insertFresh({ legalName: ' ' })).toBe(
      'workspace_invoice_details_legal_name_valid',
    );
    expect(await insertFresh({ postcode: '1234ab' })).toBe(
      'workspace_invoice_details_address_valid',
    );
    expect(await insertFresh({ questionEmail: 'Facturen@Example.com' })).toBe(
      'workspace_invoice_details_question_email_valid',
    );
    expect(await insertFresh({ questionEmail: 'facturen' })).toBe(
      'workspace_invoice_details_question_email_valid',
    );
  });
});
