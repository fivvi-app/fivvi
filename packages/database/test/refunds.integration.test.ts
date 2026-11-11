import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  insertRefund,
  listRefundStatusChanges,
  paymentChargebacks,
  paymentRefundStatusChanges,
  paymentRefunds,
  payments,
  recordChargeback,
  recordRefundStatusChange,
  type WorkspaceScope,
} from '../src/index.ts';
import { executorOf } from '../src/tenant-scope.ts';
import {
  addClient,
  addPayment,
  addPaymentChargeback,
  addPaymentRefund,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The refund and reversal tables and their repository (F060, ticket #1141): what the database
// holds the line on, and what the repository stores and reads as the app role. Row-level security
// over all three tables is covered by the RLS suite, which has a factory for each
// (`rls.integration.test.ts`); the ledger contract runs in `packages/domain`.

const NOW = new Date('2027-03-02T09:00:00Z');

describe('F060 refunds and reversals', () => {
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

  async function paidPayment(workspaceId: string, amountCents = 26000) {
    const payment = await addPayment(admin.db, { workspaceId, amountCents });
    await admin.db.update(payments).set({ status: 'paid' }).where(eq(payments.id, payment.id));
    return payment;
  }

  it('AC9: two refund requests at once cannot both pass a bound only one fits within', async () => {
    const { workspaceId, teamMemberId, inScope } = await gym();
    const payment = await paidPayment(workspaceId);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        inScope((scope) =>
          insertRefund(
            scope,
            {
              paymentId: payment.id,
              amountCents: 15000,
              reason: null,
              revokeCredits: false,
              requestedByTeamMemberId: teamMemberId,
              occurredAt: NOW,
            },
            (facts) =>
              facts.refunds.reduce((sum, refund) => sum + refund.amountCents, 0) + 15000 <=
              facts.paymentAmountCents,
          ),
        ),
      ),
    );
    expect(results.filter((result) => result.kind === 'inserted')).toHaveLength(1);
    expect(
      await admin.db
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.organizationId, workspaceId)),
    ).toHaveLength(1);
  });

  it('AC13: two status changes at once write one line', async () => {
    const { workspaceId, inScope } = await gym();
    const refund = await addPaymentRefund(admin.db, { workspaceId });
    const change = {
      refundId: refund.id,
      from: 'requested',
      to: 'refunded',
      occurredAt: NOW,
      source: 'webhook',
    } as const;
    const results = await Promise.all(
      [1, 2, 3].map(() => inScope((scope) => recordRefundStatusChange(scope, change))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const lines = await inScope((scope) => listRefundStatusChanges(scope, refund.id));
    expect(lines.map((line) => line.to)).toEqual(['requested', 'refunded']);
  });

  it('AC13: a refund status line cannot be updated or deleted, by any role', async () => {
    const { workspaceId, inScope } = await gym();
    const { id } = await addPaymentRefund(admin.db, { workspaceId });
    const [line] = await admin.db
      .select({ id: paymentRefundStatusChanges.id })
      .from(paymentRefundStatusChanges)
      .where(eq(paymentRefundStatusChanges.refundId, id));
    if (!line) throw new Error('no status line');

    expect(
      await violated((db) =>
        db
          .update(paymentRefundStatusChanges)
          .set({ toStatus: 'refunded' })
          .where(eq(paymentRefundStatusChanges.id, line.id)),
      ),
    ).toMatch(/append-only/);
    expect(
      await violated((db) =>
        db.delete(paymentRefundStatusChanges).where(eq(paymentRefundStatusChanges.id, line.id)),
      ),
    ).toMatch(/append-only/);
    await expect(
      inScope((scope) =>
        executorOf(scope)
          .update(paymentRefundStatusChanges)
          .set({ toStatus: 'refunded' })
          .where(eq(paymentRefundStatusChanges.id, line.id)),
      ),
    ).rejects.toThrow();
  });

  it('AC13: a refund status line cannot be truncated either, nor by a cascade from the refunds', async () => {
    await expect(
      violated((db) => db.execute(sql`TRUNCATE payment_refund_status_changes`)),
    ).resolves.toMatch(/append-only/);
    await expect(
      violated((db) => db.execute(sql`TRUNCATE payment_refunds CASCADE`)),
    ).resolves.toMatch(/append-only/);
  });

  it('AC13: a refund never has two lines for one status', async () => {
    const { workspaceId } = await gym();
    const { id, clientId } = await addPaymentRefund(admin.db, { workspaceId });
    expect(
      await violated((db) =>
        db.insert(paymentRefundStatusChanges).values({
          organizationId: workspaceId,
          refundId: id,
          clientId,
          fromStatus: 'pending',
          toStatus: 'requested',
          occurredAt: NOW,
          source: 'fetch',
        }),
      ),
    ).toBe('payment_refund_status_changes_refund_id_to_status_unique');
  });

  it('holds a refund to whole cents above zero, a reason that is not blank and a provider ID of its own', async () => {
    const { workspaceId } = await gym();
    const payment = await addPayment(admin.db, { workspaceId });
    const base: typeof paymentRefunds.$inferInsert = {
      organizationId: workspaceId,
      paymentId: payment.id,
      clientId: payment.clientId,
      amountCents: 100,
    };
    const insert = (values: Partial<typeof base>) => (db: DatabaseExecutor) =>
      db.insert(paymentRefunds).values({ ...base, ...values });
    expect(await violated(insert({ amountCents: 0 }))).toBe(
      'payment_refunds_amount_cents_positive',
    );
    expect(await violated(insert({ reason: '  ' }))).toBe('payment_refunds_reason_valid');
    expect(await violated(insert({ reason: 'x'.repeat(501) }))).toBe(
      'payment_refunds_reason_valid',
    );
    expect(await violated(insert({ providerRefundId: ' ' }))).toBe(
      'payment_refunds_provider_refund_id_valid',
    );
    expect(await violated(insert({ reason: 'Client moved away' }))).toBeUndefined();

    await admin.db.insert(paymentRefunds).values({ ...base, providerRefundId: 're_unique_1' });
    expect(await violated(insert({ providerRefundId: 're_unique_1' }))).toBe(
      'payment_refunds_provider_refund_id_unique',
    );
  });

  it('keeps a refund on a payment of its own workspace and client', async () => {
    const mine = await gym();
    const theirs = await gym();
    const strangers = await paidPayment(theirs.workspaceId);
    await expect(
      mine.inScope((scope) =>
        insertRefund(
          scope,
          {
            paymentId: strangers.id,
            amountCents: 100,
            reason: null,
            revokeCredits: false,
            requestedByTeamMemberId: mine.teamMemberId,
            occurredAt: NOW,
          },
          () => true,
        ),
      ),
    ).resolves.toEqual({ kind: 'no_payment' });

    const payment = await addPayment(admin.db, { workspaceId: mine.workspaceId });
    const otherClient = await addClient(admin.db, { workspaceId: mine.workspaceId });
    expect(
      await violated((db) =>
        db.insert(paymentRefunds).values({
          organizationId: mine.workspaceId,
          paymentId: payment.id,
          clientId: otherClient.id,
          amountCents: 100,
        }),
      ),
    ).toBe('payment_refunds_payment_fk');
    expect(
      await violated((db) =>
        db.insert(paymentRefunds).values({
          organizationId: mine.workspaceId,
          paymentId: payment.id,
          clientId: payment.clientId,
          amountCents: 100,
          requestedByTeamMemberId: theirs.teamMemberId,
        }),
      ),
    ).toBe('payment_refunds_requested_by_fk');
  });

  it('holds a reversal to whole cents above zero and one row per provider chargeback ID', async () => {
    const { workspaceId } = await gym();
    const payment = await addPayment(admin.db, { workspaceId });
    const base: typeof paymentChargebacks.$inferInsert = {
      organizationId: workspaceId,
      paymentId: payment.id,
      clientId: payment.clientId,
      providerChargebackId: 'chb_unique_1',
      amountCents: 100,
      receivedAt: NOW,
    };
    const insert = (values: Partial<typeof base>) => (db: DatabaseExecutor) =>
      db.insert(paymentChargebacks).values({ ...base, ...values });
    expect(await violated(insert({ amountCents: 0 }))).toBe(
      'payment_chargebacks_amount_cents_positive',
    );
    expect(await violated(insert({ providerChargebackId: ' ' }))).toBe(
      'payment_chargebacks_provider_chargeback_id_valid',
    );
    expect(await violated(insert({ bankReason: ' ' }))).toBe(
      'payment_chargebacks_bank_reason_valid',
    );
    await admin.db.insert(paymentChargebacks).values(base);
    expect(await violated(insert({}))).toBe('payment_chargebacks_provider_chargeback_id_unique');
  });

  it('AC13: the same reversal reported at once is stored once', async () => {
    const { workspaceId, inScope } = await gym();
    const payment = await paidPayment(workspaceId);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        inScope((scope) =>
          recordChargeback(scope, {
            paymentId: payment.id,
            providerChargebackId: 'chb_concurrent_1',
            amountCents: 26000,
            bankReason: 'AM04',
            receivedAt: NOW,
          }),
        ),
      ),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.chargeback.id)).size).toBe(1);
  });

  it('does not edit the payment row when a refund or a reversal is stored', async () => {
    const { workspaceId, teamMemberId, inScope } = await gym();
    const payment = await paidPayment(workspaceId);
    const [before] = await admin.db.select().from(payments).where(eq(payments.id, payment.id));
    await inScope((scope) =>
      insertRefund(
        scope,
        {
          paymentId: payment.id,
          amountCents: 2000,
          reason: null,
          revokeCredits: false,
          requestedByTeamMemberId: teamMemberId,
          occurredAt: NOW,
        },
        () => true,
      ),
    );
    await inScope((scope) =>
      recordChargeback(scope, {
        paymentId: payment.id,
        providerChargebackId: 'chb_untouched_1',
        amountCents: 100,
        bankReason: null,
        receivedAt: NOW,
      }),
    );
    const [after] = await admin.db.select().from(payments).where(eq(payments.id, payment.id));
    expect(after).toEqual(before);
  });

  it('a client route reads only the client’s own refunds, status lines and reversals', async () => {
    const { workspaceId } = await gym();
    const annaAccount = await createAccount(admin.db, { label: 'anna' });
    const anna = await addClient(admin.db, { workspaceId, accountId: annaAccount.id });
    const mark = await addClient(admin.db, { workspaceId });
    const annasPayment = await addPayment(admin.db, { workspaceId, clientId: anna.id });
    const marksPayment = await addPayment(admin.db, { workspaceId, clientId: mark.id });
    const annas = await addPaymentRefund(admin.db, {
      workspaceId,
      paymentId: annasPayment.id,
      clientId: anna.id,
    });
    await addPaymentRefund(admin.db, {
      workspaceId,
      paymentId: marksPayment.id,
      clientId: mark.id,
    });
    const annasReversal = await addPaymentChargeback(admin.db, {
      workspaceId,
      paymentId: annasPayment.id,
      clientId: anna.id,
    });
    await addPaymentChargeback(admin.db, {
      workspaceId,
      paymentId: marksPayment.id,
      clientId: mark.id,
    });

    const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
      { accountId: annaAccount.id, workspaceId, admit: () => 'client' },
      async (scope) => {
        const db = executorOf(scope);
        return {
          refunds: (await db.select({ id: paymentRefunds.id }).from(paymentRefunds)).map(
            (row) => row.id,
          ),
          lines: (
            await db
              .select({ id: paymentRefundStatusChanges.refundId })
              .from(paymentRefundStatusChanges)
          ).map((row) => row.id),
          reversals: (await db.select({ id: paymentChargebacks.id }).from(paymentChargebacks)).map(
            (row) => row.id,
          ),
        };
      },
    );
    expect(entry).toEqual({
      status: 'entered',
      value: { refunds: [annas.id], lines: [annas.id], reversals: [annasReversal.id] },
    });
  });
});
