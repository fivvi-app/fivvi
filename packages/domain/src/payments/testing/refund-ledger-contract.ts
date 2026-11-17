import { describe, expect, it } from 'vitest';
import type { PaymentLedger } from '../ledger.ts';
import type { RefundLedger } from '../refund-ledger.ts';
import { newPayment } from './ledger-contract.ts';

// The shared refund ledger contract suite: what every `RefundLedger` must do. The in-memory one
// passes it in `in-memory-refund-ledger.test.ts`, the database-backed one in
// `test/refund-ledger.integration.test.ts` of this package. Test-only.

export interface RefundLedgerHarness {
  /** The payment ledger of one workspace: the refunds are of its payments. */
  readonly payments: PaymentLedger;
  /** The refund ledger of the same workspace. */
  readonly refunds: RefundLedger;
  /** The refund ledger of another workspace. */
  readonly otherRefunds: RefundLedger;
  /** A client of the first workspace. */
  readonly newClient: () => Promise<string>;
  /** A team member of the first workspace. */
  readonly newTeamMember: () => Promise<string>;
}

const T0 = new Date('2027-03-02T09:00:00Z');
const T1 = new Date('2027-03-02T09:05:00Z');
const T2 = new Date('2027-03-02T09:10:00Z');

let sequence = 0;
const unique = (prefix: string) => {
  sequence += 1;
  return `${prefix}_refund_contract_${sequence}`;
};

/** Mark Jansen's € 260,00 payment, paid. */
async function paidPayment(harness: RefundLedgerHarness, amountCents = 26000) {
  const clientId = await harness.newClient();
  const { payment } = await harness.payments.insertPayment(
    newPayment(clientId, { businessKey: unique('payment'), amountCents }),
  );
  await harness.payments.recordStatusChange({
    paymentId: payment.id,
    from: 'open',
    to: 'paid',
    occurredAt: T1,
    source: 'fetch',
  });
  return { payment, clientId };
}

const admitAll = () => true;
const admitNone = () => false;

