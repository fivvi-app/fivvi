import type {
  MollieBalanceTransaction,
  MollieSettlementFixture,
} from '@fivvi/testing/mollie-settlements';
import type { ProviderFeeKind, ProviderSettlement, ProviderSettlementLine } from '../provider.ts';

// Reads Mollie's documented settlement responses (the fixtures of `@fivvi/testing/mollie-settlements`)
// into the shapes of the payment provider port, for `FakePaymentProvider.serveMollieSettlement`.
// The Mollie adapter (E019) has its own reader of the live responses; this one keeps the fixtures
// and the port in step and is test-only. A settlement is its own figures (the settlement, its
// payments, refunds and chargebacks) and its fees, one per balance transaction (ADR-020, the
// Balances API): the `deductions` of a payment, refund or chargeback, or a failed direct debit's
// fee. The settlement's `costs` per month are a summary and not read.

const cents = (amount: { value: string }) => Math.round(Number(amount.value) * 100);

const METHOD_FEE_KINDS: Readonly<Record<string, ProviderFeeKind>> = {
  ideal: 'ideal',
  directdebit: 'direct_debit',
};

const FEE_DESCRIPTIONS: Readonly<Record<ProviderFeeKind, string>> = {
  ideal: 'iDEAL fee',
  direct_debit: 'SEPA Direct Debit fee',
  refund: 'Refund fee',
  failed_direct_debit: 'Failed payment fee',
  reversal: 'Chargeback fee',
  other: 'Fee',
};

/** The fee a balance transaction carries; `null` for one that carries none. */
function feeKindOf(
  transaction: MollieBalanceTransaction,
  methods: ReadonlyMap<string, string>,
): ProviderFeeKind | null {
  switch (transaction.type) {
    case 'failed-payment-fee':
      return 'failed_direct_debit';
    case 'refund':
      return transaction.deductions ? 'refund' : null;
    case 'chargeback':
      return transaction.deductions ? 'reversal' : null;
    case 'payment': {
      if (!transaction.deductions) return null;
      const method = methods.get(transaction.context.paymentId ?? '');
      return (method && METHOD_FEE_KINDS[method]) || 'other';
    }
    default:
      return transaction.deductions ? 'other' : null;
  }
}

export function fromMollieSettlement(fixture: MollieSettlementFixture): {
  settlement: ProviderSettlement;
  lines: ProviderSettlementLine[];
} {
  const { settlement } = fixture;
  const settlementId = settlement.id;
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
  // A fee is a balance transaction of its own: the identity of its line is the transaction's ID,
  // so a fee is never "the running total of a kind" that a later fetch would have to correct.
  const methods = new Map<string, string>(
    fixture.payments._embedded.payments.map((payment) => [payment.id, payment.method]),
  );
  for (const transaction of fixture.balanceTransactions._embedded.balance_transactions) {
    const feeKind = feeKindOf(transaction, methods);
    const fee =
      transaction.deductions ??
      (feeKind === 'failed_direct_debit' ? transaction.resultAmount : null);
    if (!feeKind || !fee) continue;
    lines.push({
      id: transaction.id,
      settlementId,
      type: 'fee',
      feeKind,
      paymentId: transaction.context.paymentId ?? null,
      description: FEE_DESCRIPTIONS[feeKind],
      amountCents: cents(fee),
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
