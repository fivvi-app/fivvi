import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  type PgTableExtraConfigValue,
  pgEnum,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { timestamps } from './columns.ts';

// Offers (F052, spec #468, ticket #784; `PRODUCT.md §90` to §95): what a workspace sells and on
// which terms. An offer is the thing the owner switches on and off; its terms live in immutable
// versions, so an agreement (F057) that points at a version keeps the price, the VAT rate and the
// cancellation rule it started with, whatever the owner changes later (QC15). Money is integers:
// the price in euro cents including VAT, the VAT rate in basis points (2100 is 21 %). The rules
// (what a valid offer of each kind is) are in `packages/domain/src/commerce/offers.ts`; the tables
// repeat the ones they can, for what the API never writes.

/** The four kinds of offer (`OFFER_KINDS` in the domain). There is no fifth. */
export const offerKind = pgEnum('offer_kind', [
  'membership',
  'credit_pack',
  'credit_plan',
  'single_class_pass',
]);

/**
 * What a credit offer grants (`CREDIT_KINDS` in the domain): one kind, never both. Open Gym
 * credits come back with Open Gym (F034 to F036, owner 6 November 2026).
 */
export const offerCreditKind = pgEnum('offer_credit_kind', ['group', 'private']);

/** `off` is not for sale, `on` is, `archived` is a deleted offer whose agreements still run. */
export const offerStatus = pgEnum('offer_status', ['off', 'on', 'archived']);

/** Where an offer came from: Fivvi's default plans (copied into the workspace) or the owner. */
export const offerOrigin = pgEnum('offer_origin', ['default', 'owner']);

/** How often a recurring offer is billed (`BILLING_CYCLES` in the domain). */
export const offerBillingCycle = pgEnum('offer_billing_cycle', ['month', 'four_weeks']);

/** What happens when a term ends (`END_OF_TERMS` in the domain). */
export const offerEndOfTerm = pgEnum('offer_end_of_term', ['stop', 'continue']);

/** The unit of a credit pack's validity (`VALIDITY_UNITS` in the domain). */
export const offerValidityUnit = pgEnum('offer_validity_unit', ['day', 'week', 'month']);

/**
 * An offer of a workspace.
 *
 * - `kind` is one of the four; a credit pack or credit plan has exactly one `credit_kind` (group or
 *   private), any other kind has none. The check below refuses the other combinations.
 * - `status` starts `off`: a default plan has no price, and nothing is for sale before the owner
 *   decides. Switching on, and what it needs (a price, ready payments), is the route's rule.
 * - `origin` is `default` for a copy of Fivvi's default plans and then `default_plan` names which
 *   one (`membership`, `group_credit_pack`, `private_credit_plan`); an owner-made offer has no
 *   `default_plan`. At most one offer per default plan and workspace, so the backfill of the
 *   existing workspaces can run twice and create nothing more. A later change of the template in
 *   the domain never reaches an offer a workspace already has: each workspace has its own copy.
 * - `current_version_id` is the version a new agreement starts on. It is never empty: the foreign
 *   key is deferred, so the offer and its first version are written in one transaction (in either
 *   order), and a change is a new version that becomes the current one in that transaction. The
 *   key includes `id`, so the current version always belongs to this offer.
 */
export const offers = businessTable(
  'offers',
  {
    kind: offerKind('kind').notNull(),
    creditKind: offerCreditKind('credit_kind'),
    status: offerStatus('status').notNull().default('off'),
    origin: offerOrigin('origin').notNull(),
    defaultPlan: text('default_plan'),
    currentVersionId: uuid('current_version_id').notNull(),
    ...timestamps(),
  },
  // The explicit return type breaks the loop of types: an offer and its versions point at each other.
  (table): PgTableExtraConfigValue[] => [
    unique('offers_organization_id_default_plan_unique').on(
      table.organizationId,
      table.defaultPlan,
    ),
    foreignKey({
      name: 'offers_current_version_fk',
      columns: [table.organizationId, table.currentVersionId, table.id],
      foreignColumns: [offerVersions.organizationId, offerVersions.id, offerVersions.offerId],
    }),
    check(
      'offers_credit_kind_valid',
      sql`(${table.kind} IN ('credit_pack', 'credit_plan')) = (${table.creditKind} IS NOT NULL)`,
    ),
    check(
      'offers_default_plan_valid',
      sql`(${table.origin} = 'default') = (${table.defaultPlan} IS NOT NULL)
        AND (${table.defaultPlan} IS NULL OR btrim(${table.defaultPlan}) <> '')`,
    ),
  ],
);

export type Offer = typeof offers.$inferSelect;

/** What an offer version covers: every group class (`null`), or the group classes of this list. */
export type CoveredClassIds = string[] | null;

/**
 * A version of an offer: the terms an agreement starts on. **Immutable**: a trigger refuses every
 * update and delete, for every role (the migration writes it; Drizzle cannot). A change of an
 * offer is a new row with the next `version` that becomes the offer's `current_version_id`.
 * `updated_at` exists for the table conventions and never changes.
 *
 * - Names and descriptions are user content in Dutch, with an optional English one (shown in the
 *   viewer's language, else Dutch, never machine-translated); an empty text is `NULL`.
 * - `price_cents` is the price **including VAT** in whole euro cents, 1 to 1 000 000, empty until
 *   the owner sets it (a default plan). `vat_rate_basis_points` is 2100 or 900, empty until chosen
 *   or in a workspace that charges no VAT (F059); never 0. No floating-point amount is stored.
 * - The terms of the kind are nullable columns: a membership uses `classes_per_week`,
 *   `term_months`, `billing_cycle`, `end_of_term` and `makeups_per_month`; a credit pack `credits`
 *   and the validity (`validity_amount` with `validity_unit`, both or neither); a credit plan
 *   `credits`, `billing_cycle`, `minimum_term_months`, `end_of_term` and `carry_over_limit`.
 *   `cutoff_minutes` (a whole number of hours) is on every version; `returns_per_month` empty
 *   means credits always come back on a timely cancellation. `renewal_window_days` (*Verlengen en
 *   herinneren*) is per offer, 30 by default, and empty on a single class pass.
 * - `covered_class_ids` lists the group classes (`group_classes.id`) the offer is limited to,
 *   `NULL` for all group classes. An array has no foreign key, and the version stays unchanged when
 *   a class goes: the routes check that the classes belong to the workspace when they write it.
 * - `unique (organization_id, id, offer_id)` lets the offer point at its current version.
 */
