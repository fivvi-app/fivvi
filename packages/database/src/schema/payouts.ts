import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';
import { paymentStatusSource, payments } from './payments.ts';
import { paymentChargebacks, paymentRefunds } from './refunds.ts';

// Payouts and their lines (F061, spec #496, ticket #1163; ADR-020, ADR-006). A payout is a
// settlement of the payment provider (Mollie), stored once per workspace; its lines are the
// payments, refunds, reversals and fees it is made of, stored once each. Amounts are integers in
// euro cents, a line's signed (money in above zero, refunds, reversals and fees below). The
// status of a payout is the last of its append-only status lines, as a payment's is. The rules
// (importing a settlement, the order of the statuses) are in `packages/domain/src/commerce`; the
// tables repeat the ones they can. Every line is stored unmatched: the links to Fivvi's own
// payment, refund and reversal and the `matched` flag are filled by the matching ticket.

/** Where a payout stands, as the provider reports a settlement (`PAYOUT_STATUSES` in the domain). */
export const payoutStatus = pgEnum('payout_status', ['open', 'pending', 'paidout', 'failed']);

/** What a line of a payout is (`PAYOUT_LINE_TYPES` in the domain). */
export const payoutLineType = pgEnum('payout_line_type', [
  'payment',
  'refund',
  'chargeback',
  'fee',
  'other',
]);

/** Which fee a `fee` line is (`PAYOUT_FEE_KINDS` in the domain). */
export const payoutFeeKind = pgEnum('payout_fee_kind', [
  'ideal',
  'direct_debit',
  'refund',
  'failed_direct_debit',
  'reversal',
  'other',
]);

/**
 * A payout of a workspace: one settlement of the provider.
 *
 * - `provider_settlement_id` is unique per workspace (two workspaces can hold the same ID, as the
 *   fixtures do): fetching the settlement again stores nothing new.
 * - `reference` is the bank reference (the T-reference on the bank statement) and `settled_at` the
 *   day it was settled; both are empty while the settlement is open.
 * - `amount_cents` is what is paid out.
 * - `status` is the current status, the last of the payout's `payout_status_changes`; it is moved
 *   only together with a new line.
 * - `fetched_at` is when the settlement was last fetched from the provider.
 */
export const payouts = businessTable(
  'payouts',
  {
    providerSettlementId: text('provider_settlement_id').notNull(),
    reference: text('reference'),
    settledAt: instant('settled_at'),
    amountCents: integer('amount_cents').notNull(),
    status: payoutStatus('status').notNull(),
    fetchedAt: instant('fetched_at').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('payouts_organization_id_provider_settlement_id_unique').on(
      table.organizationId,
      table.providerSettlementId,
    ),
    // The list of payouts, newest first.
    index('payouts_organization_id_settled_at_idx').on(table.organizationId, table.settledAt),
    check('payouts_provider_settlement_id_valid', sql`btrim(${table.providerSettlementId}) <> ''`),
    check(
      'payouts_reference_valid',
      sql`${table.reference} IS NULL OR btrim(${table.reference}) <> ''`,
    ),
  ],
);

export type Payout = typeof payouts.$inferSelect;

/**
 * The status lines of a payout: append-only (a trigger refuses every update and delete, for
 * every role). A payout gets a line when its status changes and the first one, `null → status`,
 * when it is stored; the same status again appends nothing (the domain decides, and the update
 * of the payout is guarded by the status it was read at). `occurred_at` is when the status was
 * fetched; `created_at` is when the line was written. `updated_at` exists for the table
 * conventions and never changes.
 */
export const payoutStatusChanges = businessTable(
  'payout_status_changes',
  {
    payoutId: uuid('payout_id').notNull(),
    fromStatus: payoutStatus('from_status'),
    toStatus: payoutStatus('to_status').notNull(),
    occurredAt: instant('occurred_at').notNull(),
    source: paymentStatusSource('source').notNull(),
    ...timestamps(),
  },
  (table) => [
    index('payout_status_changes_organization_id_payout_id_idx').on(
      table.organizationId,
      table.payoutId,
      table.occurredAt,
    ),
    foreignKey({
      name: 'payout_status_changes_payout_fk',
      columns: [table.organizationId, table.payoutId],
      foreignColumns: [payouts.organizationId, payouts.id],
    }),
    check(
      'payout_status_changes_from_differs',
      sql`${table.fromStatus} IS NULL OR ${table.fromStatus} <> ${table.toStatus}`,
    ),
  ],
);

