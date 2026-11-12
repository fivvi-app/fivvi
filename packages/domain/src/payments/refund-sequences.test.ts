import { fixedClock } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { applyProviderStatus } from './apply-status.ts';
import { createPayment } from './create-payment.ts';
import type { ProviderRefundStatus } from './provider.ts';
import { refundHoldsAmount } from './refund-status.ts';
import {
  applyProviderRefundStatus,
  type RefundEngine,
  recordReversal,
  refundableOf,
  requestRefund,
} from './refunds.ts';
import { FakePaymentProvider } from './testing/fake-provider.ts';
import { InMemoryPaymentLedger } from './testing/in-memory-ledger.ts';
import { InMemoryRefundLedger } from './testing/in-memory-refund-ledger.ts';

// AC9 over whole histories (F060, ticket #1141): random sequences of refund requests, provider
// statuses (in any order, repeated) and reversals run through the real rules on the in-memory
// ledgers, and after every step the refundable amount is between 0 and what was paid, and the
// refunds that hold their amount never add up to more than was paid. The generator is seeded, so a
// failure repeats; the seed is in the test name.

const WORKSPACE = 'workspace-johns-gym';
const ACCESS = { workspaceId: WORKSPACE, testmode: true };
const NOW = fixedClock('2027-03-05T09:00:00Z').now();
const JOHN = 'team-member-john';

function generator(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const PROVIDER_STATUSES: readonly ProviderRefundStatus[] = [
  'queued',
  'pending',
  'processing',
  'refunded',
  'failed',
  'canceled',
];

async function paidPayment(amountCents: number) {
  const provider = new FakePaymentProvider();
  const payments = new InMemoryPaymentLedger(WORKSPACE);
  const refunds = new InMemoryRefundLedger(payments);
  const engine: RefundEngine = {
    workspaceId: WORKSPACE,
    provider,
    ledger: payments,
    refunds,
    now: () => NOW,
    environment: {
      testmode: true,
      webhookUrl: 'https://pr-1.fivvi.example.com/api/v1/webhooks/mollie/payments',
      returnUrl: (id) => `https://pr-1.fivvi.example.com/pay/${id}`,
    },
  };
  const created = await createPayment(engine, {
    client: { id: 'client-mark', name: 'Mark Jansen', email: 'mark@example.com' },
    kind: 'recurring',
    purpose: 'agreement_due',
    purposeReferenceId: 'agreement-1',
    businessKey: 'agreement:1:due:2027-03-01',
    amountCents,
    description: 'Privécreditabonnement maart',
    supplied: {
      nameNl: 'Privécreditabonnement',
      nameEn: 'Private credit plan',
      period: { startsOn: '2027-03-01', endsOn: '2027-03-31' },
      vatRateBp: 2100,
    },
  });
  provider.pay(ACCESS, created.payment.providerPaymentId ?? '');
  await applyProviderStatus(payments, created.payment.id, 'paid', {
    source: 'webhook',
    occurredAt: NOW,
  });
  return { engine, provider, refunds, paymentId: created.payment.id };
}

describe('AC9: any history of refunds, statuses and reversals keeps the refundable amount in range', () => {
  for (const seed of [1, 7, 2027, 31337, 90210]) {
    it(`seed ${seed}`, async () => {
      const random = generator(seed);
      const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
      const paidCents = 1000 + Math.floor(random() * 50_000);
      const { engine, provider, refunds, paymentId } = await paidPayment(paidCents);
      let reversalIds = 0;

      for (let step = 0; step < 120; step += 1) {
        const action = random();
        if (action < 0.4) {
          // Ask for a refund of any size, up to half as much again as was paid.
          provider.createRefundsAs(pick(PROVIDER_STATUSES));
          await requestRefund(engine, {
            paymentId,
            amountCents: 1 + Math.floor(random() * paidCents * 1.5),
            reason: random() < 0.5 ? 'Client moved away' : null,
            revokeCredits: random() < 0.5,
            requestedByTeamMemberId: JOHN,
          });
        } else if (action < 0.8) {
          // The provider reports a status for a refund, in any order, possibly again.
          const all = await refunds.listRefundsOfPayment(paymentId);
          if (all.length > 0) {
            await applyProviderRefundStatus(refunds, pick(all).id, pick(PROVIDER_STATUSES), {
              source: random() < 0.5 ? 'webhook' : 'fetch',
              occurredAt: NOW,
            });
          }
        } else {
          // The bank reverses part of the payment; a repeated ID is the same reversal.
          if (random() >= 0.3) reversalIds += 1;
          await recordReversal(refunds, {
            paymentId,
            providerChargebackId: `chargeback-${reversalIds}`,
            amountCents: 1 + Math.floor(random() * paidCents * 1.5),
            bankReason: null,
            receivedAt: NOW,
          });
        }

        const refundable = await refundableOf(engine, paymentId);
        expect(Number.isInteger(refundable)).toBe(true);
        expect(refundable).toBeGreaterThanOrEqual(0);
        expect(refundable).toBeLessThanOrEqual(paidCents);
        const active = (await refunds.listRefundsOfPayment(paymentId))
          .filter((refund) => refundHoldsAmount(refund.status))
          .reduce((sum, refund) => sum + refund.amountCents, 0);
        expect(active).toBeLessThanOrEqual(paidCents);
      }
    });
  }
});
