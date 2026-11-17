import type { Locale, TrainerWord } from '@fivvi/i18n';
import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { id, instant, timestamps } from './columns.ts';
import { workspacePolicy } from './tenant-policies.ts';

/**
 * The choices for the workspace's word for its trainers (F068, spec #588). They are written here
 * and not read from `@fivvi/i18n`: the runtime image's ops stage ships this package without
 * `@fivvi/i18n`, and the release step and the cron job load this schema. `ops-image.test.ts`
 * checks the list against `TRAINER_WORDS` of `@fivvi/i18n` (the type below fails to compile when
 * a word is missing from `TrainerWord`).
 */
const TRAINER_WORD_VALUES = [
  'trainer',
  'instructeur',
  'docent',
  'coach',
] as const satisfies readonly TrainerWord[];

/** What every workspace starts with: creating one doesn't ask. */
const DEFAULT_TRAINER_WORD: TrainerWord = 'trainer';

/**
 * The workspace's word for its trainers: a label only, the role stays `trainer`. A fifth word is
 * an additive `ALTER TYPE trainer_word ADD VALUE`, a new entry here and in `TRAINER_WORDS`.
 */
export const trainerWord = pgEnum('trainer_word', TRAINER_WORD_VALUES);

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
    /**
     * The code of the join link `/j/{code}` (F029): 8 characters of Crockford's base32, unique,
     * made by `new_join_code()` (migration `0026`, from Postgres's CSPRNG) when the workspace is
     * created and again when the Owner renews the link. The old code names no workspace once it
     * is replaced.
     */
    joinCode: text('join_code').notNull().unique().default(sql`new_join_code()`),
    /** When the Owner last renewed the join link; empty until the first renewal. */
    joinLinkRenewedAt: instant('join_link_renewed_at'),
    /**
     * The word the product uses for the people who teach in this workspace (F068): `trainer`,
     * `instructeur`, `docent` or `coach`. Every workspace starts on `trainer` (creating one doesn't
     * ask) and the Owner changes it in the settings; the role stays Trainer in code and rights.
     */
    trainerWord: trainerWord('trainer_word').notNull().default(DEFAULT_TRAINER_WORD),
    ...timestamps(),
  },
  (table) => [
    check('organizations_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('organizations_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check('organizations_join_code_format', sql`${table.joinCode} ~ '^[0-9A-HJKMNP-TV-Z]{8}$'`),
    check('organizations_default_locale_supported', sql`${table.defaultLocale} IN ('nl-NL', 'en')`),
    workspacePolicy('organizations', table.id),
  ],
);

export type Organization = typeof organizations.$inferSelect;
