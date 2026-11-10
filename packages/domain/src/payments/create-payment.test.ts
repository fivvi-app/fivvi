import { fixedClock } from '@fivvi/testing/clock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CreatePaymentRequest,
  createPayment,
  InvalidPaymentError,
  type PaymentEngine,
} from './create-payment.ts';
import { ProviderError } from './provider.ts';
import { FakePaymentProvider } from './testing/fake-provider.ts';
import { InMemoryPaymentLedger } from './testing/in-memory-ledger.ts';

const WORKSPACE = 'workspace-johns-gym';
const ACCESS = { workspaceId: WORKSPACE, testmode: true };
const NOW = fixedClock('2026-11-10T09:00:00Z').now();

let provider: FakePaymentProvider;
let ledger: InMemoryPaymentLedger;
let engine: PaymentEngine;

function request(overrides: Partial<CreatePaymentRequest> = {}): CreatePaymentRequest {
  return {
    client: { id: 'client-anna', name: 'Anna de Vries', email: 'anna@example.com' },
    kind: 'recurring',
    purpose: 'agreement_due',
    purposeReferenceId: 'agreement-1',
    businessKey: 'agreement:1:due:2026-11-01',
    amountCents: 4950,
    description: 'Lidmaatschap november',
    supplied: {
      nameNl: 'Lidmaatschap Onbeperkt',
      nameEn: 'Unlimited membership',
      period: { startsOn: '2026-11-01', endsOn: '2026-11-30' },
      vatRateBp: 2100,
    },
    ...overrides,
  };
}

beforeEach(() => {
  provider = new FakePaymentProvider();
  ledger = new InMemoryPaymentLedger(WORKSPACE);
  engine = {
    workspaceId: WORKSPACE,
    provider,
    ledger,
    now: () => NOW,
    environment: {
      testmode: true,
      webhookUrl: 'https://pr-1.fivvi.example.com/api/v1/webhooks/mollie/payments',
      returnUrl: (paymentId) => `https://pr-1.fivvi.example.com/pay/${paymentId}`,
    },
  };
});

const creations = () => provider.calls.filter((call) => call.method === 'createPayment');

