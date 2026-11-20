import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  type PgColumn,
  pgEnum,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { timestamps } from './columns.ts';
import { clients } from './tenancy.ts';

// The billing details of a client (F059, spec #474, ticket #853): *Factuur op naam van een bedrijf*
// with the company name, address and VAT number, per client of a workspace, set by the client in
// their profile (CW-04) or by the Owner on their behalf (TW-02). A change reaches only the invoices
// issued afterwards: an invoice freezes the buyer when it is issued (later tickets). The rules (what
// a company invoice needs, the VAT number format) are in
// `packages/domain/src/commerce/invoice-details.ts`; the table repeats the ones it can.

/** SQL for a text column that is not blank and at most `max` characters. */
function textValid(column: PgColumn, max: number) {
  return sql`char_length(${column}) <= ${sql.raw(String(max))} AND btrim(${column}) <> ''`;
}

/** Who last changed a client's billing details: the client in their own profile, or the team for them. */
export const billingDetailsChangedBy = pgEnum('billing_details_changed_by', ['client', 'team']);

/**
 * The billing details of a client in one workspace (CW-04, TW-02), one row per client, and so
 * separate per workspace (a client in two workspaces has two clients, spec #474 open question 4).
 *
 * - `as_company` is *Factuur op naam van een bedrijf*. With it on the company name and the address
 *   are filled and the VAT number may be; with it off the row holds no company fields (the domain
 *   stores nothing then) and the invoice uses the client's name. The row says that the client, or
 *   a team member, last chose it.
 * - `changed_by` is who made the last change, the client or the team, so the client's profile and
 *   the Owner's can say so (AC12).
 * - The row goes with the client (`ON DELETE CASCADE`): it is not an invoice, and an issued
 *   invoice keeps its own snapshot of the buyer.
 */
export const clientBillingDetails = businessTable(
  'client_billing_details',
  {
    clientId: uuid('client_id').notNull(),
    asCompany: boolean('as_company').notNull().default(false),
    companyName: text('company_name'),
    street: text('street'),
    houseNumber: text('house_number'),
    houseNumberAddition: text('house_number_addition'),
    postcode: text('postcode'),
    city: text('city'),
    vatNumber: text('vat_number'),
    changedBy: billingDetailsChangedBy('changed_by').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('client_billing_details_organization_id_client_id_unique').on(
      table.organizationId,
      table.clientId,
    ),
    foreignKey({
      name: 'client_billing_details_client_fk',
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete('cascade'),
    // A company invoice has its name and address; without one the row holds none of them.
    check(
      'client_billing_details_company_shape',
      sql`(${table.asCompany}
          AND ${table.companyName} IS NOT NULL AND ${table.street} IS NOT NULL
          AND ${table.houseNumber} IS NOT NULL AND ${table.postcode} IS NOT NULL
          AND ${table.city} IS NOT NULL)
        OR (NOT ${table.asCompany}
          AND ${table.companyName} IS NULL AND ${table.street} IS NULL
          AND ${table.houseNumber} IS NULL AND ${table.houseNumberAddition} IS NULL
          AND ${table.postcode} IS NULL AND ${table.city} IS NULL AND ${table.vatNumber} IS NULL)`,
    ),
    check(
      'client_billing_details_text_valid',
      sql`(${table.companyName} IS NULL OR ${textValid(table.companyName, 120)})
        AND (${table.street} IS NULL OR ${textValid(table.street, 120)})
        AND (${table.city} IS NULL OR ${textValid(table.city, 120)})
        AND (${table.houseNumberAddition} IS NULL OR ${textValid(table.houseNumberAddition, 10)})
        AND (${table.houseNumber} IS NULL OR ${table.houseNumber} ~ '^[0-9]{1,5}$')
        AND (${table.postcode} IS NULL OR ${table.postcode} ~ '^[1-9][0-9]{3} [A-Z]{2}$')`,
    ),
    check(
      'client_billing_details_vat_number_format',
      sql`${table.vatNumber} IS NULL OR ${table.vatNumber} ~ '^NL[0-9]{9}B[0-9]{2}$'`,
    ),
  ],
  { clientColumn: 'clientId' },
);

export type ClientBillingDetails = typeof clientBillingDetails.$inferSelect;
