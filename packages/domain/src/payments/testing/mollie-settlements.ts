import type { MollieSettlementFixture } from '@fivvi/testing/mollie-settlements';
import type { ProviderFeeKind, ProviderSettlement, ProviderSettlementLine } from '../provider.ts';

// Reads Mollie's documented settlement responses (the fixtures of `@fivvi/testing/mollie-settlements`)
// into the shapes of the payment provider port, for `FakePaymentProvider.serveMollieSettlement`.
// The Mollie adapter (E019) has its own reader of the live responses; this one keeps the fixtures
// and the port in step and is test-only. A settlement is its own figures (the settlement, its
// payments, refunds, chargebacks, its costs per method) plus the fees that only the balance
// transactions carry (a failed direct debit's fee). Fee amounts are the gross cost, negative.

const cents = (amount: { value: string }) => Math.round(Number(amount.value) * 100);

// Mollie's `method` of a cost entry. `refund` and `chargeback` are the entries for those fees.
const FEE_KINDS: Readonly<Record<string, ProviderFeeKind>> = {
  ideal: 'ideal',
  directdebit: 'direct_debit',
  refund: 'refund',
  chargeback: 'reversal',
};

/** A fee line gets `fee:<kind>`, and `fee:<kind>#2` for a second one of the same kind. */
function feeIds() {
  const seen = new Map<string, number>();
  return (kind: ProviderFeeKind) => {
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return n === 1 ? `fee:${kind}` : `fee:${kind}#${n}`;
  };
}

export function fromMollieSettlement(fixture: MollieSettlementFixture): {
  settlement: ProviderSettlement;
  lines: ProviderSettlementLine[];
} {
  const { settlement } = fixture;
  const settlementId = settlement.id;
  const feeId = feeIds();
  const lines: ProviderSettlementLine[] = [];

  for (const payment of fixture.payments._embedded.payments) {
    lines.push({
      id: payment.id,
      settlementId,
      type: 'payment',
      feeKind: null,
      paymentId: payment.id,
      description: payment.description,
      amountCents: cents(payment.settlementAmount),
      count: null,
    });
  }
  for (const refund of fixture.refunds._embedded.refunds) {
    lines.push({
      id: refund.id,
      settlementId,
      type: 'refund',
      feeKind: null,
      paymentId: refund.paymentId,
      description: refund.description,
      amountCents: cents(refund.settlementAmount),
      count: null,
    });
  }
  for (const chargeback of fixture.chargebacks._embedded.chargebacks) {
    lines.push({
      id: chargeback.id,
      settlementId,
      type: 'chargeback',
      feeKind: null,
      paymentId: chargeback.paymentId,
      description: chargeback.reason?.description ?? 'Chargeback',
      amountCents: cents(chargeback.settlementAmount),
      count: null,
    });
  }
  for (const year of Object.values(settlement.periods)) {
    for (const month of Object.values(year)) {
      for (const cost of month.costs) {
        const kind = FEE_KINDS[cost.method] ?? 'other';
        lines.push({
          id: feeId(kind),
          settlementId,
          type: 'fee',
          feeKind: kind,
          paymentId: null,
          description: cost.description,
          amountCents: -cents(cost.amountGross),
          count: cost.count,
        });
      }
    }
  }
  for (const transaction of fixture.balanceTransactions._embedded.balance_transactions) {
    if (transaction.type !== 'failed-payment-fee') continue;
    lines.push({
      id: feeId('failed_direct_debit'),
      settlementId,
      type: 'fee',
      feeKind: 'failed_direct_debit',
      paymentId: transaction.context.paymentId ?? null,
      description: 'Failed payment fee',
      amountCents: cents(transaction.resultAmount),
      count: 1,
    });
  }

  return {
    settlement: {
      id: settlementId,
      reference: settlement.reference,
      status: settlement.status,
      amountCents: cents(settlement.amount),
      settledAt: settlement.settledAt ? new Date(settlement.settledAt) : null,
    },
    lines,
  };
}
