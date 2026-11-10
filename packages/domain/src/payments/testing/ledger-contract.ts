import { describe, expect, it } from 'vitest';
import type { NewPayment, PaymentLedger } from '../ledger.ts';

// The shared ledger contract suite: what every `PaymentLedger` must do. The in-memory ledger
// passes it in `in-memory-ledger.test.ts`, the database-backed one in `packages/database`. Test-only.

export interface LedgerHarness {
  /** The ledger of one workspace. */
  readonly ledger: PaymentLedger;
  /** The ledger of another workspace. */
  readonly otherLedger: PaymentLedger;
  /** A client of the first workspace. */
  readonly newClient: () => Promise<string>;
  /** A client of the other workspace. */
  readonly newOtherClient: () => Promise<string>;
}

const T0 = new Date('2026-11-10T09:00:00Z');
const T1 = new Date('2026-11-10T09:05:00Z');
const T2 = new Date('2026-11-10T09:10:00Z');

// A provider's payment ID is unique across workspaces, and the database of a run is shared by its
// tests, so every test links its own.
let linked = 0;
const providerId = (prefix: string) => {
  linked += 1;
  return `${prefix}_contract_${linked}`;
};

export function newPayment(clientId: string, overrides: Partial<NewPayment> = {}): NewPayment {
  return {
    clientId,
    kind: 'oneoff',
    purpose: 'open_amount',
    purposeReferenceId: null,
    businessKey: 'open-amount:1',
    amountCents: 4950,
    description: 'Membership October',
    supplied: {
      nameNl: 'Lidmaatschap',
      nameEn: 'Membership',
      period: { startsOn: '2026-10-01', endsOn: '2026-10-31' },
      vatRateBp: 2100,
    },
    testmode: true,
    occurredAt: T0,
    ...overrides,
  };
}

