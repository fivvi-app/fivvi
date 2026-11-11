import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';
import { clients } from './tenancy.ts';

// The payment ledger (E019, spec #466, ticket #727; ADR-020, ADR-006). "Money is a ledger, not a
// field" (`ROADMAP.md` M11): a payment is a row that is created before the provider hears of it,
// and its status is the last of its append-only status lines. Amounts are integers in euro
// cents, everywhere. The rules (the status order, creating once, the retry) are in
// `packages/domain/src/payments`; the tables repeat the ones they can. Mandates, refunds,
// chargebacks and settlements are stored by the specs that own them (F057, F060, F061).

/** How a payment relates to a mandate: `first` creates it, `recurring` uses it, `oneoff` has none. */
export const paymentKind = pgEnum('payment_kind', ['first', 'recurring', 'oneoff']);

/** What a payment is for; the feature that creates it fills `purpose_reference_id` to match. */
export const paymentPurpose = pgEnum('payment_purpose', [
  'agreement_first',
  'agreement_due',
  'open_amount',
  'single_class_pass',
]);

/**
 * Where a payment stands (`packages/domain` `PAYMENT_STATUSES`). `refunded` and `charged_back`
 * are written once F060 stores refunds and chargebacks; they are here so that needs no change.
 */
export const paymentStatus = pgEnum('payment_status', [
  'open',
  'pending',
  'paid',
  'failed',
  'canceled',
  'expired',
  'refunded',
  'charged_back',
]);

/** Where a status line came from: a webhook, a fetch of the payment, or a job (the first line). */
export const paymentStatusSource = pgEnum('payment_status_source', ['webhook', 'fetch', 'job']);

/** The longest description the provider takes (`PAYMENT_DESCRIPTION_MAX_LENGTH` in the domain). */
export const PAYMENT_DESCRIPTION_MAX_LENGTH = 255;

/**
 * What a payment pays for as it was when it was made, read by the invoice (F059): the offer's
 * name in both languages, the period it covers and the VAT rate in basis points (`null` for a
 * workspace without VAT). Never sent to the provider.
 */
export interface PaymentSuppliedSnapshot {
  nameNl: string;
  nameEn: string;
  period: { startsOn: string; endsOn: string } | null;
  vatRateBp: number | null;
}

/**
 * The provider's customer of a client of the workspace (Mollie: `cst_…`), made the first time the
 * client pays. One per client; the provider's ID is unique per workspace. A client sees only
 * their own (the client policy).
 */
export const paymentCustomers = businessTable(
  'payment_customers',
  {
    clientId: uuid('client_id').notNull(),
    providerCustomerId: text('provider_customer_id').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('payment_customers_organization_id_client_id_unique').on(
      table.organizationId,
      table.clientId,
    ),
    unique('payment_customers_organization_id_provider_customer_id_unique').on(
      table.organizationId,
      table.providerCustomerId,
    ),
    foreignKey({
      name: 'payment_customers_client_fk',
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    check(
      'payment_customers_provider_customer_id_valid',
      sql`btrim(${table.providerCustomerId}) <> ''`,
    ),
  ],
  { clientColumn: 'clientId' },
);

/**
 * A payment of a client of the workspace.
 *
 * - The row is inserted before the provider is called; its `id` goes to the provider as the
 *   idempotency key and in the metadata. `provider_payment_id` stays empty until the provider's
 *   payment is linked (and is unique across the table: the webhook finds the payment by it).
 * - `business_key` is the business reason (`agreement:{id}:due:{date}`), unique per workspace: a
 *   second request for it is the same payment.
 * - `amount_cents` is an integer above zero, `currency` is `EUR`.
 * - `supplied` is the snapshot of what it pays for.
 * - `status` is the current status, the last of the payment's `payment_status_changes`; it is
 *   moved only together with a new line (`recordStatusChange`).
 * - `testmode` is true in every environment except production; a forgotten value means test.
 *
 * `unique (organization_id, id, client_id)` lets the status lines point at the payment and
 * repeat its client, so a client's policy covers them too.
 */
export const payments = businessTable(
  'payments',
  {
    clientId: uuid('client_id').notNull(),
    kind: paymentKind('kind').notNull(),
    purpose: paymentPurpose('purpose').notNull(),
    purposeReferenceId: uuid('purpose_reference_id'),
    businessKey: text('business_key').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('EUR'),
    description: text('description').notNull(),
    supplied: jsonb('supplied').$type<PaymentSuppliedSnapshot>().notNull(),
    providerPaymentId: text('provider_payment_id'),
    providerMandateId: text('provider_mandate_id'),
    status: paymentStatus('status').notNull().default('open'),
    testmode: boolean('testmode').notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    unique('payments_organization_id_business_key_unique').on(
      table.organizationId,
      table.businessKey,
    ),
    unique('payments_organization_id_id_client_id_unique').on(
      table.organizationId,
      table.id,
      table.clientId,
    ),
    uniqueIndex('payments_provider_payment_id_unique').on(table.providerPaymentId),
    // A client's payments, newest first (CP-03, the client profile).
    index('payments_organization_id_client_id_created_at_idx').on(
      table.organizationId,
      table.clientId,
      table.createdAt,
    ),
    foreignKey({
      name: 'payments_client_fk',
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    check('payments_amount_cents_positive', sql`${table.amountCents} >= 1`),
    check('payments_currency_eur', sql`${table.currency} = 'EUR'`),
    check('payments_business_key_valid', sql`btrim(${table.businessKey}) <> ''`),
    check(
      'payments_description_valid',
      sql`btrim(${table.description}) <> '' AND char_length(${table.description}) <= ${sql.raw(String(PAYMENT_DESCRIPTION_MAX_LENGTH))}`,
    ),
  ],
  { clientColumn: 'clientId' },
);

export type Payment = typeof payments.$inferSelect;

/**
 * The status lines of a payment: append-only (a trigger refuses every update and delete, for
 * every role). A payment gets one line per status it has been in, and never two for the same
 * status, so applying a status twice, or out of order, cannot write a second line (AC7). The
 * first line is `null → open`. `occurred_at` is when the status was fetched; `created_at` is when
 * the line was written. `updated_at` exists for the table conventions and never changes.
 */
export const paymentStatusChanges = businessTable(
  'payment_status_changes',
  {
    paymentId: uuid('payment_id').notNull(),
    clientId: uuid('client_id').notNull(),
    fromStatus: paymentStatus('from_status'),
    toStatus: paymentStatus('to_status').notNull(),
    occurredAt: instant('occurred_at').notNull(),
    source: paymentStatusSource('source').notNull(),
    providerEventId: text('provider_event_id'),
    ...timestamps(),
  },
  (table) => [
    unique('payment_status_changes_payment_id_to_status_unique').on(
      table.paymentId,
      table.toStatus,
    ),
    index('payment_status_changes_organization_id_payment_id_idx').on(
      table.organizationId,
      table.paymentId,
      table.occurredAt,
    ),
    foreignKey({
      name: 'payment_status_changes_payment_fk',
      columns: [table.organizationId, table.paymentId, table.clientId],
      foreignColumns: [payments.organizationId, payments.id, payments.clientId],
    }),
    check(
      'payment_status_changes_from_differs',
      sql`${table.fromStatus} IS NULL OR ${table.fromStatus} <> ${table.toStatus}`,
    ),
  ],
  { clientColumn: 'clientId' },
);

export type PaymentStatusChange = typeof paymentStatusChanges.$inferSelect;
