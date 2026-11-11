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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';
import { paymentStatusSource, payments } from './payments.ts';
import { teamMembers } from './tenancy.ts';

// Refunds and reversals of payments (F060, spec #493, ticket #1141; ADR-020, ADR-006). A refund
// is a row that is written before the provider hears of it, and its status is the last of its
// append-only status lines, as a payment's is. A reversal (*terugboeking*, the provider's
// chargeback) is a row of its own. Neither edits the payment row. Amounts are integers in euro
// cents. The rules (the refundable amount, asking once, the lookup before a retry, the status
// order) are in `packages/domain/src/payments`; the tables repeat the ones they can.

/** Where a refund stands (`packages/domain` `REFUND_STATUSES`). `requested` is before the provider has seen it. */
export const refundStatus = pgEnum('payment_refund_status', [
  'requested',
  'queued',
  'pending',
  'refunded',
  'failed',
  'canceled',
]);

/** The longest internal reason (`REFUND_REASON_MAX_LENGTH` in the domain). */
export const REFUND_REASON_MAX_LENGTH = 500;

/**
 * A refund of a payment, asked for by a team member (the Owner).
 *
 * - The row is inserted before the provider is called; its `id` goes to the provider as the
 *   idempotency key and in the metadata. `provider_refund_id` stays empty until the provider's
 *   refund is linked (and is unique across the table: the webhook finds the refund by it).
 * - `reason` is internal, for the Owner only, and never leaves the database for the provider.
 * - `revoke_credits` is the Owner's choice to take back the credits of the payment.
 * - `status` is the current status, the last of the refund's `payment_refund_status_changes`; it
 *   is moved only together with a new line.
 * - `requested_by_team_member_id` is empty once that person has left the team.
 *
 * `unique (organization_id, id, client_id)` lets the status lines point at the refund and repeat
 * its client, so a client's policy covers them too.
 */
export const paymentRefunds = businessTable(
  'payment_refunds',
  {
    paymentId: uuid('payment_id').notNull(),
    clientId: uuid('client_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason'),
    revokeCredits: boolean('revoke_credits').notNull().default(false),
    providerRefundId: text('provider_refund_id'),
    requestedByTeamMemberId: uuid('requested_by_team_member_id'),
    status: refundStatus('status').notNull().default('requested'),
    ...timestamps(),
  },
  (table) => [
    unique('payment_refunds_organization_id_id_client_id_unique').on(
      table.organizationId,
      table.id,
      table.clientId,
    ),
    uniqueIndex('payment_refunds_provider_refund_id_unique').on(table.providerRefundId),
    // The refunds of a payment, oldest first (the refundable amount, the payment's detail).
    index('payment_refunds_organization_id_payment_id_idx').on(
      table.organizationId,
      table.paymentId,
      table.createdAt,
    ),
    foreignKey({
      name: 'payment_refunds_payment_fk',
      columns: [table.organizationId, table.paymentId, table.clientId],
      foreignColumns: [payments.organizationId, payments.id, payments.clientId],
    }),
    foreignKey({
      name: 'payment_refunds_requested_by_fk',
      columns: [table.organizationId, table.requestedByTeamMemberId],
      foreignColumns: [teamMembers.organizationId, teamMembers.id],
    }),
    check('payment_refunds_amount_cents_positive', sql`${table.amountCents} >= 1`),
    check(
      'payment_refunds_reason_valid',
      sql`${table.reason} IS NULL OR (btrim(${table.reason}) <> '' AND char_length(${table.reason}) <= ${sql.raw(String(REFUND_REASON_MAX_LENGTH))})`,
    ),
    check(
      'payment_refunds_provider_refund_id_valid',
      sql`${table.providerRefundId} IS NULL OR btrim(${table.providerRefundId}) <> ''`,
    ),
  ],
  { clientColumn: 'clientId' },
);

export type PaymentRefund = typeof paymentRefunds.$inferSelect;

/**
 * The status lines of a refund: append-only (a trigger refuses every update and delete, for
 * every role). A refund gets one line per status it has been in, and never two for the same
 * status, so applying a status twice, or out of order, cannot write a second line (AC13). The
 * first line is `null → requested`. `occurred_at` is when the status was fetched; `created_at` is
 * when the line was written. `updated_at` exists for the table conventions and never changes.
 */
export const paymentRefundStatusChanges = businessTable(
  'payment_refund_status_changes',
  {
    refundId: uuid('refund_id').notNull(),
    clientId: uuid('client_id').notNull(),
    fromStatus: refundStatus('from_status'),
    toStatus: refundStatus('to_status').notNull(),
    occurredAt: instant('occurred_at').notNull(),
    source: paymentStatusSource('source').notNull(),
    providerEventId: text('provider_event_id'),
    ...timestamps(),
  },
  (table) => [
    unique('payment_refund_status_changes_refund_id_to_status_unique').on(
      table.refundId,
      table.toStatus,
    ),
    index('payment_refund_status_changes_organization_id_refund_id_idx').on(
      table.organizationId,
      table.refundId,
      table.occurredAt,
    ),
    foreignKey({
      name: 'payment_refund_status_changes_refund_fk',
      columns: [table.organizationId, table.refundId, table.clientId],
      foreignColumns: [paymentRefunds.organizationId, paymentRefunds.id, paymentRefunds.clientId],
    }),
    check(
      'payment_refund_status_changes_from_differs',
      sql`${table.fromStatus} IS NULL OR ${table.fromStatus} <> ${table.toStatus}`,
    ),
  ],
  { clientColumn: 'clientId' },
);

export type PaymentRefundStatusChange = typeof paymentRefundStatusChanges.$inferSelect;

/**
 * A reversal (*terugboeking*) of a payment: the client's bank took a debit back (Mollie: a
 * chargeback). `provider_chargeback_id` is unique, so a reversal the provider reports twice is
 * stored once. `bank_reason` is the bank's, as the provider reports it. The payment row is not
 * edited when a reversal is stored.
 */
export const paymentChargebacks = businessTable(
  'payment_chargebacks',
  {
    paymentId: uuid('payment_id').notNull(),
    clientId: uuid('client_id').notNull(),
    providerChargebackId: text('provider_chargeback_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    bankReason: text('bank_reason'),
    receivedAt: instant('received_at').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('payment_chargebacks_provider_chargeback_id_unique').on(table.providerChargebackId),
    index('payment_chargebacks_organization_id_payment_id_idx').on(
      table.organizationId,
      table.paymentId,
      table.receivedAt,
    ),
    foreignKey({
      name: 'payment_chargebacks_payment_fk',
      columns: [table.organizationId, table.paymentId, table.clientId],
      foreignColumns: [payments.organizationId, payments.id, payments.clientId],
    }),
    check('payment_chargebacks_amount_cents_positive', sql`${table.amountCents} >= 1`),
    check(
      'payment_chargebacks_provider_chargeback_id_valid',
      sql`btrim(${table.providerChargebackId}) <> ''`,
    ),
    check(
      'payment_chargebacks_bank_reason_valid',
      sql`${table.bankReason} IS NULL OR btrim(${table.bankReason}) <> ''`,
    ),
  ],
  { clientColumn: 'clientId' },
);

export type PaymentChargeback = typeof paymentChargebacks.$inferSelect;
