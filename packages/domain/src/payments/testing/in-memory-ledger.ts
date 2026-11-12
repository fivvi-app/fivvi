import type {
  NewPayment,
  PaymentLedger,
  PaymentRecord,
  RecordStatusChange,
  StatusChange,
} from '../ledger.ts';

// An in-memory ledger of one workspace, for tests of the engine and of the features on top of it.
// `packages/database` has the real one; the ledger contract suite keeps them alike. Test-only.

export class InMemoryPaymentLedger implements PaymentLedger {
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly changes = new Map<string, StatusChange[]>();
  private readonly customers = new Map<string, string>();
  private sequence = 0;
  readonly workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  insertPayment(payment: NewPayment): Promise<{ payment: PaymentRecord; created: boolean }> {
    const existing = [...this.payments.values()].find(
      (candidate) => candidate.businessKey === payment.businessKey,
    );
    if (existing) return Promise.resolve({ payment: existing, created: false });
    this.sequence += 1;
    const record: PaymentRecord = {
      id: `${this.workspaceId}-payment-${this.sequence}`,
      workspaceId: this.workspaceId,
      clientId: payment.clientId,
      kind: payment.kind,
      purpose: payment.purpose,
      purposeReferenceId: payment.purposeReferenceId,
      businessKey: payment.businessKey,
      amountCents: payment.amountCents,
      currency: 'EUR',
      description: payment.description,
      supplied: payment.supplied,
      providerPaymentId: null,
      providerMandateId: null,
      status: 'open',
      testmode: payment.testmode,
      createdAt: payment.occurredAt,
    };
    this.payments.set(record.id, record);
    this.changes.set(record.id, [
      {
        paymentId: record.id,
        from: null,
        to: 'open',
        occurredAt: payment.occurredAt,
        source: 'job',
        providerEventId: null,
      },
    ]);
    return Promise.resolve({ payment: record, created: true });
  }

  findPayment(paymentId: string): Promise<PaymentRecord | undefined> {
    return Promise.resolve(this.payments.get(paymentId));
  }

  findProviderCustomerId(clientId: string): Promise<string | undefined> {
    return Promise.resolve(this.customers.get(clientId));
  }

  linkProviderCustomer(clientId: string, providerCustomerId: string): Promise<string> {
    const existing = this.customers.get(clientId);
    if (existing) return Promise.resolve(existing);
    this.customers.set(clientId, providerCustomerId);
    return Promise.resolve(providerCustomerId);
  }

  linkProviderPayment(
    paymentId: string,
    link: { providerPaymentId: string; providerMandateId: string | null },
  ): Promise<PaymentRecord> {
    const payment = this.payments.get(paymentId);
    if (!payment) return Promise.reject(new Error('No such payment.'));
    if (payment.providerPaymentId) return Promise.resolve(payment);
    const linked: PaymentRecord = {
      ...payment,
      providerPaymentId: link.providerPaymentId,
      providerMandateId: link.providerMandateId,
    };
    this.payments.set(paymentId, linked);
    return Promise.resolve(linked);
  }

  recordStatusChange(change: RecordStatusChange): Promise<boolean> {
    const payment = this.payments.get(change.paymentId);
    const lines = this.changes.get(change.paymentId);
    if (!payment || !lines) return Promise.resolve(false);
    if (payment.status !== change.from) return Promise.resolve(false);
    if (lines.some((line) => line.to === change.to)) return Promise.resolve(false);
    lines.push({
      paymentId: change.paymentId,
      from: change.from,
      to: change.to,
      occurredAt: change.occurredAt,
      source: change.source,
      providerEventId: change.providerEventId ?? null,
    });
    this.payments.set(change.paymentId, { ...payment, status: change.to });
    return Promise.resolve(true);
  }

  listStatusChanges(paymentId: string): Promise<StatusChange[]> {
    return Promise.resolve([...(this.changes.get(paymentId) ?? [])]);
  }
}
