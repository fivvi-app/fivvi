import { fixedClock } from '@fivvi/testing/clock';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyProviderStatus } from './apply-status.ts';
import { createPayment } from './create-payment.ts';
import { ProviderError } from './provider.ts';
import {
  applyProviderRefundStatus,
  InvalidRefundError,
  REFUND_REASON_MAX_LENGTH,
  type RefundEngine,
  recordReversal,
  refundableOf,
  requestRefund,
  submitRefund,
} from './refunds.ts';
import { FakePaymentProvider } from './testing/fake-provider.ts';
import { InMemoryPaymentLedger } from './testing/in-memory-ledger.ts';
import { InMemoryRefundLedger } from './testing/in-memory-refund-ledger.ts';

// Mark Jansen's Privécreditabonnement of € 260,00 (4 credits a month), paid on 2 March 2027;
// Owner John of John's Gym asks for the refunds.
const WORKSPACE = 'workspace-johns-gym';
const ACCESS = { workspaceId: WORKSPACE, testmode: true };
const NOW = fixedClock('2027-03-05T09:00:00Z').now();
const JOHN = 'team-member-john';

let provider: FakePaymentProvider;
let payments: InMemoryPaymentLedger;
let refunds: InMemoryRefundLedger;
let engine: RefundEngine;
let paymentId: string;
let providerPaymentId: string;

beforeEach(async () => {
  provider = new FakePaymentProvider();
  payments = new InMemoryPaymentLedger(WORKSPACE);
  refunds = new InMemoryRefundLedger(payments);
  engine = {
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
    amountCents: 26000,
    description: 'Privécreditabonnement maart',
    supplied: {
      nameNl: 'Privécreditabonnement',
      nameEn: 'Private credit plan',
      period: { startsOn: '2027-03-01', endsOn: '2027-03-31' },
      vatRateBp: 2100,
    },
  });
  paymentId = created.payment.id;
  providerPaymentId = created.payment.providerPaymentId ?? '';
  provider.pay(ACCESS, providerPaymentId);
  await applyProviderStatus(payments, paymentId, 'paid', { source: 'webhook', occurredAt: NOW });
});

const ask = (amountCents: number, overrides: Record<string, unknown> = {}) =>
  requestRefund(engine, {
    paymentId,
    amountCents,
    reason: 'Client moved away',
    revokeCredits: false,
    requestedByTeamMemberId: JOHN,
    ...overrides,
  });

const creations = () => provider.calls.filter((call) => call.method === 'createRefund');