export const offerVersions = businessTable(
  'offer_versions',
  {
    offerId: uuid('offer_id').notNull(),
    version: integer('version').notNull(),
    nameNl: text('name_nl').notNull(),
    nameEn: text('name_en'),
    descriptionNl: text('description_nl'),
    descriptionEn: text('description_en'),
    priceCents: integer('price_cents'),
    vatRateBasisPoints: integer('vat_rate_basis_points'),
    billingCycle: offerBillingCycle('billing_cycle'),
    termMonths: integer('term_months'),
    minimumTermMonths: integer('minimum_term_months'),
    endOfTerm: offerEndOfTerm('end_of_term'),
    classesPerWeek: integer('classes_per_week'),
    credits: integer('credits'),
    validityAmount: integer('validity_amount'),
    validityUnit: offerValidityUnit('validity_unit'),
    carryOverLimit: integer('carry_over_limit'),
    oncePerClient: boolean('once_per_client').notNull().default(false),
    membersOnly: boolean('members_only').notNull().default(false),
    cutoffMinutes: integer('cutoff_minutes').notNull(),
    makeupsPerMonth: integer('makeups_per_month'),
    returnsPerMonth: integer('returns_per_month'),
    coveredClassIds: uuid('covered_class_ids').array().$type<CoveredClassIds>(),
    renewalWindowDays: integer('renewal_window_days'),
    ...timestamps(),
  },
  (table): PgTableExtraConfigValue[] => [
    unique('offer_versions_organization_id_id_offer_id_unique').on(
      table.organizationId,
      table.id,
      table.offerId,
    ),
    unique('offer_versions_organization_id_offer_id_version_unique').on(
      table.organizationId,
      table.offerId,
      table.version,
    ),
    foreignKey({
      name: 'offer_versions_offer_fk',
      columns: [table.organizationId, table.offerId],
      foreignColumns: [offers.organizationId, offers.id],
    }),
    check('offer_versions_version_valid', sql`${table.version} >= 1`),
    check(
      'offer_versions_name_nl_valid',
      sql`btrim(${table.nameNl}) <> '' AND char_length(${table.nameNl}) <= 80`,
    ),
    check(
      'offer_versions_name_en_valid',
      sql`${table.nameEn} IS NULL OR (btrim(${table.nameEn}) <> '' AND char_length(${table.nameEn}) <= 80)`,
    ),
    check(
      'offer_versions_descriptions_valid',
      sql`(${table.descriptionNl} IS NULL OR (btrim(${table.descriptionNl}) <> '' AND char_length(${table.descriptionNl}) <= 500))
        AND (${table.descriptionEn} IS NULL OR (btrim(${table.descriptionEn}) <> '' AND char_length(${table.descriptionEn}) <= 500))`,
    ),
    check(
      'offer_versions_price_valid',
      sql`${table.priceCents} IS NULL OR ${table.priceCents} BETWEEN 1 AND 1000000`,
    ),
    check(
      'offer_versions_vat_rate_valid',
      sql`${table.vatRateBasisPoints} IS NULL OR ${table.vatRateBasisPoints} IN (2100, 900)`,
    ),
    check(
      'offer_versions_terms_valid',
      sql`(${table.termMonths} IS NULL OR ${table.termMonths} BETWEEN 1 AND 24)
        AND (${table.minimumTermMonths} IS NULL OR ${table.minimumTermMonths} BETWEEN 0 AND 12)
        AND (${table.classesPerWeek} IS NULL OR ${table.classesPerWeek} BETWEEN 1 AND 7)
        AND (${table.credits} IS NULL OR ${table.credits} BETWEEN 1 AND 200)
        AND (${table.carryOverLimit} IS NULL OR ${table.carryOverLimit} BETWEEN 0 AND 50)
        AND (${table.makeupsPerMonth} IS NULL OR ${table.makeupsPerMonth} BETWEEN 0 AND 10)
        AND (${table.returnsPerMonth} IS NULL OR ${table.returnsPerMonth} >= 0)
        AND (${table.renewalWindowDays} IS NULL OR ${table.renewalWindowDays} BETWEEN 0 AND 365)`,
    ),
    check(
      'offer_versions_validity_valid',
      sql`(${table.validityAmount} IS NULL) = (${table.validityUnit} IS NULL)
        AND (${table.validityAmount} IS NULL OR ${table.validityAmount} >= 1)`,
    ),
    check(
      'offer_versions_cutoff_valid',
      sql`${table.cutoffMinutes} BETWEEN 0 AND 4320 AND ${table.cutoffMinutes} % 60 = 0`,
    ),
    check(
      'offer_versions_covered_class_ids_valid',
      sql`${table.coveredClassIds} IS NULL OR cardinality(${table.coveredClassIds}) >= 1`,
    ),
  ],
);

export type OfferVersion = typeof offerVersions.$inferSelect;
