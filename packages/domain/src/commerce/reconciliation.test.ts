import { mollieSettlementFixture } from '@fivvi/testing/mollie-settlements';
import { describe, expect, it } from 'vitest';
import type { ProviderAccess, ProviderSettlementLine } from '../payments/provider.ts';
import { FakePaymentProvider } from '../payments/testing/fake-provider.ts';
import { InMemoryPayoutLedger } from '../payments/testing/in-memory-payout-ledger.ts';
import { InvalidSettlementError, importSettlement } from './reconciliation.ts';

const access: ProviderAccess = { workspaceId: 'workspace-johns-gym', testmode: false };
const T0 = new Date('2027-02-10T06:00:00Z');
const T1 = new Date('2027-02-11T06:00:00Z');

/** John's Gym's Mollie account serving the settlement, and the ledger it is imported into. */
function setup(options: Parameters<typeof mollieSettlementFixture>[0] = {}) {
  const provider = new FakePaymentProvider();
  provider.serveMollieSettlement(access, mollieSettlementFixture(options));
  return { provider, ledger: new InMemoryPayoutLedger('workspace-johns-gym') };
}

/** One fetch, as the daily job and the owner’s refresh do it: every settlement with its lines. */
async function fetchAndImport(
  provider: FakePaymentProvider,
  ledger: InMemoryPayoutLedger,
  fetchedAt: Date,
  source: 'job' | 'fetch' = 'job',
) {
  const results = [];
  for (const settlement of await provider.listSettlements(access)) {
    const lines = await provider.listSettlementLines(access, settlement.id);
    results.push(await importSettlement(ledger, { settlement, lines, fetchedAt, source }));
  }
  return results;
}

