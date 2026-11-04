import { sql } from 'drizzle-orm';
import { boolean, check, pgEnum, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { timestamps } from './columns.ts';

/**
 * The kinds of location (`PRODUCT.md §12`). All six exist now so that the types of M7 are
 * additive; only `organization_location` is written in M3.
 */
export const locationType = pgEnum('location_type', [
  'organization_location',
  'external_gym',
  'client_home',
  'outdoor',
  'online',
  'other',
]);

/**
 * Where sessions take place (F015, spec #424). At go-live each workspace has exactly one, its
 * default, made with the workspace (and by a data migration for workspaces that existed). The
 * address is Dutch, optional and all or nothing; the postcode is stored as `1234 AB`. The rules
 * that normalise and validate it are in `packages/domain`; these checks repeat the shape so the
 * database refuses what the API never writes.
 *
 * `is_default` is true for at most one location per workspace (a partial unique index). M7 adds
 * more locations without a migration of this table or of the sessions that point at it.
 */
export const locations = businessTable(
  'locations',
  {
    name: text('name').notNull(),
    type: locationType('type').notNull(),
    postcode: text('postcode'),
    houseNumber: text('house_number'),
    houseNumberAddition: text('house_number_addition'),
    street: text('street'),
    city: text('city'),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('locations_organization_id_default_unique')
      .on(table.organizationId)
      .where(sql`${table.isDefault}`),
    check(
      'locations_name_valid',
      sql`btrim(${table.name}) <> '' AND char_length(${table.name}) <= 120`,
    ),
    check(
      'locations_postcode_format',
      sql`${table.postcode} IS NULL OR ${table.postcode} ~ '^[1-9][0-9]{3} [A-Z]{2}$'`,
    ),
    check(
      'locations_house_number_format',
      sql`${table.houseNumber} IS NULL OR ${table.houseNumber} ~ '^[0-9]{1,5}$'`,
    ),
    // All or nothing: the postcode, house number, street and city come together, and the addition
    // never stands alone.
    check(
      'locations_address_all_or_nothing',
      sql`(${table.postcode} IS NULL AND ${table.houseNumber} IS NULL AND ${table.street} IS NULL AND ${table.city} IS NULL AND ${table.houseNumberAddition} IS NULL)
        OR (${table.postcode} IS NOT NULL AND ${table.houseNumber} IS NOT NULL AND ${table.street} IS NOT NULL AND ${table.city} IS NOT NULL)`,
    ),
    check(
      'locations_address_text_valid',
      sql`(${table.street} IS NULL OR (btrim(${table.street}) <> '' AND char_length(${table.street}) <= 120))
        AND (${table.city} IS NULL OR (btrim(${table.city}) <> '' AND char_length(${table.city}) <= 120))
        AND (${table.houseNumberAddition} IS NULL OR (btrim(${table.houseNumberAddition}) <> '' AND char_length(${table.houseNumberAddition}) <= 10))`,
    ),
  ],
);

export type Location = typeof locations.$inferSelect;
