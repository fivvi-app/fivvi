import { describe, expect, it } from 'vitest';
import type { NewPayout, NewPayoutLine, PayoutLedger } from '../../commerce/payout-ledger.ts';

// The shared payout ledger contract suite: what every `PayoutLedger` must do. The in-memory one
// passes it in `commerce/payout-ledger.test.ts`, the database-backed one in
// `test/payout-ledger.integration.test.ts` of this package. Test-only.

export interface PayoutLedgerHarness {
  /** The payout ledger of one workspace. */
  readonly payouts: PayoutLedger;
  /** The payout ledger of another workspace. */
  readonly otherPayouts: PayoutLedger;
}

const T0 = new Date('2027-02-10T06:00:00Z');
const T1 = new Date('2027-02-11T06:00:00Z');

function newPayout(overrides: Partial<NewPayout> = {}): NewPayout {
  return {
    providerSettlementId: 'stl_test0001',
    reference: '1234567.2701.01',
    settledAt: new Date('2027-02-10T05:30:12Z'),
    amountCents: 39248,
    status: 'open',
    fetchedAt: T0,
    source: 'job',
    ...overrides,
  };
}

const payment = (id: string, amountCents = 7900): NewPayoutLine => ({
  providerLineId: id,
  type: 'payment',
  feeKind: null,
  amountCents,
  description: 'Membership, February 2027',
  count: null,
});

const fee: NewPayoutLine = {
  providerLineId: 'fee:ideal',
  type: 'fee',
  feeKind: 'ideal',
  amountCents: -32,
  description: 'iDEAL',
  count: 1,
};

