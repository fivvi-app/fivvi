import type { StatusSource } from './ledger.ts';
import type { RefundStatus } from './refund-status.ts';
import type { RefundBasis } from './refundable.ts';

// The refund ledger port (F060, spec #493, ticket #1141; AC9, AC13): the refunds of one
// workspace with their append-only status lines, and the reversals (*terugboekingen*, the
// provider's chargebacks) of its payments. `packages/database` implements it for a tenant scope;
// `./testing` has an in-memory one; both pass the same contract suite. The payment row is never
// edited by any of this: a refund and a reversal are rows of their own.

export interface RefundRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly paymentId: string;
  readonly clientId: string;
  readonly amountCents: number;
  /** Internal, for the Owner only; never sent to the provider or shown to the client. */
  readonly reason: string | null;
  /** The Owner's choice to take back the credits of the payment. */
  readonly revokeCredits: boolean;
  /** The provider's refund ID; `null` until the provider's refund is linked. */
  readonly providerRefundId: string | null;
  /** The team member who asked; `null` once that person left the team. */
  readonly requestedByTeamMemberId: string | null;
  /** The last of the refund's status lines. */
  readonly status: RefundStatus;
  readonly createdAt: Date;
}

export interface NewRefund {
  readonly paymentId: string;
  readonly amountCents: number;
  readonly reason: string | null;
  readonly revokeCredits: boolean;
  readonly requestedByTeamMemberId: string;
  /** The first status line, `requested`, is dated with it. */
  readonly occurredAt: Date;
}

export interface RefundStatusChange {
  readonly refundId: string;
  /** `null` for the first line of a refund. */
  readonly from: RefundStatus | null;
  readonly to: RefundStatus;
  readonly occurredAt: Date;
  readonly source: StatusSource;
  readonly providerEventId: string | null;
}

export interface RecordRefundStatusChange {
  readonly refundId: string;
  /** The status the refund must still have: the change is refused when another one got there first. */
  readonly from: RefundStatus;
  readonly to: RefundStatus;
  readonly occurredAt: Date;
  readonly source: StatusSource;
  readonly providerEventId?: string | null;
}

/** A reversal: the client's bank took a debit back (Mollie: a chargeback). */
export interface ChargebackRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly paymentId: string;
  readonly clientId: string;
  /** The provider's chargeback ID: one reversal per ID. */
  readonly providerChargebackId: string;
  readonly amountCents: number;
  /** The bank's reason code, as the provider reports it. */
  readonly bankReason: string | null;
  /** When the provider received the reversal. */
  readonly receivedAt: Date;
  readonly createdAt: Date;
}

export interface NewChargeback {
  readonly paymentId: string;
  readonly providerChargebackId: string;
  readonly amountCents: number;
  readonly bankReason: string | null;
  readonly receivedAt: Date;
}

export type InsertRefundResult =
  | { readonly kind: 'inserted'; readonly refund: RefundRecord }
  /** `admit` said no; nothing was written. `basis` is what it was told. */
  | { readonly kind: 'refused'; readonly basis: RefundBasis }
  /** The payment is not one of this workspace. */
  | { readonly kind: 'no_payment' };

/** The refund ledger of one workspace. Every call is scoped to it; another workspace's rows do not exist for it. */
export interface RefundLedger {
  /**
   * Inserts the refund with its first status line (`null → requested`) when `admit` accepts the
   * payment's facts. The facts are read and the refund written under a lock on the payment, so
   * two requests at once cannot both pass a bound that only one fits within.
   */
  insertRefund(
    refund: NewRefund,
    admit: (basis: RefundBasis) => boolean,
  ): Promise<InsertRefundResult>;
  findRefund(refundId: string): Promise<RefundRecord | undefined>;
  /** The refunds of a payment, oldest first. */
  listRefundsOfPayment(paymentId: string): Promise<RefundRecord[]>;
  /** The facts the refundable amount is worked out from; `undefined` for a payment that is not this workspace's. */
  refundBasis(paymentId: string): Promise<RefundBasis | undefined>;
  /** Links the refund to the provider's refund; a refund that is linked keeps its link. */
  linkProviderRefund(refundId: string, providerRefundId: string): Promise<RefundRecord>;
  /**
   * Appends a status line and moves the refund to it, once. `false` (and nothing written) when
   * the refund is no longer at `from` or already has a line for `to`.
   */
  recordRefundStatusChange(change: RecordRefundStatusChange): Promise<boolean>;
  /** The lines of a refund, oldest first. */
  listRefundStatusChanges(refundId: string): Promise<RefundStatusChange[]>;
  /**
   * Stores a reversal of a payment once per provider chargeback ID: the same ID again returns the
   * stored one untouched, `created` false. Throws for a payment that is not this workspace's.
   */
  recordChargeback(
    chargeback: NewChargeback,
  ): Promise<{ chargeback: ChargebackRecord; created: boolean }>;
  /** The reversals of a payment, oldest first. */
  listChargebacksOfPayment(paymentId: string): Promise<ChargebackRecord[]>;
}
