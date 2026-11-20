import { sql } from 'drizzle-orm';
import { boolean, check, type PgColumn, text, unique } from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { timestamps } from './columns.ts';

// The invoice details of a workspace (F059, spec #474, ticket #852): the seller's details on every
// invoice. Editable; a change reaches only the invoices issued after it, because an invoice freezes
// a snapshot of them when it is issued (later tickets). The client's side is `billing-details.ts`.
// The rules (the KvK and VAT number formats, what is required) are in
// `packages/domain/src/commerce/invoice-details.ts`; the table repeats the ones it can, for what
// the API never writes.

/** SQL for a text column that is not blank and at most `max` characters. */
function textValid(column: PgColumn, max: number) {
  return sql`char_length(${column}) <= ${sql.raw(String(max))} AND btrim(${column}) <> ''`;
}

/**
 * The invoice details of a workspace, one row per workspace, written by the Owner from CM-11
 * (`PUT .../settings/invoice-details`). The row exists only once complete details were saved: the
 * API refuses incomplete ones, and these checks hold the same line, so the *existence* of the row
 * is "the invoice details are complete" (F052's switch-on rule and the invoice issuer ask the
 * domain, which reads this row).
 *
 * - `question_email` is empty when the Owner left it empty: the Owner's own address is used then.
 * - `no_vat` is *Ik reken geen btw* (owner, 7 November 2026): off by default, and for a workspace
 *   without a row it is off as well.
 */
export const workspaceInvoiceDetails = businessTable(
  'workspace_invoice_details',
  {
    legalName: text('legal_name').notNull(),
    street: text('street').notNull(),
    houseNumber: text('house_number').notNull(),
    houseNumberAddition: text('house_number_addition'),
    postcode: text('postcode').notNull(),
    city: text('city').notNull(),
    kvkNumber: text('kvk_number').notNull(),
    vatNumber: text('vat_number').notNull(),
    questionEmail: text('question_email'),
    noVat: boolean('no_vat').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    unique('workspace_invoice_details_organization_id_unique').on(table.organizationId),
    check('workspace_invoice_details_legal_name_valid', textValid(table.legalName, 120)),
    check(
      'workspace_invoice_details_address_valid',
      sql`${textValid(table.street, 120)} AND ${textValid(table.city, 120)}
        AND (${table.houseNumberAddition} IS NULL OR ${textValid(table.houseNumberAddition, 10)})
        AND ${table.houseNumber} ~ '^[0-9]{1,5}$' AND ${table.postcode} ~ '^[1-9][0-9]{3} [A-Z]{2}$'`,
    ),
    check('workspace_invoice_details_kvk_number_format', sql`${table.kvkNumber} ~ '^[0-9]{8}$'`),
    check(
      'workspace_invoice_details_vat_number_format',
      sql`${table.vatNumber} ~ '^NL[0-9]{9}B[0-9]{2}$'`,
    ),
    check(
      'workspace_invoice_details_question_email_valid',
      sql`${table.questionEmail} IS NULL OR (${table.questionEmail} = lower(${table.questionEmail}) AND char_length(${table.questionEmail}) <= 254 AND ${table.questionEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')`,
    ),
  ],
);

export type WorkspaceInvoiceDetails = typeof workspaceInvoiceDetails.$inferSelect;
