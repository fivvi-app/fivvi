import {
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  payoutFeeKind,
  payoutLedger,
  payoutLineType,
  payoutStatus,
  type WorkspaceScope,
} from '@fivvi/database';
import { addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { mollieSettlementFixture } from '@fivvi/testing/mollie-settlements';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  importSettlement,
  PAYOUT_FEE_KINDS,
  PAYOUT_LINE_TYPES,
  PAYOUT_STATUSES,
} from '../src/index.ts';
import { FakePaymentProvider, payoutLedgerContract } from '../src/payments/testing/index.ts';

// The database-backed payout ledger against the shared payout ledger contract (F061, ticket
// #1163), and the import of the AC1 settlement into it. It runs here, not in `packages/database`,
// for the reason the payment ledger does: the domain package depends on the database package for
// its integration tests, not the other way round. The tables and the repository are covered in
// `packages/database/test/payouts.integration.test.ts`.

describe('F061 the database payout ledger and the domain', () => {
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
  async function gym(label: string) {
    const workspace = await createWorkspace(admin.db);
    const owner = await createAccount(admin.db, { label });
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

  payoutLedgerContract('database payout ledger', async () => {
    const mine = await gym('john');
    const theirs = await gym('mike');
    return {
      payouts: payoutLedger(mine.inScope),
      otherPayouts: payoutLedger(theirs.inScope),
    };
  });

  it('AC5: the AC1 settlement fetched twice, then as paidout, through the database', async () => {
    const { workspaceId, inScope } = await gym('john');
    const ledger = payoutLedger(inScope);
    const provider = new FakePaymentProvider();
    const access = { workspaceId, testmode: false };

    const fetchAll = async (fetchedAt: Date) => {
      const results = [];
      for (const settlement of await provider.listSettlements(access)) {
        const lines = await provider.listSettlementLines(access, settlement.id);
        results.push(
          await importSettlement(ledger, { settlement, lines, fetchedAt, source: 'job' }),
        );
      }
      return results;
    };

    provider.serveMollieSettlement(access, mollieSettlementFixture({ status: 'open' }));
    await fetchAll(new Date('2027-02-09T06:00:00Z'));
    const [again] = await fetchAll(new Date('2027-02-09T18:00:00Z'));
    expect(again).toMatchObject({ created: false, statusChanged: false, linesAdded: 0 });

    provider.serveMollieSettlement(access, mollieSettlementFixture({ status: 'paidout' }));
    const [paidOut] = await fetchAll(new Date('2027-02-10T06:00:00Z'));
    expect(paidOut).toMatchObject({ created: false, statusChanged: true, linesAdded: 0 });

    const payouts = await ledger.listPayouts();
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({
      reference: '1234567.2701.01',
      amountCents: 39248,
      status: 'paidout',
    });
    const id = payouts[0]?.id ?? '';
    const lines = await ledger.listPayoutLines(id);
    expect(lines).toHaveLength(8);
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(39248);
    expect(lines.every((line) => !line.matched)).toBe(true);
    expect((await ledger.listPayoutStatusChanges(id)).map((c) => [c.from, c.to])).toEqual([
      [null, 'open'],
      ['open', 'paidout'],
    ]);
  });

  it('the unknown-payment variant is stored like any other settlement', async () => {
    const { workspaceId, inScope } = await gym('john');
    const ledger = payoutLedger(inScope);
    const provider = new FakePaymentProvider();
    const access = { workspaceId, testmode: false };
    provider.serveMollieSettlement(access, mollieSettlementFixture({ unknownPayment: true }));
    const [settlement] = await provider.listSettlements(access);
    if (!settlement) throw new Error('No settlement.');
    const lines = await provider.listSettlementLines(access, settlement.id);
    await importSettlement(ledger, {
      settlement,
      lines,
      fetchedAt: new Date('2027-02-10T06:00:00Z'),
      source: 'fetch',
    });
    const [payout] = await ledger.listPayouts();
    const stored = await ledger.listPayoutLines(payout?.id ?? '');
    expect(stored.map((line) => line.providerLineId)).toContain('tr_unknown0001');
    expect(stored.reduce((sum, line) => sum + line.amountCents, 0)).toBe(payout?.amountCents);
  });

  it('the statuses, line types and fee kinds of the tables are the domain’s', () => {
    expect(payoutStatus.enumValues).toEqual([...PAYOUT_STATUSES]);
    expect(payoutLineType.enumValues).toEqual([...PAYOUT_LINE_TYPES]);
    expect(payoutFeeKind.enumValues).toEqual([...PAYOUT_FEE_KINDS]);
  });
});
