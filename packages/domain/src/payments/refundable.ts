import { type RefundStatus, refundHoldsAmount } from './refund-status.ts';
import type { PaymentStatus } from './status.ts';

// The refundable amount of a payment (F060, spec #493, AC9): what was paid, minus the refunds
// that have not failed or been canceled, minus what the bank reversed. A pure rule: the ledger
// supplies the facts, so the same number is used to refuse a refund and to show "max. € 79,00".

/** The facts the refundable amount is worked out from. */
export interface RefundBasis {
  readonly paymentStatus: PaymentStatus;
  readonly paymentAmountCents: number;
  readonly refunds: readonly { readonly amountCents: number; readonly status: RefundStatus }[];
  readonly chargebacks: readonly { readonly amountCents: number }[];
}

// A payment has been paid once it is paid, or has been refunded or reversed after it was.
const WAS_PAID: ReadonlySet<PaymentStatus> = new Set(['paid', 'refunded', 'charged_back']);

/**
 * What can still be refunded, in cents: never below zero (the bank can reverse what was already
 * refunded) and never above what was paid. A payment that was never paid has nothing to refund.
 */
export function refundableAmount(basis: RefundBasis): number {
  if (!WAS_PAID.has(basis.paymentStatus)) return 0;
  const refunded = basis.refunds
    .filter((refund) => refundHoldsAmount(refund.status))
    .reduce((sum, refund) => sum + refund.amountCents, 0);
  const reversed = basis.chargebacks.reduce((sum, chargeback) => sum + chargeback.amountCents, 0);
  return Math.min(
    basis.paymentAmountCents,
    Math.max(0, basis.paymentAmountCents - refunded - reversed),
  );
}
