import { mollieSettlementFixture } from '@fivvi/testing/mollie-settlements';
import { describe, expect, it } from 'vitest';
import type { ProviderAccess } from '../provider.ts';
import { FakePaymentProvider } from './fake-provider.ts';
import { fromMollieSettlement } from './mollie-settlements.ts';

const access: ProviderAccess = { workspaceId: 'workspace-johns-gym', testmode: false };

describe('F061 the fake provider serves Mollie’s settlement fixtures', () => {
  it('AC1: lists the settlement with its reference, date and amount, and its lines', async () => {
    const provider = new FakePaymentProvider();
    provider.serveMollieSettlement(access, mollieSettlementFixture());
    expect(await provider.listSettlements(access)).toEqual([
      {
        id: 'stl_test0001',
        reference: '1234567.2701.01',
        status: 'paidout',
        amountCents: 39248,
        settledAt: new Date('2027-02-10T05:30:12Z'),
      },
    ]);
    const lines = await provider.listSettlementLines(access, 'stl_test0001');
    expect(lines.map((line) => line.type)).toEqual([
      'payment',
      'payment',
      'payment',
      'refund',
      'fee',
      'fee',
      'fee',
      'fee',
      'fee',
    ]);
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(39248);
  });

  it('serving the same settlement again replaces it instead of listing it twice', async () => {
    const provider = new FakePaymentProvider();
    provider.serveMollieSettlement(access, mollieSettlementFixture({ status: 'open' }));
    provider.serveMollieSettlement(access, mollieSettlementFixture({ status: 'paidout' }));
    const settlements = await provider.listSettlements(access);
    expect(settlements.map((s) => s.status)).toEqual(['paidout']);
  });

  it('serves a workspace its own settlements only, and an unknown one is not found', async () => {
    const provider = new FakePaymentProvider();
    provider.serveMollieSettlement(access, mollieSettlementFixture());
    const fitStudio = { workspaceId: 'workspace-fit-studio', testmode: false };
    expect(await provider.listSettlements(fitStudio)).toEqual([]);
    await expect(provider.listSettlementLines(fitStudio, 'stl_test0001')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('AC2: the variant has the payment that no Fivvi payment has, as a payment line', () => {
    const { lines } = fromMollieSettlement(mollieSettlementFixture({ unknownPayment: true }));
    expect(lines.find((line) => line.id === 'tr_unknown0001')).toMatchObject({
      type: 'payment',
      amountCents: 4500,
      paymentId: 'tr_unknown0001',
    });
  });

  it('a fee is the balance transaction that carries it, with the kind of what it was kept of', () => {
    const { lines } = fromMollieSettlement(mollieSettlementFixture());
    const fees = lines.filter((line) => line.type === 'fee');
    expect(fees.map((line) => [line.id, line.feeKind, line.amountCents, line.count])).toEqual([
      ['baltr_test0001', 'direct_debit', -35, 1],
      ['baltr_test0002', 'direct_debit', -35, 1],
      ['baltr_test0003', 'ideal', -32, 1],
      ['baltr_test0101', 'refund', -25, 1],
      ['baltr_test0103', 'failed_direct_debit', -425, 1],
    ]);
  });

  it('a fee keeps its identity and amount when the settlement grows', () => {
    const open = fromMollieSettlement(mollieSettlementFixture({ status: 'open' })).lines;
    const grown = fromMollieSettlement(
      mollieSettlementFixture({ status: 'paidout', unknownPayment: true }),
    ).lines;
    const fees = (lines: typeof open) => lines.filter((line) => line.type === 'fee');
    for (const fee of fees(open)) expect(fees(grown)).toContainEqual(fee);
    expect(fees(grown)).toHaveLength(fees(open).length + 1);
  });
});