describe('F061 importing a settlement', () => {
  it('AC1: stores the payout and its eight lines, every one unmatched', async () => {
    const { provider, ledger } = setup();
    const [result] = await fetchAndImport(provider, ledger, T0);
    expect(result).toMatchObject({ created: true, statusChanged: false, linesAdded: 8 });

    const payout = await ledger.findPayoutBySettlement('stl_test0001');
    expect(payout).toMatchObject({
      reference: '1234567.2701.01',
      amountCents: 39248,
      status: 'paidout',
      fetchedAt: T0,
    });
    expect(payout?.settledAt?.toISOString()).toBe('2027-02-10T05:30:12.000Z');

    const lines = await ledger.listPayoutLines(payout?.id ?? '');
    expect(
      lines.map((line) => [line.type, line.feeKind, line.providerLineId, line.amountCents]),
    ).toEqual([
      ['payment', null, 'tr_test0001', 7900],
      ['payment', null, 'tr_test0002', 26000],
      ['payment', null, 'tr_test0003', 7900],
      ['refund', null, 're_test0001', -2000],
      ['fee', 'direct_debit', 'fee:direct_debit', -70],
      ['fee', 'failed_direct_debit', 'fee:failed_direct_debit', -425],
      ['fee', 'ideal', 'fee:ideal', -32],
      ['fee', 'refund', 'fee:refund', -25],
    ]);
    expect(lines.every((line) => !line.matched && line.matchedPaymentId === null)).toBe(true);
    // Signed lines add up to the payout.
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(payout?.amountCents);
    expect(lines.find((line) => line.feeKind === 'direct_debit')?.count).toBe(2);
  });

  it('AC5: the same settlement imported twice stores the payout and each line once', async () => {
    const { provider, ledger } = setup();
    await fetchAndImport(provider, ledger, T0, 'job');
    const [again] = await fetchAndImport(provider, ledger, T1, 'fetch');
    expect(again).toMatchObject({ created: false, statusChanged: false, linesAdded: 0 });

    const payouts = await ledger.listPayouts();
    expect(payouts).toHaveLength(1);
    expect(await ledger.listPayoutLines(payouts[0]?.id ?? '')).toHaveLength(8);
    // Nothing about the settlement changed, so no status line was appended; the fetch time moved.
    expect(await ledger.listPayoutStatusChanges(payouts[0]?.id ?? '')).toHaveLength(1);
    expect(payouts[0]?.fetchedAt).toEqual(T1);
  });

  it('AC5: later as paidout, one status line is appended and the lines are unchanged', async () => {
    const { provider, ledger } = setup({ status: 'open' });
    await fetchAndImport(provider, ledger, T0);
    const open = await ledger.findPayoutBySettlement('stl_test0001');
    expect(open).toMatchObject({ status: 'open', reference: null, settledAt: null });
    const before = await ledger.listPayoutLines(open?.id ?? '');

    provider.serveMollieSettlement(access, mollieSettlementFixture({ status: 'paidout' }));
    const [result] = await fetchAndImport(provider, ledger, T1, 'fetch');
    expect(result).toMatchObject({ created: false, statusChanged: true, linesAdded: 0 });

    const payout = await ledger.findPayoutBySettlement('stl_test0001');
    expect(payout).toMatchObject({ status: 'paidout', reference: '1234567.2701.01' });
    expect(await ledger.listPayoutStatusChanges(payout?.id ?? '')).toEqual([
      { payoutId: payout?.id, from: null, to: 'open', occurredAt: T0, source: 'job' },
      { payoutId: payout?.id, from: 'open', to: 'paidout', occurredAt: T1, source: 'fetch' },
    ]);
    expect(await ledger.listPayoutLines(payout?.id ?? '')).toEqual(before);
  });

  it('the same status again appends nothing, however often it is fetched', async () => {
    const { provider, ledger } = setup({ status: 'open' });
    for (const at of [T0, T1, T1]) await fetchAndImport(provider, ledger, at);
    const [payout] = await ledger.listPayouts();
    expect(await ledger.listPayoutStatusChanges(payout?.id ?? '')).toHaveLength(1);
  });

  it('an earlier status arriving late changes nothing', async () => {
    const { provider, ledger } = setup({ status: 'paidout' });
    await fetchAndImport(provider, ledger, T1);
    provider.serveMollieSettlement(access, mollieSettlementFixture({ status: 'pending' }));
    const [result] = await fetchAndImport(provider, ledger, T0);
    expect(result?.statusChanged).toBe(false);
    const [payout] = await ledger.listPayouts();
    expect(payout?.status).toBe('paidout');
    expect(await ledger.listPayoutStatusChanges(payout?.id ?? '')).toHaveLength(1);
    expect(payout?.fetchedAt).toEqual(T1);
  });

  it('AC2: a line for a payment that Fivvi does not have is stored like any other', async () => {
    const { provider, ledger } = setup({ unknownPayment: true });
    await fetchAndImport(provider, ledger, T0);
    const [payout] = await ledger.listPayouts();
    const lines = await ledger.listPayoutLines(payout?.id ?? '');
    expect(lines.map((line) => line.providerLineId)).toContain('tr_unknown0001');
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(payout?.amountCents);
    expect(lines.every((line) => line.matched === false)).toBe(true);
  });

  it('AC6: stores a reversal (chargeback) line with its own identity', async () => {
    const { provider, ledger } = setup({ chargeback: true });
    await fetchAndImport(provider, ledger, T0);
    const [payout] = await ledger.listPayouts();
    const lines = await ledger.listPayoutLines(payout?.id ?? '');
    expect(lines.find((line) => line.type === 'chargeback')).toMatchObject({
      providerLineId: 'chb_test0001',
      amountCents: -7900,
    });
    expect(lines.find((line) => line.feeKind === 'reversal')?.amountCents).toBe(-1000);
  });

  it('a line that grows in later (an open settlement) is added, the stored ones stay', async () => {
    const { provider, ledger } = setup({ status: 'open' });
    await fetchAndImport(provider, ledger, T0);
    provider.serveMollieSettlement(
      access,
      mollieSettlementFixture({ status: 'paidout', unknownPayment: true }),
    );
    const [result] = await fetchAndImport(provider, ledger, T1);
    expect(result?.linesAdded).toBe(1);
    const [payout] = await ledger.listPayouts();
    expect(await ledger.listPayoutLines(payout?.id ?? '')).toHaveLength(9);
    expect(payout?.amountCents).toBe(43716);
  });

  it('two workspaces fetch the same settlement ID into payouts of their own', async () => {
    const { provider, ledger } = setup();
    const fitStudio = new InMemoryPayoutLedger('workspace-fit-studio');
    await fetchAndImport(provider, ledger, T0);
    await fetchAndImport(provider, fitStudio, T0);
    expect((await ledger.listPayouts())[0]?.id).not.toBe((await fitStudio.listPayouts())[0]?.id);
  });

  describe('refuses what the table could not hold', () => {
    const settlement = {
      id: 'stl_test0001',
      reference: '1234567.2701.01',
      status: 'paidout' as const,
      amountCents: 100,
      settledAt: null,
    };
    const line: ProviderSettlementLine = {
      id: 'tr_a',
      settlementId: 'stl_test0001',
      type: 'payment',
      feeKind: null,
      paymentId: 'tr_a',
      description: 'Membership',
      amountCents: 100,
      count: null,
    };
    const attempt = (lines: ProviderSettlementLine[], s = settlement) =>
      importSettlement(new InMemoryPayoutLedger('w'), {
        settlement: s,
        lines,
        fetchedAt: T0,
        source: 'job',
      });

    it('a blank settlement ID', async () => {
      await expect(attempt([], { ...settlement, id: ' ' })).rejects.toMatchObject({
        field: 'settlement',
      });
    });

    it('an amount that is not whole cents', async () => {
      await expect(attempt([{ ...line, amountCents: 1.5 }])).rejects.toBeInstanceOf(
        InvalidSettlementError,
      );
      await expect(attempt([], { ...settlement, amountCents: 0.5 })).rejects.toMatchObject({
        field: 'settlement',
      });
    });

    it('a fee without a kind, and a kind on a line that is not a fee', async () => {
      await expect(attempt([{ ...line, type: 'fee' }])).rejects.toMatchObject({ field: 'line' });
      await expect(attempt([{ ...line, feeKind: 'ideal' }])).rejects.toMatchObject({
        field: 'line',
      });
    });

    it('a line of another settlement, and a blank line identity', async () => {
      await expect(attempt([{ ...line, settlementId: 'stl_other' }])).rejects.toMatchObject({
        field: 'line',
      });
      await expect(attempt([{ ...line, id: '' }])).rejects.toMatchObject({ field: 'line' });
    });

    it('writes nothing when a line is refused', async () => {
      const ledger = new InMemoryPayoutLedger('w');
      await expect(
        importSettlement(ledger, {
          settlement,
          lines: [line, { ...line, id: 'tr_b', amountCents: 0.1 }],
          fetchedAt: T0,
          source: 'job',
        }),
      ).rejects.toBeInstanceOf(InvalidSettlementError);
      expect(await ledger.listPayouts()).toEqual([]);
    });
  });
});
