import type { PaymentStatus } from './status.ts';

// The payment ledger port (E019, spec #466, AC5–AC7): the payments of one workspace, the
// provider customers of its clients and the append-only status lines. `packages/database`
// implements it for a tenant scope; `./testing` has an in-memory one. Both pass the same
// contract suite. Money is a ledger, not a field (`ROADMAP.md` M11): the status of a payment is
// the last of its lines.

export type PaymentKind = 'first' | 'recurring' | 'oneoff';

export const PAYMENT_PURPOSES = [
  'agreement_first',
  'agreement_due',
  'open_amount',
  'single_class_pass',
] as const;

export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/**
 * What a payment pays for, as it was when the payment was made (read by the invoice, F059): the
 * offer's name in both languages, the period it covers and the VAT rate in basis points
 * (2100 is 21 %; `null` for a workspace that charges no VAT). Never sent to the provider.
 */
export interface PaymentSupplied {
  readonly nameNl: string;
  readonly nameEn: string;
  readonly period: { readonly startsOn: string; readonly endsOn: string } | null;
  readonly vatRateBp: number | null;
}

export interface PaymentRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly clientId: string;
  readonly kind: PaymentKind;
  readonly purpose: PaymentPurpose;
  /** The agreement, pass or invoice the feature paid for; its meaning follows `purpose`. */
  readonly purposeReferenceId: string | null;
  /** Unique per workspace: the same business reason is one payment. */
  readonly businessKey: string;
  readonly amountCents: number;
  readonly currency: 'EUR';
  readonly description: string;
  readonly supplied: PaymentSupplied;
  readonly providerPaymentId: string | null;
  readonly providerMandateId: string | null;
  readonly status: PaymentStatus;
  readonly testmode: boolean;
  readonly createdAt: Date;
}

export interface NewPayment {
  readonly clientId: string;
  readonly kind: PaymentKind;
  readonly purpose: PaymentPurpose;
  readonly purposeReferenceId: string | null;
  readonly businessKey: string;
  readonly amountCents: number;
  readonly description: string;
  readonly supplied: PaymentSupplied;
  readonly testmode: boolean;
  /** The ledger's first line, `open`, is dated with it. */
  readonly occurredAt: Date;
}

/** Where a status came from. */
export type StatusSource = 'webhook' | 'fetch' | 'job';

export interface StatusChange {
  readonly paymentId: string;
  /** `null` for the first line of a payment. */
  readonly from: PaymentStatus | null;
  readonly to: PaymentStatus;
  readonly occurredAt: Date;
  readonly source: StatusSource;
  readonly providerEventId: string | null;
}

export interface RecordStatusChange {
  readonly paymentId: string;
  /** The status the payment must still have: the change is refused when another one got there first. */
  readonly from: PaymentStatus;
  readonly to: PaymentStatus;
  readonly occurredAt: Date;
  readonly source: StatusSource;
  readonly providerEventId?: string | null;
}

/** The ledger of one workspace. Every call is scoped to it; another workspace's rows do not exist for it. */
export interface PaymentLedger {
  /**
   * Inserts the payment (with its first status line, `open`) or, when the workspace has one with
   * this business key already, returns that one untouched. `created` says which.
   */
  insertPayment(payment: NewPayment): Promise<{ payment: PaymentRecord; created: boolean }>;
  findPayment(paymentId: string): Promise<PaymentRecord | undefined>;
  /** The provider's customer ID of a client, if one was linked. */
  findProviderCustomerId(clientId: string): Promise<string | undefined>;
  /** Links the client to a provider customer; the first link wins and is returned. */
  linkProviderCustomer(clientId: string, providerCustomerId: string): Promise<string>;
  /** Links the payment to the provider's payment (and mandate); a payment that is linked keeps its link. */
  linkProviderPayment(
    paymentId: string,
    link: { providerPaymentId: string; providerMandateId: string | null },
  ): Promise<PaymentRecord>;
  /**
   * Appends a status line and moves the payment to it, once. `false` (and nothing written) when
   * the payment is no longer at `from` or already has a line for `to`.
   */
  recordStatusChange(change: RecordStatusChange): Promise<boolean>;
  /** The lines of a payment, oldest first. */
  listStatusChanges(paymentId: string): Promise<StatusChange[]>;
}