export type PayoutStatusChange = typeof payoutStatusChanges.$inferSelect;

/**
 * A line of a payout, stored once and never changed by an import.
 *
 * - `provider_line_id` is the line's identity within the payout: the provider's own ID of the
 *   payment, refund or chargeback, or `fee:<kind>` for a fee. Unique per payout.
 * - `type` is `payment`, `refund`, `chargeback`, `fee` or `other`; `fee_kind` is set for a fee
 *   and for nothing else; `fee_count` is how many transactions a fee adds up.
 * - `amount_cents` is signed.
 * - `matched_payment_id`, `matched_refund_id` and `matched_chargeback_id` are Fivvi's own rows the
 *   line was matched to (at most one of them), and `matched` says it was. A line with a link is
 *   matched; a line can be matched without a link (a fee Fivvi recognises). The matching ticket
 *   fills all four; an import stores them empty and `matched` false.
 */
export const payoutLines = businessTable(
  'payout_lines',
  {
    payoutId: uuid('payout_id').notNull(),
    providerLineId: text('provider_line_id').notNull(),
    type: payoutLineType('type').notNull(),
    feeKind: payoutFeeKind('fee_kind'),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull(),
    feeCount: integer('fee_count'),
    matchedPaymentId: uuid('matched_payment_id'),
    matchedRefundId: uuid('matched_refund_id'),
    matchedChargebackId: uuid('matched_chargeback_id'),
    matched: boolean('matched').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    unique('payout_lines_organization_id_payout_id_provider_line_id_unique').on(
      table.organizationId,
      table.payoutId,
      table.providerLineId,
    ),
    // Which line paid out a payment, a refund or a reversal (a payment's "paid out" is derived from it).
    index('payout_lines_organization_id_matched_payment_id_idx')
      .on(table.organizationId, table.matchedPaymentId)
      .where(sql`${table.matchedPaymentId} IS NOT NULL`),
    index('payout_lines_organization_id_matched_refund_id_idx')
      .on(table.organizationId, table.matchedRefundId)
      .where(sql`${table.matchedRefundId} IS NOT NULL`),
    index('payout_lines_organization_id_matched_chargeback_id_idx')
      .on(table.organizationId, table.matchedChargebackId)
      .where(sql`${table.matchedChargebackId} IS NOT NULL`),
    foreignKey({
      name: 'payout_lines_payout_fk',
      columns: [table.organizationId, table.payoutId],
      foreignColumns: [payouts.organizationId, payouts.id],
    }),
    foreignKey({
      name: 'payout_lines_matched_payment_fk',
      columns: [table.organizationId, table.matchedPaymentId],
      foreignColumns: [payments.organizationId, payments.id],
    }),
    foreignKey({
      name: 'payout_lines_matched_refund_fk',
      columns: [table.organizationId, table.matchedRefundId],
      foreignColumns: [paymentRefunds.organizationId, paymentRefunds.id],
    }),
    foreignKey({
      name: 'payout_lines_matched_chargeback_fk',
      columns: [table.organizationId, table.matchedChargebackId],
      foreignColumns: [paymentChargebacks.organizationId, paymentChargebacks.id],
    }),
    check('payout_lines_provider_line_id_valid', sql`btrim(${table.providerLineId}) <> ''`),
    check(
      'payout_lines_fee_kind_matches_type',
      sql`(${table.type} = 'fee') = (${table.feeKind} IS NOT NULL)`,
    ),
    check(
      'payout_lines_fee_count_valid',
      sql`${table.feeCount} IS NULL OR (${table.type} = 'fee' AND ${table.feeCount} >= 1)`,
    ),
    check(
      'payout_lines_one_match',
      sql`num_nonnulls(${table.matchedPaymentId}, ${table.matchedRefundId}, ${table.matchedChargebackId}) <= 1`,
    ),
    check(
      'payout_lines_link_means_matched',
      sql`${table.matched} OR num_nonnulls(${table.matchedPaymentId}, ${table.matchedRefundId}, ${table.matchedChargebackId}) = 0`,
    ),
  ],
);

export type PayoutLine = typeof payoutLines.$inferSelect;