describe('requestRefund', () => {
  it('AC9: € 20,00 of the € 260,00 leaves € 240,00 refundable', async () => {
    const result = await ask(2000);
    expect(result.kind).toBe('requested');
    expect(await refundableOf(engine, paymentId)).toBe(24000);
  });

  it('AC9: asking € 240,01 more is refused with refund_exceeds_payment and writes nothing', async () => {
    await ask(2000);
    const calls = provider.calls.length;
    const result = await ask(24001);
    expect(result).toEqual({
      kind: 'refused',
      code: 'refund_exceeds_payment',
      refundableCents: 24000,
    });
    expect(await refunds.listRefundsOfPayment(paymentId)).toHaveLength(1);
    expect(provider.calls.length).toBe(calls);
  });

  it('AC9: exactly the refundable amount is accepted', async () => {
    await ask(2000);
    expect((await ask(24000)).kind).toBe('requested');
    expect(await refundableOf(engine, paymentId)).toBe(0);
  });

  it('AC9: a refund that failed gives its amount back to the refundable amount', async () => {
    provider.createRefundsAs('queued');
    const result = await ask(2000);
    if (result.kind !== 'requested') throw new Error('Not requested.');
    expect(await refundableOf(engine, paymentId)).toBe(24000);
    const providerRefund = provider.refundsOf(ACCESS)[0];
    if (!providerRefund) throw new Error('No provider refund.');
    provider.settleRefund(ACCESS, providerRefund.id, 'failed');
    await applyProviderRefundStatus(refunds, result.refund.id, 'failed', {
      source: 'webhook',
      occurredAt: NOW,
    });
    expect(await refundableOf(engine, paymentId)).toBe(26000);
    expect((await ask(26000)).kind).toBe('requested');
  });

  it('AC9: what the bank reversed is no longer refundable', async () => {
    await recordReversal(refunds, {
      paymentId,
      providerChargebackId: 'chb_1',
      amountCents: 26000,
      bankReason: 'AM04',
      receivedAt: NOW,
    });
    expect(await refundableOf(engine, paymentId)).toBe(0);
    expect((await ask(100)).kind).toBe('refused');
  });

  it('AC9: a payment that was never paid cannot be refunded', async () => {
    const open = await createPayment(engine, {
      client: { id: 'client-mark', name: 'Mark Jansen', email: 'mark@example.com' },
      kind: 'oneoff',
      purpose: 'open_amount',
      businessKey: 'open-amount:1',
      amountCents: 5000,
      description: 'Openstaand bedrag',
      supplied: { nameNl: 'Openstaand', nameEn: 'Open', period: null, vatRateBp: null },
    });
    const result = await requestRefund(engine, {
      paymentId: open.payment.id,
      amountCents: 100,
      reason: null,
      revokeCredits: false,
      requestedByTeamMemberId: JOHN,
    });
    expect(result).toMatchObject({ kind: 'refused', code: 'refund_exceeds_payment' });
  });

  it('a payment of another workspace is not found', async () => {
    const result = await requestRefund(engine, {
      paymentId: 'workspace-fit-studio-payment-1',
      amountCents: 100,
      reason: null,
      revokeCredits: false,
      requestedByTeamMemberId: JOHN,
    });
    expect(result).toEqual({ kind: 'refused', code: 'payment_not_found' });
  });

  it('rejects an amount that is not a whole number of cents above zero', async () => {
    for (const amountCents of [0, -1, 1.5, Number.NaN]) {
      await expect(ask(amountCents)).rejects.toMatchObject({
        name: 'InvalidRefundError',
        field: 'amountCents',
      });
    }
    expect(await refunds.listRefundsOfPayment(paymentId)).toEqual([]);
  });

  it('keeps the reason internal: blank is none, too long is refused, and the provider never gets it', async () => {
    await expect(ask(100, { reason: 'x'.repeat(REFUND_REASON_MAX_LENGTH + 1) })).rejects.toThrow(
      InvalidRefundError,
    );
    const blank = await ask(100, { reason: '   ' });
    expect(blank.kind === 'requested' && blank.refund.reason).toBeNull();
    await ask(200, { reason: 'Client moved away' });
    expect(JSON.stringify(provider.calls.map((call) => call.request))).not.toContain('moved away');
  });

  it('AC10: our row is written first and its ID is the idempotency key and in the metadata', async () => {
    let rowBeforeCall: unknown;
    const original = provider.createRefund.bind(provider);
    provider.createRefund = async (access, request) => {
      rowBeforeCall = await refunds.findRefund(request.idempotencyKey);
      return original(access, request);
    };
    const result = await ask(2000, { revokeCredits: true });
    if (result.kind !== 'requested') throw new Error('Not requested.');
    expect(rowBeforeCall).toMatchObject({ id: result.refund.id, status: 'requested' });
    expect(creations()[0]?.request).toMatchObject({
      paymentId: providerPaymentId,
      amountCents: 2000,
      idempotencyKey: result.refund.id,
      metadata: { refundId: result.refund.id, paymentId, workspaceId: WORKSPACE },
    });
  });

  it('AC13: the provider’s refund is linked and its status applied once', async () => {
    provider.createRefundsAs('queued');
    const result = await ask(2000);
    if (result.kind !== 'requested') throw new Error('Not requested.');
    expect(result.refund).toMatchObject({ status: 'queued' });
    expect(result.refund.providerRefundId).toBe(provider.refundsOf(ACCESS)[0]?.id);
    expect(
      (await refunds.listRefundStatusChanges(result.refund.id)).map((line) => line.to),
    ).toEqual(['requested', 'queued']);
  });
});

describe('submitRefund', () => {
  it('AC10: after a lost response the retry finds the refund by our metadata and creates nothing new', async () => {
    provider.failNext('createRefund', 'lost-response');
    await expect(ask(2000)).rejects.toBeInstanceOf(ProviderError);
    const [row] = await refunds.listRefundsOfPayment(paymentId);
    if (!row) throw new Error('The row must stay.');
    expect(row).toMatchObject({ status: 'requested', providerRefundId: null });
    expect(provider.refundsOf(ACCESS)).toHaveLength(1);

    const retried = await submitRefund(engine, row.id);
    expect(creations()).toHaveLength(1);
    expect(provider.refundsOf(ACCESS)).toHaveLength(1);
    expect(retried.providerRefundId).toBe(provider.refundsOf(ACCESS)[0]?.id);
    expect(retried.status).toBe('refunded');
  });

  it('AC10: the same after a token refresh', async () => {
    provider.failNext('createRefund', 'lost-response');
    await expect(ask(2000)).rejects.toBeInstanceOf(ProviderError);
    provider.refreshAccessToken();
    const [row] = await refunds.listRefundsOfPayment(paymentId);
    if (!row) throw new Error('The row must stay.');
    await submitRefund(engine, row.id);
    expect(creations()).toHaveLength(1);
    const lookup = provider.calls.find((call) => call.method === 'listRefunds');
    expect(lookup?.tokenVersion).toBe(2);
    expect(provider.refundsOf(ACCESS)).toHaveLength(1);
  });

  it('AC10: when the provider never got the request, the retry creates it, once', async () => {
    provider.failNext('createRefund', 'before');
    await expect(ask(2000)).rejects.toBeInstanceOf(ProviderError);
    const [row] = await refunds.listRefundsOfPayment(paymentId);
    if (!row) throw new Error('The row must stay.');
    await submitRefund(engine, row.id);
    await submitRefund(engine, row.id);
    expect(provider.refundsOf(ACCESS)).toHaveLength(1);
    expect(creations()).toHaveLength(2);
  });

  it('a refund that is linked is left alone', async () => {
    const result = await ask(2000);
    if (result.kind !== 'requested') throw new Error('Not requested.');
    const calls = provider.calls.length;
    const again = await submitRefund(engine, result.refund.id);
    expect(again.id).toBe(result.refund.id);
    expect(provider.calls.length).toBe(calls);
  });

  it('a refund that does not exist is refused', async () => {
    await expect(submitRefund(engine, 'nope')).rejects.toBeInstanceOf(InvalidRefundError);
  });
});

