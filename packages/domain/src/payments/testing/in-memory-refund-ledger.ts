import type { PaymentLedger } from '../ledger.ts';
import type {
  ChargebackRecord,
  InsertRefundResult,
  NewChargeback,
  NewRefund,
  RecordRefundStatusChange,
  RefundLedger,
  RefundRecord,
  RefundStatusChange,
} from '../refund-ledger.ts';
import type { RefundBasis } from '../refundable.ts';

// An in-memory refund ledger of one workspace, for tests of the refund rules and of the features
// on top of them. It reads the payments of the payment ledger it is given. `packages/database`
// has the real one; the refund ledger contract suite keeps them alike. Test-only.

export class InMemoryRefundLedger implements RefundLedger {
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly changes = new Map<string, RefundStatusChange[]>();
  private readonly chargebacks = new Map<string, ChargebackRecord>();
  private sequence = 0;
  // Inserts run one after the other, as the database ledger does under its lock on the payment.
  private queue: Promise<unknown> = Promise.resolve();
  private readonly workspaceId: string;
  private readonly payments: PaymentLedger;

  constructor(payments: PaymentLedger & { readonly workspaceId: string }) {
    this.payments = payments;
    this.workspaceId = payments.workspaceId;
  }

  insertRefund(
    refund: NewRefund,
    admit: (basis: RefundBasis) => boolean,
  ): Promise<InsertRefundResult> {
    const run = this.queue.then(() => this.insertNow(refund, admit));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async insertNow(
    refund: NewRefund,
    admit: (basis: RefundBasis) => boolean,
  ): Promise<InsertRefundResult> {
    const basis = await this.refundBasis(refund.paymentId);
    const payment = await this.payments.findPayment(refund.paymentId);
    if (!basis || !payment) return { kind: 'no_payment' };
    if (!admit(basis)) return { kind: 'refused', basis };
    this.sequence += 1;
    const record: RefundRecord = {
      id: `${this.workspaceId}-refund-${this.sequence}`,
      workspaceId: this.workspaceId,
      paymentId: payment.id,
      clientId: payment.clientId,
      amountCents: refund.amountCents,
      reason: refund.reason,
      revokeCredits: refund.revokeCredits,
      providerRefundId: null,
      requestedByTeamMemberId: refund.requestedByTeamMemberId,
      status: 'requested',
      createdAt: refund.occurredAt,
    };
    this.refunds.set(record.id, record);
    this.changes.set(record.id, [
      {
        refundId: record.id,
        from: null,
        to: 'requested',
        occurredAt: refund.occurredAt,
        source: 'job',
        providerEventId: null,
      },
    ]);
    return { kind: 'inserted', refund: record };
  }

  findRefund(refundId: string): Promise<RefundRecord | undefined> {
    return Promise.resolve(this.refunds.get(refundId));
  }

  listRefundsOfPayment(paymentId: string): Promise<RefundRecord[]> {
    return Promise.resolve(
      [...this.refunds.values()].filter((refund) => refund.paymentId === paymentId),
    );
  }

  async refundBasis(paymentId: string): Promise<RefundBasis | undefined> {
    const payment = await this.payments.findPayment(paymentId);
    if (!payment) return undefined;
    return {
      paymentStatus: payment.status,
      paymentAmountCents: payment.amountCents,
      refunds: (await this.listRefundsOfPayment(paymentId)).map((refund) => ({
        amountCents: refund.amountCents,
        status: refund.status,
      })),
      chargebacks: (await this.listChargebacksOfPayment(paymentId)).map((chargeback) => ({
        amountCents: chargeback.amountCents,
      })),
    };
  }

  linkProviderRefund(refundId: string, providerRefundId: string): Promise<RefundRecord> {
    const refund = this.refunds.get(refundId);
    if (!refund) return Promise.reject(new Error('No such refund.'));
    if (refund.providerRefundId) return Promise.resolve(refund);
    const linked: RefundRecord = { ...refund, providerRefundId };
    this.refunds.set(refundId, linked);
    return Promise.resolve(linked);
  }

  recordRefundStatusChange(change: RecordRefundStatusChange): Promise<boolean> {
    const refund = this.refunds.get(change.refundId);
    const lines = this.changes.get(change.refundId);
    if (!refund || !lines) return Promise.resolve(false);
    if (refund.status !== change.from) return Promise.resolve(false);
    if (lines.some((line) => line.to === change.to)) return Promise.resolve(false);
    lines.push({
      refundId: change.refundId,
      from: change.from,
      to: change.to,
      occurredAt: change.occurredAt,
      source: change.source,
      providerEventId: change.providerEventId ?? null,
    });
    this.refunds.set(change.refundId, { ...refund, status: change.to });
    return Promise.resolve(true);
  }

  listRefundStatusChanges(refundId: string): Promise<RefundStatusChange[]> {
    return Promise.resolve([...(this.changes.get(refundId) ?? [])]);
  }

  async recordChargeback(
    chargeback: NewChargeback,
  ): Promise<{ chargeback: ChargebackRecord; created: boolean }> {
    const payment = await this.payments.findPayment(chargeback.paymentId);
    if (!payment) throw new Error('No such payment.');
    const existing = this.chargebacks.get(chargeback.providerChargebackId);
    if (existing) return { chargeback: existing, created: false };
    this.sequence += 1;
    const record: ChargebackRecord = {
      id: `${this.workspaceId}-chargeback-${this.sequence}`,
      workspaceId: this.workspaceId,
      paymentId: payment.id,
      clientId: payment.clientId,
      providerChargebackId: chargeback.providerChargebackId,
      amountCents: chargeback.amountCents,
      bankReason: chargeback.bankReason,
      receivedAt: chargeback.receivedAt,
      createdAt: chargeback.receivedAt,
    };
    this.chargebacks.set(record.providerChargebackId, record);
    return { chargeback: record, created: true };
  }

  listChargebacksOfPayment(paymentId: string): Promise<ChargebackRecord[]> {
    return Promise.resolve(
      [...this.chargebacks.values()].filter((chargeback) => chargeback.paymentId === paymentId),
    );
  }
}
