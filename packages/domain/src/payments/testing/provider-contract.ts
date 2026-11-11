import { describe, expect, it } from 'vitest';
import {
  type PaymentProvider,
  type ProviderAccess,
  ProviderError,
  type ProviderPaymentRequest,
} from '../provider.ts';

// The shared provider contract suite (AC16): what every `PaymentProvider` must do, whatever is
// behind it. The fake passes it in `provider-contract.test.ts`; the Mollie adapter runs the same
// suite against Mollie's test mode when it exists. Test-only.

export interface ProviderHarness {
  readonly provider: PaymentProvider;
  readonly access: ProviderAccess;
  /**
   * Makes a payment of this provider paid, as the client does in the checkout. Only an
   * implementation that can (the fake) supplies it; the refund checks need it.
   */
  readonly pay: (providerPaymentId: string) => Promise<void>;
}

const CONNECT_REQUEST = {
  workspaceId: 'workspace-contract',
  hasProviderAccount: false,
  state: 'state-contract',
  returnUrl: 'https://example.com/api/v1/payments/oauth/return',
  locale: 'nl_NL',
  owner: { name: 'John', email: 'john@example.com' },
  organization: { name: "John's Gym", registrationNumber: '12345678' },
} as const;

function paymentRequest(
  customerId: string,
  overrides: Partial<ProviderPaymentRequest> = {},
): ProviderPaymentRequest {
  return {
    customerId,
    amountCents: 4950,
    currency: 'EUR',
    description: 'Membership October',
    sequenceType: 'oneoff',
    idempotencyKey: 'payment-1',
    metadata: { paymentId: 'payment-1', workspaceId: 'workspace-contract' },
    webhookUrl: 'https://example.com/api/v1/webhooks/mollie/payments',
    redirectUrl: 'https://example.com/pay/payment-1',
    ...overrides,
  };
}

