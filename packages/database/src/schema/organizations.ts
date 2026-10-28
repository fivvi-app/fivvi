import type { Locale } from '@fivvi/i18n';
import { sql } from 'drizzle-orm';
import { check, pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.ts';
import { workspacePolicy } from './tenant-policies.ts';

/**
 * A workspace: a gym or an independent trainer's business, the root of tenant isolation
 * (ADR-006, `GLOSSARY.md`). Every business table points at it with `organization_id`.
 *
 * It is filtered on `id` instead of `organization_id`, so it is not made with `businessTable`.
 * Forced RLS is in a migration, as for every table. Legal details for invoices come with F059.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    /** The trading name shown in the product (F002). The workspace's own words, as typed. */
    name: text('name').notNull(),
    /**
     * The URL name (`/w/{slug}`, booking pages, QR codes): made from the name when the workspace
     * is created and never changed by a rename, so links and QR codes keep working. Unique
     * across workspaces.
     */
    slug: text('slug').notNull().unique(),
    /** The workspace default communication language (`PRODUCT.md §3`); never decides the interface language (ADR-017). */
    defaultLocale: text('default_locale').$type<Locale>().notNull(),
    /** An IANA time zone name: the zone the workspace's dates and times are shown in (ADR-012). */
    timeZone: text('time_zone').notNull(),
    ...timestamps(),
  },
  (table) => [
    check('organizations_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('organizations_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check('organizations_default_locale_supported', sql`${table.defaultLocale} IN ('nl-NL', 'en')`),
    workspacePolicy('organizations', table.id),
  ],
);

export type Organization = typeof organizations.$inferSelect;