export function ledgerContract(name: string, create: () => Promise<LedgerHarness>): void {
  describe(`payment ledger contract: ${name}`, () => {
    it('AC5: a payment is inserted open, in cents, with its first status line', async () => {
      const { ledger, newClient } = await create();
      const clientId = await newClient();
      const { payment, created } = await ledger.insertPayment(newPayment(clientId));
      expect(created).toBe(true);
      expect(payment).toMatchObject({
        clientId,
        kind: 'oneoff',
        purpose: 'open_amount',
        businessKey: 'open-amount:1',
        amountCents: 4950,
        currency: 'EUR',
        status: 'open',
        providerPaymentId: null,
        providerMandateId: null,
        testmode: true,
        supplied: { nameNl: 'Lidmaatschap', nameEn: 'Membership', vatRateBp: 2100 },
      });
      expect(await ledger.findPayment(payment.id)).toEqual(payment);
      expect(await ledger.listStatusChanges(payment.id)).toEqual([
        {
          paymentId: payment.id,
          from: null,
          to: 'open',
          occurredAt: T0,
          source: 'job',
          providerEventId: null,
        },
      ]);
    });

    it('AC5: the same business key returns the same payment and changes nothing', async () => {
      const { ledger, newClient } = await create();
      const clientId = await newClient();
      const first = await ledger.insertPayment(newPayment(clientId));
      const again = await ledger.insertPayment(newPayment(clientId, { amountCents: 100 }));
      expect(again.created).toBe(false);
      expect(again.payment).toEqual(first.payment);
      expect(again.payment.amountCents).toBe(4950);
      expect(await ledger.listStatusChanges(first.payment.id)).toHaveLength(1);
    });

    it('AC5: a business key is unique per workspace, not across workspaces', async () => {
      const { ledger, otherLedger, newClient, newOtherClient } = await create();
      const mine = await ledger.insertPayment(newPayment(await newClient()));
      const theirs = await otherLedger.insertPayment(newPayment(await newOtherClient()));
      expect(theirs.created).toBe(true);
      expect(theirs.payment.id).not.toBe(mine.payment.id);
    });

    it('a workspace never sees the payments of another', async () => {
      const { ledger, otherLedger, newClient } = await create();
      const mine = await ledger.insertPayment(newPayment(await newClient()));
      expect(await otherLedger.findPayment(mine.payment.id)).toBeUndefined();
      expect(await otherLedger.listStatusChanges(mine.payment.id)).toEqual([]);
      const refused = await otherLedger.recordStatusChange({
        paymentId: mine.payment.id,
        from: 'open',
        to: 'paid',
        occurredAt: T1,
        source: 'webhook',
      });
      expect(refused).toBe(false);
      expect((await ledger.findPayment(mine.payment.id))?.status).toBe('open');
    });

    it('AC6: a provider customer is linked to a client once, the first link wins', async () => {
      const { ledger, newClient } = await create();
      const clientId = await newClient();
      expect(await ledger.findProviderCustomerId(clientId)).toBeUndefined();
      expect(await ledger.linkProviderCustomer(clientId, 'cst_1')).toBe('cst_1');
      expect(await ledger.linkProviderCustomer(clientId, 'cst_2')).toBe('cst_1');
      expect(await ledger.findProviderCustomerId(clientId)).toBe('cst_1');
    });

    it('AC6: a provider payment is linked once and keeps its link', async () => {
      const { ledger, newClient } = await create();
      const { payment } = await ledger.insertPayment(newPayment(await newClient()));
      const first = providerId('tr');
      const result = await ledger.linkProviderPayment(payment.id, {
        providerPaymentId: first,
        providerMandateId: null,
      });
      expect(result.providerPaymentId).toBe(first);
      const again = await ledger.linkProviderPayment(payment.id, {
        providerPaymentId: providerId('tr'),
        providerMandateId: 'mdt_1',
      });
      expect(again.providerPaymentId).toBe(first);
      expect(again.providerMandateId).toBeNull();
    });

    it('AC7: a status change is appended once and moves the payment', async () => {
      const { ledger, newClient } = await create();
      const { payment } = await ledger.insertPayment(newPayment(await newClient()));
      const change = {
        paymentId: payment.id,
        from: 'open',
        to: 'paid',
        occurredAt: T1,
        source: 'webhook',
        providerEventId: 'event-1',
      } as const;
      expect(await ledger.recordStatusChange(change)).toBe(true);
      expect((await ledger.findPayment(payment.id))?.status).toBe('paid');
      expect(await ledger.recordStatusChange(change)).toBe(false);
      expect(await ledger.listStatusChanges(payment.id)).toEqual([
        expect.objectContaining({ from: null, to: 'open', occurredAt: T0 }),
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

    it('AC7: a change from a status the payment has left is refused and writes nothing', async () => {
      const { ledger, newClient } = await create();
      const { payment } = await ledger.insertPayment(newPayment(await newClient()));
      await ledger.recordStatusChange({
        paymentId: payment.id,
        from: 'open',
        to: 'paid',
        occurredAt: T1,
        source: 'fetch',
      });
      expect(
        await ledger.recordStatusChange({
          paymentId: payment.id,
          from: 'open',
          to: 'failed',
          occurredAt: T2,
          source: 'fetch',
        }),
      ).toBe(false);
      expect((await ledger.findPayment(payment.id))?.status).toBe('paid');
      expect(await ledger.listStatusChanges(payment.id)).toHaveLength(2);
    });

    it('AC7: a payment never gets a second line for a status it had', async () => {
      const { ledger, newClient } = await create();
      const { payment } = await ledger.insertPayment(newPayment(await newClient()));
      await ledger.recordStatusChange({
        paymentId: payment.id,
        from: 'open',
        to: 'pending',
        occurredAt: T1,
        source: 'fetch',
      });
      expect(
        await ledger.recordStatusChange({
          paymentId: payment.id,
          from: 'pending',
          to: 'open',
          occurredAt: T2,
          source: 'fetch',
        }),
      ).toBe(false);
    });
  });
}