function customerOf(harness: ProviderHarness, key = 'customer-1') {
  return harness.provider.createCustomer(harness.access, {
    name: 'Anna de Vries',
    email: 'anna@example.com',
    idempotencyKey: key,
    metadata: { clientId: key },
  });
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

export interface ProviderContractOptions {
  /** The provider can be made to take a payment (`pay`), so the refund checks run. */
  readonly canPay: boolean;
}

export function providerContract(
  name: string,
  create: () => ProviderHarness | Promise<ProviderHarness>,
  options: ProviderContractOptions,
): void {
  describe(`payment provider contract: ${name}`, () => {
    it('AC16: starting a connection gives a URL to send the owner to', async () => {
      const { provider } = await create();
      const started = await provider.connect(CONNECT_REQUEST);
      expect(started.url).toMatch(/^https:\/\//);
    });

    it('AC16: the connection status is one the engine knows', async () => {
      const { provider, access } = await create();
      expect(['onboarding', 'one_off_ready', 'ready', 'broken']).toContain(
        await provider.connectionStatus(access),
      );
    });

    it('AC16: the same customer key gives the same customer, another key another one', async () => {
      const harness = await create();
      const first = await customerOf(harness, 'customer-1');
      expect((await customerOf(harness, 'customer-1')).id).toBe(first.id);
      expect((await customerOf(harness, 'customer-2')).id).not.toBe(first.id);
    });

    it('AC16: a payment starts open, in cents, with our metadata and a checkout URL', async () => {
      const harness = await create();
      const customer = await customerOf(harness);
      const payment = await harness.provider.createPayment(
        harness.access,
        paymentRequest(customer.id),
      );
      expect(payment).toMatchObject({
        status: 'open',
        amountCents: 4950,
        currency: 'EUR',
        description: 'Membership October',
        customerId: customer.id,
        sequenceType: 'oneoff',
        metadata: { paymentId: 'payment-1', workspaceId: 'workspace-contract' },
        testmode: harness.access.testmode,
      });
      expect(payment.checkoutUrl).toMatch(/^https:\/\//);
    });

    it('AC5: the same idempotency key creates one payment, not two', async () => {
      const harness = await create();
      const customer = await customerOf(harness);
      const first = await harness.provider.createPayment(
        harness.access,
        paymentRequest(customer.id),
      );
      const again = await harness.provider.createPayment(
        harness.access,
        paymentRequest(customer.id),
      );
      expect(again.id).toBe(first.id);
      expect(await harness.provider.listCustomerPayments(harness.access, customer.id)).toHaveLength(
        1,
      );
    });

    it('AC16: a payment is fetched by its ID and an unknown one is not found', async () => {
      const harness = await create();
      const customer = await customerOf(harness);
      const payment = await harness.provider.createPayment(
        harness.access,
        paymentRequest(customer.id),
      );
      expect(await harness.provider.getPayment(harness.access, payment.id)).toMatchObject({
        id: payment.id,
        status: 'open',
      });
      expect((await failure(harness.provider.getPayment(harness.access, 'tr_unknown'))).code).toBe(
        'not_found',
      );
    });

    it('AC6: a customer’s payments are listed with their metadata, and only that customer’s', async () => {
      const harness = await create();
      const anna = await customerOf(harness, 'anna');
      const mark = await customerOf(harness, 'mark');
      const annas = await harness.provider.createPayment(
        harness.access,
        paymentRequest(anna.id, { idempotencyKey: 'a', metadata: { paymentId: 'a' } }),
      );
      await harness.provider.createPayment(
        harness.access,
        paymentRequest(mark.id, { idempotencyKey: 'm', metadata: { paymentId: 'm' } }),
      );
      const listed = await harness.provider.listCustomerPayments(harness.access, anna.id);
      expect(listed.map((payment) => payment.id)).toEqual([annas.id]);
      expect(listed[0]?.metadata).toEqual({ paymentId: 'a' });
    });

    it('AC16: an amount that is not a whole number of cents above zero is rejected', async () => {
      const harness = await create();
      const customer = await customerOf(harness);
      for (const amountCents of [0, -100, 12.5]) {
        const error = await failure(
          harness.provider.createPayment(
            harness.access,
            paymentRequest(customer.id, { amountCents }),
          ),
        );
        expect(error.code).toBe('rejected');
      }
    });

    it('AC16: a payment for a customer the provider does not know is rejected', async () => {
      const harness = await create();
      const error = await failure(
        harness.provider.createPayment(harness.access, paymentRequest('cst_unknown')),
      );
      expect(['not_found', 'rejected']).toContain(error.code);
    });

    it('AC16: a payment that is not paid cannot be refunded', async () => {
      const harness = await create();
      const customer = await customerOf(harness);
      const payment = await harness.provider.createPayment(
        harness.access,
        paymentRequest(customer.id),
      );
      const error = await failure(
        harness.provider.createRefund(harness.access, {
          paymentId: payment.id,
          amountCents: 1000,
          description: 'Refund',
          idempotencyKey: 'refund-1',
          metadata: {},
        }),
      );
      expect(error.code).toBe('rejected');
    });

    it('AC16: settlements and their lines are listed', async () => {
      const harness = await create();
      const settlements = await harness.provider.listSettlements(harness.access);
      expect(Array.isArray(settlements)).toBe(true);
      expect(
        (await failure(harness.provider.listSettlementLines(harness.access, 'stl_unknown'))).code,
      ).toBe('not_found');
    });

    if (options.canPay) {
      it('AC16: a paid payment is refunded once per idempotency key and the refund is fetched', async () => {
        const harness = await create();
        const customer = await customerOf(harness);
        const payment = await harness.provider.createPayment(
          harness.access,
          paymentRequest(customer.id),
        );
        await harness.pay(payment.id);
        const request = {
          paymentId: payment.id,
          amountCents: 1000,
          description: 'Refund',
          idempotencyKey: 'refund-1',
          metadata: { refundId: 'refund-1' },
        };
        const refund = await harness.provider.createRefund(harness.access, request);
        expect(refund).toMatchObject({ paymentId: payment.id, amountCents: 1000 });
        expect((await harness.provider.createRefund(harness.access, request)).id).toBe(refund.id);
        expect(
          await harness.provider.getRefund(harness.access, payment.id, refund.id),
        ).toMatchObject({
          id: refund.id,
          amountCents: 1000,
        });
        const over = await failure(
          harness.provider.createRefund(harness.access, {
            ...request,
            amountCents: 4000,
            idempotencyKey: 'refund-2',
          }),
        );
        expect(over.code).toBe('rejected');
      });
    }
  });
}