describe('createPayment', () => {
  it('AC5: the payment row exists before the provider is called, and its ID is the idempotency key', async () => {
    let rowBeforeCall: unknown;
    const original = provider.createPayment.bind(provider);
    vi.spyOn(provider, 'createPayment').mockImplementation(async (access, providerRequest) => {
      rowBeforeCall = await ledger.findPayment(providerRequest.idempotencyKey);
      return original(access, providerRequest);
    });

    const { payment, created } = await createPayment(engine, request());

    expect(created).toBe(true);
    expect(rowBeforeCall).toMatchObject({ id: payment.id, status: 'open' });
    expect(creations()).toHaveLength(1);
    expect(creations()[0]?.request).toEqual({
      customerId: expect.any(String),
      amountCents: 4950,
      currency: 'EUR',
      description: 'Lidmaatschap november',
      sequenceType: 'recurring',
      idempotencyKey: payment.id,
      metadata: { paymentId: payment.id, workspaceId: WORKSPACE },
      webhookUrl: 'https://pr-1.fivvi.example.com/api/v1/webhooks/mollie/payments',
      redirectUrl: `https://pr-1.fivvi.example.com/pay/${payment.id}`,
    });
    expect(creations()[0]?.access).toEqual(ACCESS);
  });

  it('AC5: the payment is linked to the provider’s payment, open, with one status line', async () => {
    const { payment, checkoutUrl } = await createPayment(engine, request());
    const [providerPayment] = provider.paymentsOf(ACCESS);
    expect(payment).toMatchObject({
      status: 'open',
      amountCents: 4950,
      providerPaymentId: providerPayment?.id,
      businessKey: 'agreement:1:due:2026-11-01',
      purpose: 'agreement_due',
      purposeReferenceId: 'agreement-1',
    });
    expect(checkoutUrl).toBe(providerPayment?.checkoutUrl);
    expect(await ledger.listStatusChanges(payment.id)).toHaveLength(1);
  });

  it('AC5: a second request with the same business key returns the same payment and creates nothing', async () => {
    const first = await createPayment(engine, request());
    const again = await createPayment(engine, request({ amountCents: 1 }));
    expect(again.created).toBe(false);
    expect(again.payment).toEqual(first.payment);
    expect(creations()).toHaveLength(1);
    expect(provider.paymentsOf(ACCESS)).toHaveLength(1);
    expect(provider.calls.filter((call) => call.method === 'createCustomer')).toHaveLength(1);
  });

  it('a client gets one provider customer, used by all their payments', async () => {
    await createPayment(engine, request());
    await createPayment(engine, request({ businessKey: 'agreement:1:due:2026-12-01' }));
    expect(provider.customersOf(ACCESS)).toHaveLength(1);
    const [first, second] = provider.paymentsOf(ACCESS);
    expect(first?.customerId).toBe(second?.customerId);
  });

  it('AC6: when the answer was lost, the retry finds the payment by our metadata and creates nothing', async () => {
    provider.failNext('createPayment', 'lost-response');
    await expect(createPayment(engine, request())).rejects.toMatchObject({ code: 'unavailable' });
    expect(provider.paymentsOf(ACCESS)).toHaveLength(1);

    const retry = await createPayment(engine, request());

    expect(retry.created).toBe(false);
    expect(retry.payment.providerPaymentId).toBe(provider.paymentsOf(ACCESS)[0]?.id);
    expect(provider.paymentsOf(ACCESS)).toHaveLength(1);
    expect(creations()).toHaveLength(1);
    expect(provider.calls.some((call) => call.method === 'listCustomerPayments')).toBe(true);
  });

  it('AC6: the same after the access token was refreshed, and a second time', async () => {
    provider.failNext('createPayment', 'lost-response');
    await expect(createPayment(engine, request())).rejects.toBeInstanceOf(ProviderError);

    provider.refreshAccessToken();
    provider.failNext('listCustomerPayments');
    await expect(createPayment(engine, request())).rejects.toBeInstanceOf(ProviderError);

    provider.refreshAccessToken();
    const retry = await createPayment(engine, request());
    expect(retry.payment.providerPaymentId).toBe(provider.paymentsOf(ACCESS)[0]?.id);
    expect(provider.paymentsOf(ACCESS)).toHaveLength(1);
    expect(creations()).toHaveLength(1);
    expect(provider.calls.at(-1)?.tokenVersion).toBe(3);

    const third = await createPayment(engine, request());
    expect(third.payment).toEqual(retry.payment);
    expect(creations()).toHaveLength(1);
  });

  it('AC6: a call that failed before the provider acted is retried with a creation', async () => {
    provider.failNext('createPayment', 'before');
    await expect(createPayment(engine, request())).rejects.toMatchObject({ code: 'unavailable' });
    expect(provider.paymentsOf(ACCESS)).toHaveLength(0);

    const retry = await createPayment(engine, request());

    expect(provider.paymentsOf(ACCESS)).toHaveLength(1);
    expect(retry.payment.providerPaymentId).toBe(provider.paymentsOf(ACCESS)[0]?.id);
    expect(retry.payment.id).toBeDefined();
  });

  it('AC6: a customer whose creation answer was lost is not created twice', async () => {
    provider.failNext('createCustomer', 'lost-response');
    await expect(createPayment(engine, request())).rejects.toBeInstanceOf(ProviderError);
    await createPayment(engine, request());
    expect(provider.customersOf(ACCESS)).toHaveLength(1);
  });

  it('AC6/AC7: a payment that was paid while the answer was lost is applied as paid, once', async () => {
    provider.failNext('createPayment', 'lost-response');
    await expect(createPayment(engine, request())).rejects.toBeInstanceOf(ProviderError);
    provider.pay(ACCESS, provider.paymentsOf(ACCESS)[0]?.id ?? '');

    const retry = await createPayment(engine, request());

    expect(retry.payment.status).toBe('paid');
    const lines = await ledger.listStatusChanges(retry.payment.id);
    expect(lines.map((line) => line.to)).toEqual(['open', 'paid']);
    expect(lines[1]?.source).toBe('fetch');
    await createPayment(engine, request());
    expect(await ledger.listStatusChanges(retry.payment.id)).toHaveLength(2);
  });

  it('AC17: only the client’s name and email, the amount, the description and our IDs reach the provider', async () => {
    await createPayment(engine, request({ description: 'Lidmaatschap november' }));
    const sent = JSON.stringify(provider.calls.map((call) => call.request));
    expect(sent).not.toContain('Lidmaatschap Onbeperkt');
    expect(sent).not.toContain('Unlimited membership');
    expect(provider.customersOf(ACCESS)).toEqual([
      {
        name: 'Anna de Vries',
        email: 'anna@example.com',
        idempotencyKey: `customer:${WORKSPACE}:client-anna`,
        metadata: { clientId: 'client-anna', workspaceId: WORKSPACE },
      },
    ]);
    const [payment] = provider.paymentsOf(ACCESS);
    expect(Object.keys(creations()[0]?.request as object).sort()).toEqual([
      'amountCents',
      'currency',
      'customerId',
      'description',
      'idempotencyKey',
      'metadata',
      'redirectUrl',
      'sequenceType',
      'webhookUrl',
    ]);
    expect(Object.keys(payment?.metadata ?? {}).sort()).toEqual(['paymentId', 'workspaceId']);
  });

  it('keeps the test mode of the environment on every call', async () => {
    engine = { ...engine, environment: { ...engine.environment, testmode: false } };
    await createPayment(engine, request());
    expect(provider.calls.every((call) => call.access?.testmode === false)).toBe(true);
    expect((await ledger.findPayment(`${WORKSPACE}-payment-1`))?.testmode).toBe(false);
  });

  it('refuses a request that is not a whole number of cents above zero, and writes nothing', async () => {
    for (const amountCents of [0, -5, 12.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(createPayment(engine, request({ amountCents }))).rejects.toMatchObject({
        name: 'InvalidPaymentError',
        field: 'amountCents',
      });
    }
    expect(await ledger.findPayment(`${WORKSPACE}-payment-1`)).toBeUndefined();
    expect(provider.calls).toHaveLength(0);
  });

  it('refuses an empty business key and a description that is empty or longer than the provider takes', async () => {
    await expect(createPayment(engine, request({ businessKey: ' ' }))).rejects.toMatchObject({
      field: 'businessKey',
    });
    await expect(createPayment(engine, request({ description: '' }))).rejects.toMatchObject({
      field: 'description',
    });
    await expect(
      createPayment(engine, request({ description: 'x'.repeat(256) })),
    ).rejects.toBeInstanceOf(InvalidPaymentError);
    expect(provider.calls).toHaveLength(0);
  });

  it('a broken connection stops the creation and leaves the row to retry after reconnecting', async () => {
    provider.setConnectionStatus('broken');
    await expect(createPayment(engine, request())).rejects.toMatchObject({ code: 'unauthorized' });
    provider.setConnectionStatus('ready');
    const retry = await createPayment(engine, request());
    expect(retry.created).toBe(false);
    expect(retry.payment.providerPaymentId).not.toBeNull();
    expect(provider.paymentsOf(ACCESS)).toHaveLength(1);
  });
});
