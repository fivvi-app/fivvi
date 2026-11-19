import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  insertPayout,
  insertPayoutLines,
  listPayoutLines,
  listPayoutStatusChanges,
  listPayouts,
  payoutLines,
  payoutStatusChanges,
  payouts,
  recordPayoutStatusChange,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addPayment,
  addPaymentChargeback,
  addPaymentRefund,
  addPayout,
  addPayoutLine,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The payout tables and their repository (F061, ticket #1163): what the database holds the line
// on, and what the repository stores and reads as the app role. Row-level security over all three
// tables is covered by the RLS suite, which has a factory for each (`rls.integration.test.ts`);
// the ledger contract runs in `packages/domain`.

const NOW = new Date('2027-02-10T06:00:00Z');

describe('F061 payouts and their lines', () => {
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
  async function gym(label = 'john') {
    const workspace = await createWorkspace(admin.db);
    const owner = await createAccount(admin.db, { label });
    await addTeamRole(admin.db, {
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
    return { workspaceId: workspace.id, inScope };
  }

  /** The constraint a statement violates (or its message), rolled back; `undefined` when it holds. */
  async function violated(statement: (db: DatabaseExecutor) => Promise<unknown>) {
    try {
      await admin.db.transaction(async (tx) => {
        await statement(tx);
        throw new Error('rollback');
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string; message?: string } })
        .cause;
      if (cause?.code) return cause.constraint ?? cause.message ?? cause.code;
      if ((error as Error).message !== 'rollback') throw error;
    }
    return undefined;
  }

  const newPayout = (providerSettlementId = 'stl_test0001') => ({
    providerSettlementId,
    reference: '1234567.2701.01',
    settledAt: new Date('2027-02-10T05:30:12Z'),
    amountCents: 39248,
    status: 'open' as const,
    fetchedAt: NOW,
    source: 'job' as const,
  });

  const paymentLine = (providerLineId: string) => ({
    providerLineId,
    type: 'payment' as const,
    feeKind: null,
    amountCents: 7900,
    description: 'Membership, February 2027',
    count: null,
  });

  it('AC5: one payout per settlement ID in a workspace, two at once included', async () => {
    const { workspaceId, inScope } = await gym();
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => inScope((scope) => insertPayout(scope, newPayout()))),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.payout.id)).size).toBe(1);
    expect(
      await admin.db.select().from(payouts).where(eq(payouts.organizationId, workspaceId)),
    ).toHaveLength(1);
    const [payout] = results;
    expect(
      await inScope((scope) => listPayoutStatusChanges(scope, payout?.payout.id ?? '')),
    ).toHaveLength(1);
  });

  it('two workspaces can each hold a payout of the same settlement ID', async () => {
    const mine = await gym();
    const theirs = await gym('mike');
    await mine.inScope((scope) => insertPayout(scope, newPayout()));
    const other = await theirs.inScope((scope) => insertPayout(scope, newPayout()));
    expect(other.created).toBe(true);
  });

  it('AC5: two changes of the same status at once write one status line', async () => {
    const { inScope } = await gym();
    const { payout } = await inScope((scope) => insertPayout(scope, newPayout()));
    const results = await Promise.all(
      (['pending', 'paidout', 'paidout', 'pending'] as const).map((to) =>
        inScope((scope) =>
          recordPayoutStatusChange(scope, {
            payoutId: payout.id,
            from: 'open',
            to,
            occurredAt: NOW,
            source: 'fetch',
          }),
        ),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await inScope((scope) => listPayoutStatusChanges(scope, payout.id))).toHaveLength(2);
  });

  it('the order of the lines is by type, then identity, as the domain lists them', async () => {
    const { inScope } = await gym();
    const { payout } = await inScope((scope) => insertPayout(scope, newPayout()));
    await inScope((scope) =>
      insertPayoutLines(scope, payout.id, [
        {
          providerLineId: 'fee:ideal',
          type: 'fee',
          feeKind: 'ideal',
          amountCents: -32,
          description: 'iDEAL',
          count: 1,
        },
        paymentLine('tr_test0002'),
        paymentLine('tr_test0001'),
      ]),
    );
    const lines = await inScope((scope) => listPayoutLines(scope, payout.id));
    expect(lines.map((line) => line.providerLineId)).toEqual([
      'tr_test0001',
      'tr_test0002',
      'fee:ideal',
    ]);
  });

  it('a payout always lists newest first, an open one before the settled ones', async () => {
    const { inScope } = await gym();
    await inScope((scope) => insertPayout(scope, newPayout('stl_old')));
    await inScope((scope) =>
      insertPayout(scope, { ...newPayout('stl_open'), settledAt: null, reference: null }),
    );
    await inScope((scope) =>
      insertPayout(scope, { ...newPayout('stl_new'), settledAt: new Date('2027-02-17T05:00:00Z') }),
    );
    expect(
      (await inScope((scope) => listPayouts(scope))).map((payout) => payout.providerSettlementId),
    ).toEqual(['stl_open', 'stl_new', 'stl_old']);
  });

  it('refuses lines for a payout of another workspace', async () => {
    const mine = await gym();
    const theirs = await gym('mike');
    const { payout } = await theirs.inScope((scope) => insertPayout(scope, newPayout()));
    await expect(
      mine.inScope((scope) => insertPayoutLines(scope, payout.id, [paymentLine('tr_x')])),
    ).rejects.toThrow('No such payout.');
  });

  describe('what the tables hold the line on', () => {
    it('AC5: the status lines are append-only for every role, truncate included', async () => {
      const { workspaceId } = await gym();
      const payout = await addPayout(admin.db, { workspaceId });
      expect(
        await violated((tx) =>
          tx
            .update(payoutStatusChanges)
            .set({ toStatus: 'failed' })
            .where(eq(payoutStatusChanges.payoutId, payout.id)),
        ),
      ).toBe('payout_status_changes is append-only');
      expect(
        await violated((tx) =>
          tx.delete(payoutStatusChanges).where(eq(payoutStatusChanges.payoutId, payout.id)),
        ),
      ).toBe('payout_status_changes is append-only');
      expect(await violated((tx) => tx.execute(sql`TRUNCATE payout_status_changes`))).toBe(
        'payout_status_changes is append-only',
      );
    });

    it('a status line never repeats its status in one step', async () => {
      const { workspaceId } = await gym();
      const payout = await addPayout(admin.db, { workspaceId });
      expect(
        await violated((tx) =>
          tx.insert(payoutStatusChanges).values({
            organizationId: workspaceId,
            payoutId: payout.id,
            fromStatus: 'paidout',
            toStatus: 'paidout',
            occurredAt: NOW,
            source: 'fetch',
          }),
        ),
      ).toBe('payout_status_changes_from_differs');
    });

    it('a settlement ID is unique per workspace and not blank; a reference is not blank', async () => {
      const { workspaceId } = await gym();
      const payout = await addPayout(admin.db, { workspaceId });
      const row = {
        organizationId: workspaceId,
        reference: null,
        settledAt: null,
        amountCents: 100,
        status: 'open' as const,
        fetchedAt: NOW,
      };
      expect(
        await violated((tx) =>
          tx.insert(payouts).values({ ...row, providerSettlementId: payout.providerSettlementId }),
        ),
      ).toBe('payouts_organization_id_provider_settlement_id_unique');
      expect(
        await violated((tx) => tx.insert(payouts).values({ ...row, providerSettlementId: ' ' })),
      ).toBe('payouts_provider_settlement_id_valid');
      expect(
        await violated((tx) =>
          tx.insert(payouts).values({ ...row, providerSettlementId: 'stl_a', reference: '' }),
        ),
      ).toBe('payouts_reference_valid');
    });

    it('a line identity is unique per payout; the same one in another payout is fine', async () => {
      const { workspaceId } = await gym();
      const line = await addPayoutLine(admin.db, { workspaceId });
      expect(
        await violated((tx) =>
          addPayoutLine(tx, {
            workspaceId,
            payoutId: line.payoutId,
            providerLineId: line.providerLineId,
          }),
        ),
      ).toBe('payout_lines_organization_id_payout_id_provider_line_id_unique');
      const other = await addPayout(admin.db, { workspaceId });
      expect(
        await violated((tx) =>
          addPayoutLine(tx, {
            workspaceId,
            payoutId: other.id,
            providerLineId: line.providerLineId,
          }),
        ),
      ).toBeUndefined();
    });

    it('a fee has a fee kind and nothing else has one; a count belongs to a fee', async () => {
      const { workspaceId } = await gym();
      const payout = await addPayout(admin.db, { workspaceId });
      const row = {
        organizationId: workspaceId,
        payoutId: payout.id,
        amountCents: -32,
        description: 'iDEAL',
      };
      expect(
        await violated((tx) =>
          tx.insert(payoutLines).values({ ...row, providerLineId: 'fee:x', type: 'fee' }),
        ),
      ).toBe('payout_lines_fee_kind_matches_type');
      expect(
        await violated((tx) =>
          tx.insert(payoutLines).values({
            ...row,
            providerLineId: 'tr_x',
            type: 'payment',
            feeKind: 'ideal',
          }),
        ),
      ).toBe('payout_lines_fee_kind_matches_type');
      expect(
        await violated((tx) =>
          tx
            .insert(payoutLines)
            .values({ ...row, providerLineId: 'tr_y', type: 'payment', feeCount: 1 }),
        ),
      ).toBe('payout_lines_fee_count_valid');
      expect(
        await violated((tx) =>
          tx.insert(payoutLines).values({
            ...row,
            providerLineId: 'fee:y',
            type: 'fee',
            feeKind: 'ideal',
            feeCount: 0,
          }),
        ),
      ).toBe('payout_lines_fee_count_valid');
    });

    it('amounts are signed integers: money back is below zero', async () => {
      const { workspaceId } = await gym();
      const refund = await addPayoutLine(admin.db, {
        workspaceId,
        type: 'refund',
        providerLineId: 're_test0001',
        amountCents: -2000,
      });
      const [stored] = await admin.db
        .select({ amountCents: payoutLines.amountCents })
        .from(payoutLines)
        .where(eq(payoutLines.id, refund.id));
      expect(stored?.amountCents).toBe(-2000);
    });

    it('a line is matched to at most one of Fivvi’s payment, refund and reversal, and a link means matched', async () => {
      const { workspaceId } = await gym();
      const line = await addPayoutLine(admin.db, { workspaceId });
      const payment = await addPayment(admin.db, { workspaceId });
      const refund = await addPaymentRefund(admin.db, { workspaceId });
      expect(
        await violated((tx) =>
          tx
            .update(payoutLines)
            .set({ matchedPaymentId: payment.id, matchedRefundId: refund.id, matched: true })
            .where(eq(payoutLines.id, line.id)),
        ),
      ).toBe('payout_lines_one_match');
      expect(
        await violated((tx) =>
          tx
            .update(payoutLines)
            .set({ matchedPaymentId: payment.id })
            .where(eq(payoutLines.id, line.id)),
        ),
      ).toBe('payout_lines_link_means_matched');
      expect(
        await violated((tx) =>
          tx
            .update(payoutLines)
            .set({ matchedPaymentId: payment.id, matched: true })
            .where(eq(payoutLines.id, line.id)),
        ),
      ).toBeUndefined();
    });

    it('a line cannot be matched to a payment, refund or reversal of another workspace', async () => {
      const mine = await gym();
      const theirs = await gym('mike');
      const line = await addPayoutLine(admin.db, { workspaceId: mine.workspaceId });
      const theirPayment = await addPayment(admin.db, { workspaceId: theirs.workspaceId });
      const theirRefund = await addPaymentRefund(admin.db, { workspaceId: theirs.workspaceId });
      const theirChargeback = await addPaymentChargeback(admin.db, {
        workspaceId: theirs.workspaceId,
      });
      for (const [column, id, constraint] of [
        ['matchedPaymentId', theirPayment.id, 'payout_lines_matched_payment_fk'],
        ['matchedRefundId', theirRefund.id, 'payout_lines_matched_refund_fk'],
        ['matchedChargebackId', theirChargeback.id, 'payout_lines_matched_chargeback_fk'],
      ] as const) {
        expect(
          await violated((tx) =>
            tx
              .update(payoutLines)
              .set({ [column]: id, matched: true })
              .where(eq(payoutLines.id, line.id)),
          ),
        ).toBe(constraint);
      }
    });

    it('a line cannot point at a payout of another workspace, nor a status line', async () => {
      const mine = await gym();
      const theirs = await gym('mike');
      const theirPayout = await addPayout(admin.db, { workspaceId: theirs.workspaceId });
      expect(
        await violated((tx) =>
          addPayoutLine(tx, { workspaceId: mine.workspaceId, payoutId: theirPayout.id }),
        ),
      ).toBe('payout_lines_payout_fk');
      expect(
        await violated((tx) =>
          tx.insert(payoutStatusChanges).values({
            organizationId: mine.workspaceId,
            payoutId: theirPayout.id,
            fromStatus: null,
            toStatus: 'open',
            occurredAt: NOW,
            source: 'job',
          }),
        ),
      ).toBe('payout_status_changes_payout_fk');
    });
  });
});