export function refundLedgerContract(name: string, create: () => Promise<RefundLedgerHarness>) {
  describe(`refund ledger contract: ${name}`, () => {
    async function newRefund(harness: RefundLedgerHarness, paymentId: string, amountCents = 2000) {
      return {
        paymentId,
        amountCents,
        reason: 'Client moved away',
        revokeCredits: true,
        requestedByTeamMemberId: await harness.newTeamMember(),
        occurredAt: T0,
      };
    }

    it('AC9: a refund is inserted requested, with its first status line', async () => {
      const harness = await create();
      const { payment, clientId } = await paidPayment(harness);
      const input = await newRefund(harness, payment.id);
      const result = await harness.refunds.insertRefund(input, admitAll);
      if (result.kind !== 'inserted') throw new Error(`Not inserted: ${result.kind}`);
      expect(result.refund).toMatchObject({
        paymentId: payment.id,
        clientId,
        amountCents: 2000,
        reason: 'Client moved away',
        revokeCredits: true,
        providerRefundId: null,
        requestedByTeamMemberId: input.requestedByTeamMemberId,
        status: 'requested',
      });
      expect(await harness.refunds.findRefund(result.refund.id)).toEqual(result.refund);
      expect(await harness.refunds.listRefundStatusChanges(result.refund.id)).toEqual([
        {
          refundId: result.refund.id,
          from: null,
          to: 'requested',
          occurredAt: T0,
          source: 'job',
          providerEventId: null,
        },
      ]);
    });

    it('AC9: the reason is optional', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      const result = await harness.refunds.insertRefund(
        { ...(await newRefund(harness, payment.id)), reason: null },
        admitAll,
      );
      expect(result.kind === 'inserted' && result.refund.reason).toBeNull();
    });

    it('AC9: admit sees the payment, its refunds and its reversals, and a refusal writes nothing', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      const first = await harness.refunds.insertRefund(
        await newRefund(harness, payment.id, 2000),
        admitAll,
      );
      expect(first.kind).toBe('inserted');
      await harness.refunds.recordChargeback({
        paymentId: payment.id,
        providerChargebackId: unique('chb'),
        amountCents: 500,
        bankReason: 'AM04',
        receivedAt: T1,
      });
      let told: unknown;
      const refused = await harness.refunds.insertRefund(
        await newRefund(harness, payment.id, 100),
        (basis) => {
          told = basis;
          return false;
        },
      );
      expect(refused.kind).toBe('refused');
      expect(told).toEqual({
        paymentStatus: 'paid',
        paymentAmountCents: 26000,
        refunds: [{ amountCents: 2000, status: 'requested' }],
        chargebacks: [{ amountCents: 500 }],
      });
      expect(await harness.refunds.listRefundsOfPayment(payment.id)).toHaveLength(1);
      expect(await harness.refunds.refundBasis(payment.id)).toEqual(told);
    });

    it('AC9: a refusal leaves no refund and no status line', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      await harness.refunds.insertRefund(await newRefund(harness, payment.id), admitNone);
      expect(await harness.refunds.listRefundsOfPayment(payment.id)).toEqual([]);
    });

    it('AC9: two requests at once cannot both pass a bound only one fits within', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness, 26000);
      const attempts = await Promise.all(
        [1, 2, 3].map(async () =>
          harness.refunds.insertRefund(
            await newRefund(harness, payment.id, 15000),
            (basis) =>
              basis.refunds.reduce((sum, refund) => sum + refund.amountCents, 0) + 15000 <=
              basis.paymentAmountCents,
          ),
        ),
      );
      expect(attempts.filter((attempt) => attempt.kind === 'inserted')).toHaveLength(1);
      expect(await harness.refunds.listRefundsOfPayment(payment.id)).toHaveLength(1);
    });

    it('a workspace never sees or refunds the payments of another', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      const result = await harness.otherRefunds.insertRefund(
        await newRefund(harness, payment.id),
        admitAll,
      );
      expect(result).toEqual({ kind: 'no_payment' });
      expect(await harness.otherRefunds.refundBasis(payment.id)).toBeUndefined();
      expect(await harness.otherRefunds.listRefundsOfPayment(payment.id)).toEqual([]);
      expect(await harness.otherRefunds.listChargebacksOfPayment(payment.id)).toEqual([]);
      await expect(
        harness.otherRefunds.recordChargeback({
          paymentId: payment.id,
          providerChargebackId: unique('chb'),
          amountCents: 100,
          bankReason: null,
          receivedAt: T1,
        }),
      ).rejects.toThrow();
    });

    it('a workspace never sees the refunds of another', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      const result = await harness.refunds.insertRefund(
        await newRefund(harness, payment.id),
        admitAll,
      );
      if (result.kind !== 'inserted') throw new Error('Not inserted.');
      const id = result.refund.id;
      expect(await harness.otherRefunds.findRefund(id)).toBeUndefined();
      expect(await harness.otherRefunds.listRefundStatusChanges(id)).toEqual([]);
      expect(
        await harness.otherRefunds.recordRefundStatusChange({
          refundId: id,
          from: 'requested',
          to: 'refunded',
          occurredAt: T1,
          source: 'webhook',
        }),
      ).toBe(false);
      await expect(harness.otherRefunds.linkProviderRefund(id, unique('re'))).rejects.toThrow();
      expect((await harness.refunds.findRefund(id))?.status).toBe('requested');
    });

    it('AC10: a refund is linked to the provider’s refund once and keeps its link', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      const inserted = await harness.refunds.insertRefund(
        await newRefund(harness, payment.id),
        admitAll,
      );
      if (inserted.kind !== 'inserted') throw new Error('Not inserted.');
      const first = unique('re');
      expect(
        (await harness.refunds.linkProviderRefund(inserted.refund.id, first)).providerRefundId,
      ).toBe(first);
      expect(
        (await harness.refunds.linkProviderRefund(inserted.refund.id, unique('re')))
          .providerRefundId,
      ).toBe(first);
    });

    it('AC13: a status change is appended once and moves the refund', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      const inserted = await harness.refunds.insertRefund(
        await newRefund(harness, payment.id),
        admitAll,
      );
      if (inserted.kind !== 'inserted') throw new Error('Not inserted.');
      const id = inserted.refund.id;
      const change = {
        refundId: id,
        from: 'requested',
        to: 'queued',
        occurredAt: T1,
        source: 'webhook',
        providerEventId: 'event-1',
      } as const;
      expect(await harness.refunds.recordRefundStatusChange(change)).toBe(true);
      expect(await harness.refunds.recordRefundStatusChange(change)).toBe(false);
      expect((await harness.refunds.findRefund(id))?.status).toBe('queued');
      expect(await harness.refunds.listRefundStatusChanges(id)).toEqual([
        expect.objectContaining({ from: null, to: 'requested', occurredAt: T0 }),
        {
          refundId: id,
          from: 'requested',
          to: 'queued',
          occurredAt: T1,
          source: 'webhook',
          providerEventId: 'event-1',
        },
      ]);
    });

    it('AC13: a change from a status the refund has left, or to one it had, writes nothing', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      const inserted = await harness.refunds.insertRefund(
        await newRefund(harness, payment.id),
        admitAll,
      );
      if (inserted.kind !== 'inserted') throw new Error('Not inserted.');
      const id = inserted.refund.id;
      await harness.refunds.recordRefundStatusChange({
        refundId: id,
        from: 'requested',
        to: 'pending',
        occurredAt: T1,
        source: 'fetch',
      });
      expect(
        await harness.refunds.recordRefundStatusChange({
          refundId: id,
          from: 'requested',
          to: 'failed',
          occurredAt: T2,
          source: 'fetch',
        }),
      ).toBe(false);
      expect(
        await harness.refunds.recordRefundStatusChange({
          refundId: id,
          from: 'pending',
          to: 'requested',
          occurredAt: T2,
          source: 'fetch',
        }),
      ).toBe(false);
      expect((await harness.refunds.findRefund(id))?.status).toBe('pending');
      expect(await harness.refunds.listRefundStatusChanges(id)).toHaveLength(2);
    });

    it('AC13: a reversal with the same provider ID is stored once', async () => {
      const harness = await create();
      const { payment, clientId } = await paidPayment(harness);
      const providerChargebackId = unique('chb');
      const input = {
        paymentId: payment.id,
        providerChargebackId,
        amountCents: 7900,
        bankReason: 'MD01',
        receivedAt: T1,
      };
      const first = await harness.refunds.recordChargeback(input);
      expect(first.created).toBe(true);
      expect(first.chargeback).toMatchObject({
        paymentId: payment.id,
        clientId,
        providerChargebackId,
        amountCents: 7900,
        bankReason: 'MD01',
        receivedAt: T1,
      });
      const again = await harness.refunds.recordChargeback({
        ...input,
        amountCents: 1,
        receivedAt: T2,
      });
      expect(again.created).toBe(false);
      expect(again.chargeback).toEqual(first.chargeback);
      expect(await harness.refunds.listChargebacksOfPayment(payment.id)).toEqual([
        first.chargeback,
      ]);
    });

    it('a reversal may come without a reason code', async () => {
      const harness = await create();
      const { payment } = await paidPayment(harness);
      const { chargeback } = await harness.refunds.recordChargeback({
        paymentId: payment.id,
        providerChargebackId: unique('chb'),
        amountCents: 100,
        bankReason: null,
        receivedAt: T1,
      });
      expect(chargeback.bankReason).toBeNull();
    });
  });
}
