import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgEnum, text, uuid } from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';
import { trainerProfiles } from './tenancy.ts';

/**
 * The level of a class (F067, spec #587): a fixed list, not free text and not translated user
 * content (the apps show the word from `classLevel.*` in `packages/i18n`). Each of `group_classes`
 * (the class's own), `class_series` and `sessions` (a date) holds one, nullable: `NULL` is *Geen*,
 * the starting value. It is information only: nothing in booking reads it.
 */
export const classLevel = pgEnum('class_level', [
  'all_levels',
  'beginner',
  'intermediate',
  'advanced',
]);

export type ClassLevel = (typeof classLevel.enumValues)[number];

/**
 * A group class of a workspace (F021, spec #427; `PRODUCT.md §76` calls the table
 * `group_templates`, the first ticket named it `group_classes`, after the glossary's *les*): what
 * a class is called (a Dutch name and an optional English one), what it is about, who usually
 * teaches it, how many people fit and how long it lasts (§18). The workspace owns it, not the
 * trainer (§19). It is not a point in time: a class on a date is a `sessions` row of type `group`
 * (`group_class_id`), which copies the trainer, capacity and duration when it is scheduled, so a
 * later change of the class does not change a date already planned (ADR-012: each occurrence has
 * its own).
 *
 * - `name_nl` is required, `name_en` and both descriptions are optional; an empty text is never
 *   stored, it is `NULL`. The texts are user content: shown in the viewer's language, else Dutch
 *   (`pickContentLanguage`, `packages/i18n`), never machine-translated.
 * - `default_trainer_profile_id` is the usual trainer, `NULL` for *Trainer nodig*. Removing the
 *   trainer's profile (the Owner stops training, or the team member is removed) leaves the class
 *   without a usual trainer (`ON DELETE SET NULL (default_trainer_profile_id)`, which only clears
 *   that column; the migration writes the column list, Drizzle cannot).
 * - `capacity` 1 to 100 and `duration_minutes` 15 to 240 in steps of 5; `packages/domain` holds
 *   the same limits (`GROUP_CLASS_LIMITS`), these checks repeat them for what the API never writes.
 * - `level` (F067) is the default level of the class: copied onto each date and series when they are
 *   made, like the capacity; `NULL` is *Geen*.
 * - `archived_at` is unused in M4 (archiving comes once bookings make it matter).
 *
 * The composite foreign key `(organization_id, default_trainer_profile_id)` keeps the trainer
 * inside the class's workspace.
 */
export const groupClasses = businessTable(
  'group_classes',
  {
    nameNl: text('name_nl').notNull(),
    nameEn: text('name_en'),
    descriptionNl: text('description_nl'),
    descriptionEn: text('description_en'),
    defaultTrainerProfileId: uuid('default_trainer_profile_id'),
    capacity: integer('capacity').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    level: classLevel('level'),
    archivedAt: instant('archived_at'),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: 'group_classes_default_trainer_fk',
      columns: [table.organizationId, table.defaultTrainerProfileId],
      foreignColumns: [trainerProfiles.organizationId, trainerProfiles.id],
    }),
    check(
      'group_classes_name_nl_valid',
      sql`btrim(${table.nameNl}) <> '' AND char_length(${table.nameNl}) <= 80`,
    ),
    check(
      'group_classes_name_en_valid',
      sql`${table.nameEn} IS NULL OR (btrim(${table.nameEn}) <> '' AND char_length(${table.nameEn}) <= 80)`,
    ),
    check(
      'group_classes_descriptions_valid',
      sql`(${table.descriptionNl} IS NULL OR (btrim(${table.descriptionNl}) <> '' AND char_length(${table.descriptionNl}) <= 500))
        AND (${table.descriptionEn} IS NULL OR (btrim(${table.descriptionEn}) <> '' AND char_length(${table.descriptionEn}) <= 500))`,
    ),
    check('group_classes_capacity_valid', sql`${table.capacity} BETWEEN 1 AND 100`),
    check(
      'group_classes_duration_valid',
      sql`${table.durationMinutes} BETWEEN 15 AND 240 AND ${table.durationMinutes} % 5 = 0`,
    ),
  ],
);

export type GroupClass = typeof groupClasses.$inferSelect;
