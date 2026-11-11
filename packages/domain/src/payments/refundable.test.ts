import { describe, expect, it } from 'vitest';
import { type RefundBasis, refundableAmount } from './refundable.ts';

// Mark Jansen's Privécreditabonnement of € 260,00 (26 000 cents), paid.
function basis(overrides: Partial<RefundBasis> = {}): RefundBasis {
  return {
    paymentStatus: 'paid',
    paymentAmountCents: 26000,
    refunds: [],
    chargebacks: [],
    ...overrides,
  };
}

describe('refundableAmount', () => {
  it('AC9: a paid payment with nothing taken back is refundable in full', () => {
    expect(refundableAmount(basis())).toBe(26000);
  });

  it('AC9: a € 20,00 refund leaves € 240,00', () => {
    expect(refundableAmount(basis({ refunds: [{ amountCents: 2000, status: 'refunded' }] }))).toBe(
      24000,
    );
  });

  it('AC9: a refund that is still on its way already counts (requested, queued, pending)', () => {
    for (const status of ['requested', 'queued', 'pending'] as const) {
      expect(refundableAmount(basis({ refunds: [{ amountCents: 2000, status }] }))).toBe(24000);
    }
  });

  it('AC9: a refund that failed or was canceled gives its amount back', () => {
    for (const status of ['failed', 'canceled'] as const) {
      expect(refundableAmount(basis({ refunds: [{ amountCents: 2000, status }] }))).toBe(26000);
    }
  });

  it('what was reversed by the bank is no longer refundable', () => {
    expect(refundableAmount(basis({ chargebacks: [{ amountCents: 8000 }] }))).toBe(18000);
  });

  it('refunds and reversals add up', () => {
    expect(
      refundableAmount(
        basis({
          refunds: [
            { amountCents: 2000, status: 'refunded' },
            { amountCents: 3000, status: 'failed' },
          ],
          chargebacks: [{ amountCents: 4000 }],
        }),
      ),
    ).toBe(20000);
  });

  it('never below zero, also when the bank reverses what was already refunded', () => {
    expect(
      refundableAmount(
        basis({
          refunds: [{ amountCents: 26000, status: 'refunded' }],
          chargebacks: [{ amountCents: 26000 }],
        }),
      ),
    ).toBe(0);
  });

  it('a payment that was never paid has nothing to refund', () => {
    for (const paymentStatus of ['open', 'pending', 'failed', 'canceled', 'expired'] as const) {
      expect(refundableAmount(basis({ paymentStatus }))).toBe(0);
    }
  });

  it('a payment that was paid and has since been refunded or reversed still counts what was paid', () => {
    for (const paymentStatus of ['paid', 'refunded', 'charged_back'] as const) {
      expect(refundableAmount(basis({ paymentStatus }))).toBe(26000);
    }
  });
});

// A small seeded generator, so a failure repeats (no dependency for it).
function generator(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// The whole histories (requests, statuses, reversals) run through the ledgers in
// `refund-sequences.test.ts`; here the pure function alone.
describe('AC9: a refund on its way', () => {
  it('a refund on its way never raises it', () => {
    const random = generator(11);
    for (let round = 0; round < 500; round += 1) {
      const paymentAmountCents = 1 + Math.floor(random() * 50_000);
      const amountCents = 1 + Math.floor(random() * paymentAmountCents);
      const withRefund = refundableAmount({
        paymentStatus: 'paid',
        paymentAmountCents,
        refunds: [{ amountCents, status: 'pending' }],
        chargebacks: [],
      });
      const without = refundableAmount({
        paymentStatus: 'paid',
        paymentAmountCents,
        refunds: [],
        chargebacks: [],
      });
      expect(withRefund).toBeLessThanOrEqual(without);
    }
  });
});
