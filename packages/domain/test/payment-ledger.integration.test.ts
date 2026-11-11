import {
  createDatabase,
  createTenantScopes,
  PAYMENT_DESCRIPTION_MAX_LENGTH as DATABASE_DESCRIPTION_MAX_LENGTH,
  type DatabaseClient,
  paymentLedger,
  type WorkspaceScope,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PAYMENT_DESCRIPTION_MAX_LENGTH } from '../src/index.ts';
import { ledgerContract } from '../src/payments/testing/index.ts';

// The database-backed payment ledger against the shared ledger contract (E019, ticket #727). It
// runs here, not in `packages/database`, because the domain package already depends on the
// database package for its integration tests and the database package must not depend on the
// domain package (a package cycle). The tables and the repository are covered in
// `packages/database/test/payments.integration.test.ts`.

describe('E019 the database ledger and the domain', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 8 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  /** A workspace with an Owner, and a way to run in it as that Owner, committing each call. */
  async function gym() {
    const workspace = await createWorkspace(admin.db);
    const owner = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: workspace.id, accountId: owner.id, role: 'owner' });
    const inScope = async <T>(run: (scope: WorkspaceScope) => Promise<T>): Promise<T> => {
      const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
        { accountId: owner.id, workspaceId: workspace.id, admit: () => 'team' },
        run,
      );
      if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
      return entry.value;
    };
    return { workspaceId: workspace.id, inScope };
  }

  const newClient = (workspaceId: string) => async () =>
    (await addClient(admin.db, { workspaceId })).id;

  ledgerContract('database ledger', async () => {
    const mine = await gym();
    const theirs = await gym();
    return {
      ledger: paymentLedger(mine.inScope),
      otherLedger: paymentLedger(theirs.inScope),
      newClient: newClient(mine.workspaceId),
      newOtherClient: newClient(theirs.workspaceId),
    };
  });

  it('the description limit of the table is the one the domain checks before the provider is called', () => {
    expect(DATABASE_DESCRIPTION_MAX_LENGTH).toBe(PAYMENT_DESCRIPTION_MAX_LENGTH);
  });
});
