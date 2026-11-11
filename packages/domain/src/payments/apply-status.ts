import type { PaymentLedger, PaymentRecord, StatusSource } from './ledger.ts';
import { decideStatusChange, type PaymentStatus } from './status.ts';

// The only way a payment's status changes (E019, spec #466, AC7): a status fetched from the
// provider is applied once, as an append-only line, or not at all. What a webhook body claims is
// never applied; the caller fetches the payment from the provider and hands the fetched status.

export interface ApplyStatusOptions {
  readonly source: StatusSource;
  /** When the status was fetched: the caller's injected clock. */
  readonly occurredAt: Date;
  /** The provider's ID for the event that brought it, when it has one. */
  readonly providerEventId?: string | null;
}

export interface AppliedStatus {
  /** True when this call wrote the status line. */
  readonly applied: boolean;
  /** The payment as it is now. */
  readonly payment: PaymentRecord;
}

// A change can lose the race to a parallel one; looking again settles it. Losing three times in
// a row means the payment is moving faster than callers can follow, which does not happen.
const ATTEMPTS = 3;

/**
 * Applies a fetched status to a payment. The same status again, and one that arrives out of order
 * (earlier than what the ledger has), change nothing and say so.
 */
export async function applyProviderStatus(
  ledger: PaymentLedger,
  paymentId: string,
  fetched: PaymentStatus,
  options: ApplyStatusOptions,
): Promise<AppliedStatus> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const payment = await ledger.findPayment(paymentId);
    if (!payment) throw new Error('No such payment.');
    const decision = decideStatusChange(payment.status, fetched);
    if (decision.kind === 'ignore') return { applied: false, payment };
    const recorded = await ledger.recordStatusChange({
      paymentId,
      from: decision.from,
      to: decision.to,
      occurredAt: options.occurredAt,
      source: options.source,
      providerEventId: options.providerEventId ?? null,
    });
    if (recorded) {
      const current = await ledger.findPayment(paymentId);
      if (!current) throw new Error('No such payment.');
      return { applied: true, payment: current };
    }
  }
  throw new Error('The payment kept changing under this call.');
}
