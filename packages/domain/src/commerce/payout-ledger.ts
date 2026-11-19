// Module: the payout ledger port, the payouts of one workspace with their lines and status lines.
// Spec: #496 (F061), ticket #1163; AC5.
//
// A payout is a Mollie settlement stored once per workspace (unique on the settlement ID); its
// lines are stored once each (unique on the line's identity within the payout) and are never
// changed by an import; its status is the last of its append-only status lines. Every line is
// stored unmatched here: the links to Fivvi's payment, refund and reversal and the `matched`
// flag are filled by the matching ticket. `packages/database` implements the port for a tenant
// scope; `@fivvi/domain/testing` has an in-memory one; both pass the same contract suite.

import type { StatusSource } from '../payments/ledger.ts';
import type { ProviderFeeKind, ProviderSettlementLineType } from '../payments/provider.ts';
import type { PayoutStatus } from './payout-status.ts';

/** What a payout line is (`ProviderSettlementLineType`); one list for the domain and the table. */
export const PAYOUT_LINE_TYPES = ['payment', 'refund', 'chargeback', 'fee', 'other'] as const;
/** Which fee a `fee` line is. */
export const PAYOUT_FEE_KINDS = [
  'ideal',
  'direct_debit',
  'refund',
  'failed_direct_debit',
  'reversal',
  'other',
] as const;

// The port's types and the lists above must stay one thing: these fail to compile when they drift.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _lineTypes: Same<(typeof PAYOUT_LINE_TYPES)[number], ProviderSettlementLineType> = true;
const _feeKinds: Same<(typeof PAYOUT_FEE_KINDS)[number], ProviderFeeKind> = true;
void _lineTypes;
void _feeKinds;

export interface PayoutRecord {
  readonly id: string;
  readonly workspaceId: string;
  /** Mollie's settlement ID: one payout per ID in a workspace. */
  readonly providerSettlementId: string;
  /** The bank reference (the T-reference on the bank statement); `null` while the settlement is open. */
  readonly reference: string | null;
  readonly settledAt: Date | null;
  /** What is paid out, in euro cents. */
  readonly amountCents: number;
  /** The last of the payout's status lines. */
  readonly status: PayoutStatus;
  /** When the settlement was last fetched from Mollie. */
  readonly fetchedAt: Date;
  readonly createdAt: Date;
}

export interface NewPayout {
  readonly providerSettlementId: string;
  readonly reference: string | null;
  readonly settledAt: Date | null;
  readonly amountCents: number;
  readonly status: PayoutStatus;
  readonly fetchedAt: Date;
  /** The first status line, `null → status`, is dated `fetchedAt` and has this source. */
  readonly source: StatusSource;
}

/** What a later fetch may update on a payout: never its status, never its lines. */
export interface PayoutDetails {
  readonly reference: string | null;
  readonly settledAt: Date | null;
  readonly amountCents: number;
  readonly fetchedAt: Date;
}

export interface PayoutStatusChange {
  readonly payoutId: string;
  /** `null` for the first line of a payout. */
  readonly from: PayoutStatus | null;
  readonly to: PayoutStatus;
  readonly occurredAt: Date;
  readonly source: StatusSource;
}

export interface RecordPayoutStatusChange {
  readonly payoutId: string;
  /** The status the payout must still have: the change is refused when another one got there first. */
  readonly from: PayoutStatus;
  readonly to: PayoutStatus;
  readonly occurredAt: Date;
  readonly source: StatusSource;
}

export interface PayoutLineRecord {
  readonly id: string;
  readonly payoutId: string;
  /** Mollie's own ID of the payment, refund or chargeback, or of the balance transaction that carries a fee; unique within the payout. */
  readonly providerLineId: string;
  readonly type: ProviderSettlementLineType;
  readonly feeKind: ProviderFeeKind | null;
  /** Signed euro cents. */
  readonly amountCents: number;
  readonly description: string;
  /** How many transactions a fee line adds up; `null` for every other line. */
  readonly count: number | null;
  /** Fivvi's own payment, refund or reversal the line was matched to; empty until the matching ticket fills them. */
  readonly matchedPaymentId: string | null;
  readonly matchedRefundId: string | null;
  readonly matchedChargebackId: string | null;
  readonly matched: boolean;
  readonly createdAt: Date;
}

export interface NewPayoutLine {
  readonly providerLineId: string;
  readonly type: ProviderSettlementLineType;
  readonly feeKind: ProviderFeeKind | null;
  readonly amountCents: number;
  readonly description: string;
  readonly count: number | null;
}

/** The payout ledger of one workspace. Every call is scoped to it; another workspace's rows do not exist for it. */
export interface PayoutLedger {
  /**
   * Stores the payout with its first status line (`null → status`) once per settlement ID. When
   * the settlement is already stored it is returned untouched, `created` false.
   */
  insertPayout(payout: NewPayout): Promise<{ payout: PayoutRecord; created: boolean }>;
  /** Updates what a later fetch may change (reference, settled date, amount, fetch time); never the status. */
  refreshPayout(payoutId: string, details: PayoutDetails): Promise<PayoutRecord>;
  /**
   * Appends a status line and moves the payout to it. `false` (and nothing written) when the
   * payout is no longer at `from`.
   */
  recordPayoutStatusChange(change: RecordPayoutStatusChange): Promise<boolean>;
  /**
   * Stores the lines that the payout does not have yet, unmatched; a line with an identity the
   * payout already has is left as it is. Returns how many were stored. Throws for a payout that
   * is not this workspace's.
   */
  insertPayoutLines(payoutId: string, lines: readonly NewPayoutLine[]): Promise<number>;
  findPayout(payoutId: string): Promise<PayoutRecord | undefined>;
  findPayoutBySettlement(providerSettlementId: string): Promise<PayoutRecord | undefined>;
  /** Newest first (by settled date, an unsettled one first). */
  listPayouts(): Promise<PayoutRecord[]>;
  /** The lines of a payout: payments, refunds, reversals, fees, the rest (the order of `PAYOUT_LINE_TYPES`), then by identity. */
  listPayoutLines(payoutId: string): Promise<PayoutLineRecord[]>;
  /** The status lines of a payout, oldest first. */
  listPayoutStatusChanges(payoutId: string): Promise<PayoutStatusChange[]>;
}
