import { sql } from 'drizzle-orm';
import { check, pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.ts';

/**
 * Non-business system data read by the M1 "hello" slice. A row stores the i18n key of
 * the greeting, never the copy itself: clients translate the key from `packages/i18n`.
 * Not tenant data, so it has no `organization_id`.
 */
export const systemGreetings = pgTable(
  'system_greetings',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    i18nKey: text('i18n_key').notNull(),
    ...timestamps(),
  },
  (table) => [
    check('system_greetings_slug_format', sql`${table.slug} ~ '^[a-z][a-z0-9-]*$'`),
    // A dotted key without spaces, so copy can't be stored here by mistake. Provisional
    // until E005 fixes the key naming scheme.
    check(
      'system_greetings_i18n_key_format',
      sql`${table.i18nKey} ~ '^[a-z][A-Za-z0-9_-]*(\\.[A-Za-z0-9_-]+)+$'`,
    ),
  ],
);

export type SystemGreeting = typeof systemGreetings.$inferSelect;
