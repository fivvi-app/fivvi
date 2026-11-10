import { fixedClock } from '@fivvi/testing/clock';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyProviderStatus } from './apply-status.ts';
import type { PaymentRecord } from './ledger.ts';
import { InMemoryPaymentLedger } from './testing/in-memory-ledger.ts';
import { newPayment } from './testing/ledger-contract.ts';

const T1 = fixedClock('2026-11-10T09:05:00Z').now();
const T2 = fixedClock('2026-11-10T09:10:00Z').now();

let ledger: InMemoryPaymentLedger;
let payment: PaymentRecord;

beforeEach(async () => {
  ledger = new InMemoryPaymentLedger('workspace-a');
  payment = (await ledger.insertPayment(newPayment('client-a'))).payment;
});

const lines = async () => (await ledger.listStatusChanges(payment.id)).map((line) => line.to);

describe('applyProviderStatus', () => {
  it('AC7: open to paid is appended as a status line and moves the payment', async () => {
    const result = await applyProviderStatus(ledger, payment.id, 'paid', {
      source: 'webhook',
      occurredAt: T1,
      providerEventId: 'event-1',
    });
    expect(result.applied).toBe(true);
    expect(result.payment.status).toBe('paid');
    expect(await ledger.listStatusChanges(payment.id)).toEqual([
      expect.objectContaining({ to: 'open' }),
      {
        paymentId: payment.id,
        from: 'open',
        to: 'paid',
        occurredAt: T1,
        source: 'webhook',
        providerEventId: 'event-1',
      },
    ]);
  });

  it.each(['failed', 'canceled', 'expired'] as const)(
    'AC7: open to %s is applied',
    async (status) => {
      const result = await applyProviderStatus(ledger, payment.id, status, {
        source: 'fetch',
        occurredAt: T1,
      });
      expect(result).toMatchObject({ applied: true, payment: { status } });
    },
  );

  it('AC7: replaying the same status changes nothing more', async () => {
    await applyProviderStatus(ledger, payment.id, 'paid', { source: 'webhook', occurredAt: T1 });
    const again = await applyProviderStatus(ledger, payment.id, 'paid', {
      source: 'webhook',
      occurredAt: T2,
    });
    expect(again.applied).toBe(false);
    expect(await lines()).toEqual(['open', 'paid']);
  });

  it('AC7: statuses arriving out of order change nothing more', async () => {
    await applyProviderStatus(ledger, payment.id, 'paid', { source: 'webhook', occurredAt: T1 });
    for (const stale of ['open', 'pending', 'failed'] as const) {
      const result = await applyProviderStatus(ledger, payment.id, stale, {
        source: 'webhook',
        occurredAt: T2,
      });
      expect(result.applied).toBe(false);
      expect(result.payment.status).toBe('paid');
    }
    expect(await lines()).toEqual(['open', 'paid']);
  });

  it('AC7: later refunds and chargebacks follow a paid payment, once each', async () => {
    await applyProviderStatus(ledger, payment.id, 'paid', { source: 'fetch', occurredAt: T1 });
    await applyProviderStatus(ledger, payment.id, 'refunded', { source: 'fetch', occurredAt: T2 });
    await applyProviderStatus(ledger, payment.id, 'refunded', { source: 'fetch', occurredAt: T2 });
    await applyProviderStatus(ledger, payment.id, 'charged_back', {
      source: 'fetch',
      occurredAt: T2,
    });
    expect(await lines()).toEqual(['open', 'paid', 'refunded', 'charged_back']);
  });

  it('AC7: two applications at once write one line', async () => {
    const [first, second] = await Promise.all([
      applyProviderStatus(ledger, payment.id, 'paid', { source: 'webhook', occurredAt: T1 }),
      applyProviderStatus(ledger, payment.id, 'paid', { source: 'fetch', occurredAt: T1 }),
    ]);
    expect([first.applied, second.applied].sort()).toEqual([false, true]);
    expect(await lines()).toEqual(['open', 'paid']);
  });

  it('a payment that does not exist is an error', async () => {
    await expect(
      applyProviderStatus(ledger, 'missing', 'paid', { source: 'fetch', occurredAt: T1 }),
    ).rejects.toThrow('No such payment');
  });
});
