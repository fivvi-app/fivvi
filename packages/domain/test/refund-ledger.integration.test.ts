import {
  createDatabase,
  createTenantScopes,
  REFUND_REASON_MAX_LENGTH as DATABASE_REASON_MAX_LENGTH,
  type DatabaseClient,
  paymentLedger,
  refundLedger,
  type WorkspaceScope,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFUND_REASON_MAX_LENGTH } from '../src/index.ts';
import { refundLedgerContract } from '../src/payments/testing/index.ts';

// The database-backed refund ledger against the shared refund ledger contract (F060, ticket
// #1141). It runs here, not in `packages/database`, for the reason the payment ledger does: the
// domain package depends on the database package for its integration tests, not the other way
// round. The tables and the repository are covered in
// `packages/database/test/refunds.integration.test.ts`.

describe('F060 the database refund ledger and the domain', () => {
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
    const teamMember = await addTeamRole(admin.db, {
      workspaceId: workspace.id,
      accountId: owner.id,
      role: 'owner',
    });
    const inScope = async <T>(run: (scope: WorkspaceScope) => Promise<T>): Promise<T> => {
      const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
        { accountId: owner.id, workspaceId: workspace.id, admit: () => 'team' },
        run,
      );
      if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
      return entry.value;
    };
    return { workspaceId: workspace.id, teamMemberId: teamMember.id, inScope };
  }

  refundLedgerContract('database refund ledger', async () => {
    const mine = await gym();
    const theirs = await gym();
    return {
      payments: paymentLedger(mine.inScope),
      refunds: refundLedger(mine.inScope),
      otherRefunds: refundLedger(theirs.inScope),
      newClient: async () => (await addClient(admin.db, { workspaceId: mine.workspaceId })).id,
      newTeamMember: () => Promise.resolve(mine.teamMemberId),
    };
  });

  it('the reason limit of the table is the one the domain checks before the row is written', () => {
    expect(DATABASE_REASON_MAX_LENGTH).toBe(REFUND_REASON_MAX_LENGTH);
  });
});