describe('applyProviderRefundStatus', () => {
  async function queued() {
    provider.createRefundsAs('queued');
    const result = await ask(2000);
    if (result.kind !== 'requested') throw new Error('Not requested.');
    return result.refund.id;
  }
  const options = { source: 'webhook', occurredAt: NOW } as const;

  it('AC13: a status is applied once as a line; the same status again changes nothing', async () => {
    const id = await queued();
    expect((await applyProviderRefundStatus(refunds, id, 'pending', options)).applied).toBe(true);
    const again = await applyProviderRefundStatus(refunds, id, 'pending', options);
    expect(again.applied).toBe(false);
    expect((await refunds.listRefundStatusChanges(id)).map((line) => line.to)).toEqual([
      'requested',
      'queued',
      'pending',
    ]);
  });

  it('AC13: processing is pending', async () => {
    const id = await queued();
    await applyProviderRefundStatus(refunds, id, 'processing', options);
    expect((await refunds.findRefund(id))?.status).toBe('pending');
  });

  it('AC13: an earlier status arriving late, or anything after an end, changes nothing', async () => {
    const id = await queued();
    await applyProviderRefundStatus(refunds, id, 'refunded', options);
    for (const late of ['pending', 'queued', 'failed', 'canceled'] as const) {
      expect((await applyProviderRefundStatus(refunds, id, late, options)).applied).toBe(false);
    }
    expect((await refunds.findRefund(id))?.status).toBe('refunded');
    expect((await refunds.listRefundStatusChanges(id)).map((line) => line.to)).toEqual([
      'requested',
      'queued',
      'refunded',
    ]);
  });

  it('AC13: a status line carries its source and the provider’s event ID', async () => {
    const id = await queued();
    await applyProviderRefundStatus(refunds, id, 'refunded', {
      source: 'webhook',
      occurredAt: NOW,
      providerEventId: 'event-9',
    });
    expect((await refunds.listRefundStatusChanges(id)).at(-1)).toMatchObject({
      from: 'queued',
      to: 'refunded',
      source: 'webhook',
      providerEventId: 'event-9',
    });
  });

  it('a refund that does not exist is refused', async () => {
    await expect(applyProviderRefundStatus(refunds, 'nope', 'refunded', options)).rejects.toThrow();
  });
});

describe('recordReversal', () => {
  const reversal = {
    providerChargebackId: 'chb_1',
    amountCents: 26000,
    bankReason: 'MD01',
    receivedAt: NOW,
  };

  it('AC13: a reversal with the same provider ID is stored once', async () => {
    const first = await recordReversal(refunds, { ...reversal, paymentId });
    const again = await recordReversal(refunds, { ...reversal, paymentId, amountCents: 1 });
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.chargeback.amountCents).toBe(26000);
    expect(await refunds.listChargebacksOfPayment(paymentId)).toHaveLength(1);
  });

  it('does not edit the payment', async () => {
    const before = await payments.findPayment(paymentId);
    await recordReversal(refunds, { ...reversal, paymentId });
    expect(await payments.findPayment(paymentId)).toEqual(before);
  });

  it('rejects an amount that is not cents above zero and a blank provider ID', async () => {
    await expect(
      recordReversal(refunds, { ...reversal, paymentId, amountCents: 0 }),
    ).rejects.toMatchObject({ field: 'amountCents' });
    await expect(
      recordReversal(refunds, { ...reversal, paymentId, providerChargebackId: ' ' }),
    ).rejects.toMatchObject({ field: 'providerChargebackId' });
  });

  it('a blank reason code is none', async () => {
    const { chargeback } = await recordReversal(refunds, {
      ...reversal,
      paymentId,
      bankReason: '  ',
    });
    expect(chargeback.bankReason).toBeNull();
  });
});
