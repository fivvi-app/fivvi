import { describe, expect, it } from 'vitest';
import {
  AC1_REFERENCE,
  AC1_SETTLEMENT_ID,
  mollieSettlementFixture,
  UNKNOWN_PAYMENT_ID,
} from './mollie-settlements.ts';

const cents = (amount: { value: string; currency: string }) => {
  expect(amount.currency).toBe('EUR');
  return Math.round(Number(amount.value) * 100);
};

/** What the settlement is made of, as Mollie reports each part. */
function lines(fixture: ReturnType<typeof mollieSettlementFixture>) {
  const payments = fixture.payments._embedded.payments.map((p) => cents(p.settlementAmount));
  const refunds = fixture.refunds._embedded.refunds.map((r) => cents(r.settlementAmount));
  const chargebacks = fixture.chargebacks._embedded.chargebacks.map((c) =>
    cents(c.settlementAmount),
  );
  const costs = Object.values(fixture.settlement.periods)
    .flatMap((year) => Object.values(year))
    .flatMap((month) => month.costs)
    .map((cost) => -cents(cost.amountGross));
  const failedFees = fixture.balanceTransactions._embedded.balance_transactions
    .filter((t) => t.type === 'failed-payment-fee')
    .map((t) => cents(t.resultAmount));
  return [...payments, ...refunds, ...chargebacks, ...costs, ...failedFees];
}

describe('Mollie settlement fixtures', () => {
  it('AC1: the settlement of Wednesday 10 February 2027 is € 392,48 with the T-reference', () => {
    const fixture = mollieSettlementFixture();
    expect(fixture.settlement).toMatchObject({
      resource: 'settlement',
      id: AC1_SETTLEMENT_ID,
      reference: AC1_REFERENCE,
      status: 'paidout',
      amount: { value: '392.48', currency: 'EUR' },
    });
    expect(AC1_REFERENCE).toBe('1234567.2701.01');
    expect(new Date(fixture.settlement.settledAt ?? '').getUTCDay()).toBe(3);
    expect(fixture.settlement.settledAt).toMatch(/^2027-02-10T/);
  });

  it('AC1: three payments, one refund of € 20,00 and the fees, adding up to the settlement', () => {
    const fixture = mollieSettlementFixture();
    expect(fixture.payments._embedded.payments.map((p) => cents(p.amount))).toEqual([
      7900, 26000, 7900,
    ]);
    expect(fixture.refunds._embedded.refunds.map((r) => cents(r.settlementAmount))).toEqual([
      -2000,
    ]);
    const month = fixture.settlement.periods['2027']?.['02'];
    expect(month?.costs.map((c) => [c.method, c.count, cents(c.amountGross)])).toEqual([
      ['ideal', 1, 32],
      ['directdebit', 2, 70],
      ['refund', 1, 25],
    ]);
    expect(
      fixture.balanceTransactions._embedded.balance_transactions.map((t) => [
        t.type,
        cents(t.resultAmount),
      ]),
    ).toContainEqual(['failed-payment-fee', -425]);
    expect(lines(fixture).reduce((sum, value) => sum + value, 0)).toBe(39248);
  });

  it('AC2: the variant adds a payment that no Fivvi payment has and still adds up', () => {
    const fixture = mollieSettlementFixture({ unknownPayment: true });
    const ids = fixture.payments._embedded.payments.map((p) => p.id);
    expect(ids).toContain(UNKNOWN_PAYMENT_ID);
    expect(ids).toHaveLength(4);
    expect(cents(fixture.settlement.amount)).toBe(lines(fixture).reduce((s, v) => s + v, 0));
  });

  it('an open settlement has no reference and no settled date yet; the same ID and lines', () => {
    const open = mollieSettlementFixture({ status: 'open' });
    expect(open.settlement).toMatchObject({ id: AC1_SETTLEMENT_ID, status: 'open' });
    expect(open.settlement.reference).toBeNull();
    expect(open.settlement.settledAt).toBeNull();
    expect(open.payments._embedded.payments).toEqual(
      mollieSettlementFixture().payments._embedded.payments,
    );
  });

  it('uses invented IDs only, in Mollie’s prefixes', () => {
    const fixture = mollieSettlementFixture({ unknownPayment: true });
    for (const payment of fixture.payments._embedded.payments) {
      expect(payment.id).toMatch(/^tr_/);
      expect(payment.settlementId).toBe(AC1_SETTLEMENT_ID);
    }
    for (const refund of fixture.refunds._embedded.refunds) expect(refund.id).toMatch(/^re_/);
    for (const t of fixture.balanceTransactions._embedded.balance_transactions) {
      expect(t.id).toMatch(/^baltr_/);
    }
  });

  it('can carry a reversal (chargeback) of one of the payments, still adding up', () => {
    const fixture = mollieSettlementFixture({ chargeback: true });
    const [chargeback] = fixture.chargebacks._embedded.chargebacks;
    expect(chargeback?.id).toMatch(/^chb_/);
    expect(cents(fixture.settlement.amount)).toBe(lines(fixture).reduce((s, v) => s + v, 0));
  });
});
