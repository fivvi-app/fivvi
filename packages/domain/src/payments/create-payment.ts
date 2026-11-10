import { applyProviderStatus } from './apply-status.ts';
import type {
  PaymentKind,
  PaymentLedger,
  PaymentPurpose,
  PaymentRecord,
  PaymentSupplied,
} from './ledger.ts';
import type { PaymentProvider, ProviderAccess, ProviderPayment } from './provider.ts';

// Creating a payment exactly once (E019, spec #466, AC5, AC6, AC17, ADR-020): our row first, our
// ID as the idempotency key and in the metadata, and on a retry a look at the provider's payments
// for that customer before anything is created. The money never moves twice, whatever fails.

/** What the engine runs in: the workspace, the two ports, the environment and the clock. */
export interface PaymentEngine {
  readonly workspaceId: string;
  readonly provider: PaymentProvider;
  /** The ledger of `workspaceId`. */
  readonly ledger: PaymentLedger;
  readonly environment: PaymentEnvironment;
  /** The injected clock; the domain never reads the system time. */
  readonly now: () => Date;
}

/** The environment's own URLs and mode: previews and production each use their own. */
export interface PaymentEnvironment {
  /** True in every environment except production (AC14). */
  readonly testmode: boolean;
  /** Where the provider reports changes. */
  readonly webhookUrl: string;
  /** Where the client returns to after the checkout (CP-03). */
  readonly returnUrl: (paymentId: string) => string;
}

export interface CreatePaymentRequest {
  /** Their name and email are all the provider learns about the client. */
  readonly client: { readonly id: string; readonly name: string; readonly email: string };
  readonly kind: PaymentKind;
  readonly purpose: PaymentPurpose;
  /** The agreement, pass or invoice the feature pays for. */
  readonly purposeReferenceId?: string | null;
  /** The business reason, unique per workspace: `agreement:{id}:due:{date}`. The same one is the same payment. */
  readonly businessKey: string;
  readonly amountCents: number;
  /** Shown to the client at the provider: no health or note content, ever. */
  readonly description: string;
  /** What it pays for, kept in our ledger only. */
  readonly supplied: PaymentSupplied;
}

export interface CreatedPayment {
  readonly payment: PaymentRecord;
  /** False when the business key was a payment already. */
  readonly created: boolean;
  /** Where the client pays, when this call talked to the provider and there is something to pay. */
  readonly checkoutUrl: string | null;
}

export type InvalidPaymentField = 'amountCents' | 'businessKey' | 'description';

export class InvalidPaymentError extends Error {
  readonly field: InvalidPaymentField;

  constructor(field: InvalidPaymentField, message: string) {
    super(message);
    this.name = 'InvalidPaymentError';
    this.field = field;
  }
}

/** The longest description Mollie takes. */
export const PAYMENT_DESCRIPTION_MAX_LENGTH = 255;

function validate(request: CreatePaymentRequest): void {
  if (!Number.isSafeInteger(request.amountCents) || request.amountCents < 1) {
    throw new InvalidPaymentError(
      'amountCents',
      'A payment is a whole number of cents above zero.',
    );
  }
  if (request.businessKey.trim() === '') {
    throw new InvalidPaymentError('businessKey', 'A payment needs its business key.');
  }
  if (
    request.description.trim() === '' ||
    request.description.length > PAYMENT_DESCRIPTION_MAX_LENGTH
  ) {
    throw new InvalidPaymentError(
      'description',
      `A description is 1 to ${PAYMENT_DESCRIPTION_MAX_LENGTH} characters.`,
    );
  }
}

/**
 * Creates the payment for a business reason once. Throws what the provider throws
 * (`ProviderError`); the row stays, and calling again with the same business key picks up where
 * this stopped: it looks for the payment at the provider by our metadata and creates one only
 * when there is none.
 */
export async function createPayment(
  engine: PaymentEngine,
  request: CreatePaymentRequest,
): Promise<CreatedPayment> {
  validate(request);
  const access: ProviderAccess = {
    workspaceId: engine.workspaceId,
    testmode: engine.environment.testmode,
  };

  const { payment, created } = await engine.ledger.insertPayment({
    clientId: request.client.id,
    kind: request.kind,
    purpose: request.purpose,
    purposeReferenceId: request.purposeReferenceId ?? null,
    businessKey: request.businessKey,
    amountCents: request.amountCents,
    description: request.description,
    supplied: request.supplied,
    testmode: access.testmode,
    occurredAt: engine.now(),
  });
  if (payment.providerPaymentId) return { payment, created, checkoutUrl: null };

  const customerId = await providerCustomerOf(engine, access, request.client);

  // A row without a provider payment is a first try or a retry; only a retry can have a payment
  // at the provider already, so only a retry looks.
  const found = created ? undefined : await findAtProvider(engine, access, customerId, payment.id);
  const providerPayment =
    found ??
    (await engine.provider.createPayment(access, {
      customerId,
      amountCents: payment.amountCents,
      currency: 'EUR',
      description: payment.description,
      sequenceType: payment.kind,
      idempotencyKey: payment.id,
      metadata: { paymentId: payment.id, workspaceId: engine.workspaceId },
      webhookUrl: engine.environment.webhookUrl,
      redirectUrl: engine.environment.returnUrl(payment.id),
    }));

  await engine.ledger.linkProviderPayment(payment.id, {
    providerPaymentId: providerPayment.id,
    providerMandateId: providerPayment.mandateId,
  });
  const { payment: current } = await applyProviderStatus(
    engine.ledger,
    payment.id,
    providerPayment.status,
    { source: 'fetch', occurredAt: engine.now() },
  );
  return { payment: current, created, checkoutUrl: providerPayment.checkoutUrl };
}

async function providerCustomerOf(
  engine: PaymentEngine,
  access: ProviderAccess,
  client: CreatePaymentRequest['client'],
): Promise<string> {
  const linked = await engine.ledger.findProviderCustomerId(client.id);
  if (linked) return linked;
  // The key is ours and stays the same for the client, so a customer whose creation answer was
  // lost is the same customer when asked again.
  const customer = await engine.provider.createCustomer(access, {
    name: client.name,
    email: client.email,
    idempotencyKey: `customer:${engine.workspaceId}:${client.id}`,
    metadata: { clientId: client.id, workspaceId: engine.workspaceId },
  });
  return engine.ledger.linkProviderCustomer(client.id, customer.id);
}

async function findAtProvider(
  engine: PaymentEngine,
  access: ProviderAccess,
  customerId: string,
  paymentId: string,
): Promise<ProviderPayment | undefined> {
  const payments = await engine.provider.listCustomerPayments(access, customerId);
  return payments.find(
    (candidate) =>
      candidate.metadata.paymentId === paymentId &&
      candidate.metadata.workspaceId === engine.workspaceId,
  );
}