export function payoutLedgerContract(name: string, create: () => Promise<PayoutLedgerHarness>) {
  describe(`payout ledger contract: ${name}`, () => {
    it('AC5: a payout is stored with its first status line, null to its status', async () => {
      const { payouts } = await create();
      const { payout, created } = await payouts.insertPayout(newPayout());
      expect(created).toBe(true);
      expect(payout).toMatchObject({
        providerSettlementId: 'stl_test0001',
        reference: '1234567.2701.01',
        amountCents: 39248,
        status: 'open',
        fetchedAt: T0,
      });
      expect(await payouts.listPayoutStatusChanges(payout.id)).toEqual([
        { payoutId: payout.id, from: null, to: 'open', occurredAt: T0, source: 'job' },
      ]);
      expect(await payouts.findPayout(payout.id)).toEqual(payout);
      expect(await payouts.findPayoutBySettlement('stl_test0001')).toEqual(payout);
    });

    it('AC5: the same settlement ID again stores nothing and returns the stored payout', async () => {
      const { payouts } = await create();
      const first = await payouts.insertPayout(newPayout());
      const again = await payouts.insertPayout(newPayout({ status: 'paidout', amountCents: 1 }));
      expect(again.created).toBe(false);
      expect(again.payout).toEqual(first.payout);
      expect(await payouts.listPayouts()).toHaveLength(1);
      expect(await payouts.listPayoutStatusChanges(first.payout.id)).toHaveLength(1);
    });

    it('AC5: lines are stored once each; the same identity again leaves the stored line as it is', async () => {
      const { payouts } = await create();
      const { payout } = await payouts.insertPayout(newPayout());
      expect(await payouts.insertPayoutLines(payout.id, [payment('tr_a'), fee])).toBe(2);
      expect(
        await payouts.insertPayoutLines(payout.id, [
          payment('tr_a', 1),
          payment('tr_b'),
          payment('tr_b'),
        ]),
      ).toBe(1);
      const lines = await payouts.listPayoutLines(payout.id);
      expect(lines.map((line) => [line.providerLineId, line.amountCents])).toEqual([
        ['tr_a', 7900],
        ['tr_b', 7900],
        ['fee:ideal', -32],
      ]);
    });

    it('stores every line unmatched, and a fee with its kind and count', async () => {
      const { payouts } = await create();
      const { payout } = await payouts.insertPayout(newPayout());
      await payouts.insertPayoutLines(payout.id, [payment('tr_a'), fee]);
      const [first, second] = await payouts.listPayoutLines(payout.id);
      expect(first).toMatchObject({
        type: 'payment',
        feeKind: null,
        count: null,
        matched: false,
        matchedPaymentId: null,
        matchedRefundId: null,
        matchedChargebackId: null,
      });
      expect(second).toMatchObject({ type: 'fee', feeKind: 'ideal', count: 1, amountCents: -32 });
    });

    it('the same line identity in two payouts is two lines', async () => {
      const { payouts } = await create();
      const one = await payouts.insertPayout(newPayout());
      const two = await payouts.insertPayout(newPayout({ providerSettlementId: 'stl_test0002' }));
      await payouts.insertPayoutLines(one.payout.id, [fee]);
      expect(await payouts.insertPayoutLines(two.payout.id, [fee])).toBe(1);
    });

    it('AC5: a status change appends a line and moves the payout, once', async () => {
      const { payouts } = await create();
      const { payout } = await payouts.insertPayout(newPayout());
      const change = {
        payoutId: payout.id,
        from: 'open',
        to: 'paidout',
        occurredAt: T1,
        source: 'fetch',
      } as const;
      expect(await payouts.recordPayoutStatusChange(change)).toBe(true);
      expect((await payouts.findPayout(payout.id))?.status).toBe('paidout');
      expect(await payouts.recordPayoutStatusChange(change)).toBe(false);
      expect(await payouts.listPayoutStatusChanges(payout.id)).toEqual([
        { payoutId: payout.id, from: null, to: 'open', occurredAt: T0, source: 'job' },
        { payoutId: payout.id, from: 'open', to: 'paidout', occurredAt: T1, source: 'fetch' },
      ]);
    });

    it('two changes from the same status at once write one line', async () => {
      const { payouts } = await create();
      const { payout } = await payouts.insertPayout(newPayout());
      const results = await Promise.all(
        (['pending', 'paidout'] as const).map((to) =>
          payouts.recordPayoutStatusChange({
            payoutId: payout.id,
            from: 'open',
            to,
            occurredAt: T1,
            source: 'fetch',
          }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await payouts.listPayoutStatusChanges(payout.id)).toHaveLength(2);
    });

    it('a refresh updates the reference, date, amount and fetch time, never the status', async () => {
      const { payouts } = await create();
      const { payout } = await payouts.insertPayout(
        newPayout({ reference: null, settledAt: null, amountCents: 100 }),
      );
      await payouts.insertPayoutLines(payout.id, [payment('tr_a')]);
      const refreshed = await payouts.refreshPayout(payout.id, {
        reference: '1234567.2701.01',
        settledAt: new Date('2027-02-10T05:30:12Z'),
        amountCents: 39248,
        fetchedAt: T1,
      });
      expect(refreshed).toMatchObject({
        reference: '1234567.2701.01',
        amountCents: 39248,
        fetchedAt: T1,
        status: 'open',
      });
      expect(refreshed.settledAt).toEqual(new Date('2027-02-10T05:30:12Z'));
      expect(await payouts.listPayoutLines(payout.id)).toHaveLength(1);
      // A fetch that carries no reference keeps the one stored.
      const kept = await payouts.refreshPayout(payout.id, {
        reference: null,
        settledAt: null,
        amountCents: 39248,
        fetchedAt: T0,
      });
      expect(kept.reference).toBe('1234567.2701.01');
      expect(kept.fetchedAt).toEqual(T1);
    });

    it('lists the payouts newest first', async () => {
      const { payouts } = await create();
      await payouts.insertPayout(
        newPayout({ providerSettlementId: 'stl_old', settledAt: new Date('2027-02-03T05:00:00Z') }),
      );
      await payouts.insertPayout(
        newPayout({ providerSettlementId: 'stl_new', settledAt: new Date('2027-02-10T05:00:00Z') }),
      );
      expect((await payouts.listPayouts()).map((p) => p.providerSettlementId)).toEqual([
        'stl_new',
        'stl_old',
      ]);
    });

    it('AC8: another workspace’s payouts do not exist for this one', async () => {
      const { payouts, otherPayouts } = await create();
      const mine = await payouts.insertPayout(newPayout());
      await payouts.insertPayoutLines(mine.payout.id, [payment('tr_a')]);
      expect(await otherPayouts.listPayouts()).toEqual([]);
      expect(await otherPayouts.findPayout(mine.payout.id)).toBeUndefined();
      expect(await otherPayouts.findPayoutBySettlement('stl_test0001')).toBeUndefined();
      expect(await otherPayouts.listPayoutLines(mine.payout.id)).toEqual([]);
      await expect(
        otherPayouts.insertPayoutLines(mine.payout.id, [payment('tr_x')]),
      ).rejects.toThrow();
      // The same settlement ID in the other workspace is a payout of its own.
      const theirs = await otherPayouts.insertPayout(newPayout());
      expect(theirs.created).toBe(true);
      expect(theirs.payout.id).not.toBe(mine.payout.id);
    });
  });
}
