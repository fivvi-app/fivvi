import type { PaymentStatus } from './status.ts';

// The payment provider port (E019, spec #466, AC16, ADR-020). Every feature that moves money
// talks to this interface and never to an adapter, so Mollie can be replaced (ADR-020 names
// Stripe Connect as the fallback). The Mollie adapter comes with the connection; the in-memory
// fake in `./testing` is the other implementation, and both pass the contract suite.
//
// Amounts are integers in euro cents, everywhere. Only what a payment needs reaches the
// provider (AC17): the client's name and email (on the customer), the amount, a description and
// our own IDs. Never a note, a health detail or a full IBAN.

/**
 * Whose provider account a call is made on: the workspace's own (the gym is the merchant,
 * ADR-020). The adapter finds the stored connection and keeps its tokens fresh; callers never see
 * a token.
 */
export interface ProviderAccess {
  readonly workspaceId: string;
  /** True in every environment except production: every call is a test-mode call (AC14). */
  readonly testmode: boolean;
}

/** What is passed to the provider to start a connection (the Client Link or the authorise URL). */
export interface ConnectRequest {
  readonly workspaceId: string;
  /** The owner already has a provider account and signs in instead of creating one. */
  readonly hasProviderAccount: boolean;
  /** The one-off value that comes back with the authorisation code, to bind it to the session. */
  readonly state: string;
  readonly returnUrl: string;
  readonly locale: 'nl_NL' | 'en_US';
  /** Pre-filled onto the new account. */
  readonly owner: { readonly name: string; readonly email: string };
  readonly organization: { readonly name: string; readonly registrationNumber: string | null };
}

export interface ConnectStart {
  /** Where the owner goes next. */
  readonly url: string;
}

/** How far the provider says the connection is. `broken` is a token that no longer works. */
export type ProviderConnectionStatus = 'onboarding' | 'one_off_ready' | 'ready' | 'broken';

export interface ProviderCustomerRequest {
  /** Name and email of the client: the only personal data that reaches the provider. */
  readonly name: string;
  readonly email: string;
  /** The same key always gives the same customer. */
  readonly idempotencyKey: string;
  /** Our own IDs only. */
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ProviderCustomer {
  readonly id: string;
}

/** The sequence type of a payment (`first` creates the mandate, `recurring` uses it). */
export type ProviderSequenceType = 'first' | 'recurring' | 'oneoff';

export interface ProviderPaymentRequest {
  readonly customerId: string;
  readonly amountCents: number;
  readonly currency: 'EUR';
  /** Free of health and note content: the feature that creates the payment decides it. */
  readonly description: string;
  readonly sequenceType: ProviderSequenceType;
  /** Our payment ID: the same key never creates a second payment. */
  readonly idempotencyKey: string;
  /** Our IDs (`paymentId`, `workspaceId`), read back to find a payment whose answer got lost. */
  readonly metadata: Readonly<Record<string, string>>;
  readonly webhookUrl: string;
  readonly redirectUrl: string;
}

/** A payment as the provider reports it. */
export interface ProviderPayment {
  readonly id: string;
  readonly status: PaymentStatus;
  readonly amountCents: number;
  readonly currency: 'EUR';
  readonly description: string;
  readonly customerId: string;
  readonly sequenceType: ProviderSequenceType;
  readonly metadata: Readonly<Record<string, string>>;
  /** Where the client pays; `null` once there is nothing left to pay. */
  readonly checkoutUrl: string | null;
  /** The mandate the payment created or used, if any. */
  readonly mandateId: string | null;
  readonly testmode: boolean;
}

export interface ProviderRefundRequest {
  readonly paymentId: string;
  readonly amountCents: number;
  readonly description: string;
  readonly idempotencyKey: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export type ProviderRefundStatus =
  | 'queued'
  | 'pending'
  | 'processing'
  | 'refunded'
  | 'failed'
  | 'canceled';

export interface ProviderRefund {
  readonly id: string;
  readonly paymentId: string;
  readonly amountCents: number;
  readonly status: ProviderRefundStatus;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ProviderSettlement {
  readonly id: string;
  readonly reference: string | null;
  readonly status: 'open' | 'pending' | 'paidout' | 'failed';
  /** What is paid out to the gym, in cents. */
  readonly amountCents: number;
  readonly settledAt: Date | null;
}

export interface ProviderSettlementLine {
  readonly settlementId: string;
  /** The payment the line belongs to; `null` for a fee or a correction. */
  readonly paymentId: string | null;
  readonly description: string;
  readonly amountCents: number;
}

export interface PaymentProvider {
  /** Starts the connection of a workspace; the code that comes back is handled by the connection flow. */
  connect(request: ConnectRequest): Promise<ConnectStart>;
  /** How far the workspace's connection is, as the provider reports it. */
  connectionStatus(access: ProviderAccess): Promise<ProviderConnectionStatus>;
  createCustomer(
    access: ProviderAccess,
    request: ProviderCustomerRequest,
  ): Promise<ProviderCustomer>;
  createPayment(access: ProviderAccess, request: ProviderPaymentRequest): Promise<ProviderPayment>;
  getPayment(access: ProviderAccess, paymentId: string): Promise<ProviderPayment>;
  /** Every payment of the customer, with its metadata. */
  listCustomerPayments(access: ProviderAccess, customerId: string): Promise<ProviderPayment[]>;
  createRefund(access: ProviderAccess, request: ProviderRefundRequest): Promise<ProviderRefund>;
  getRefund(access: ProviderAccess, paymentId: string, refundId: string): Promise<ProviderRefund>;
  listSettlements(access: ProviderAccess): Promise<ProviderSettlement[]>;
  listSettlementLines(
    access: ProviderAccess,
    settlementId: string,
  ): Promise<ProviderSettlementLine[]>;
}

/**
 * Why a provider call failed, in terms the engine can act on. Adapters translate their SDK's
 * errors into these and never let a token, a response body or a personal detail into the message.
 *
 * - `unavailable`: no answer or a server error; whether the provider acted is unknown, so the
 *   caller retries and looks before it creates.
 * - `unauthorized`: the connection no longer works (it is `broken`, AC12).
 * - `not_found`: the provider has no such resource for this account.
 * - `rejected`: the provider refused the request itself.
 */
export type ProviderErrorCode = 'unavailable' | 'unauthorized' | 'not_found' | 'rejected';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}
