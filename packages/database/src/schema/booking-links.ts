import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';
import { groupClasses } from './group-classes.ts';
import { sessions } from './sessions.ts';
import { teamMembers } from './tenancy.ts';

/**
 * What a booking link opens (F037, spec #473): the whole timetable, the group classes, one class or
 * one class on a date. Open Gym (`open_gym`) is added with F034 to F036.
 */
export const bookingLinkScope = pgEnum('booking_link_scope', ['all', 'group', 'class', 'session']);

/** The page language of a link: the visitor's own, or always Dutch or English (ADR-017). */
export const bookingLinkLanguage = pgEnum('booking_link_language', ['visitor', 'nl', 'en']);

/**
 * A booking link of a workspace (F037, spec #473; `PRODUCT.md §32`): the short link
 * `{app address}/l/{code}` the Owner shares in a message, on a poster or behind a QR code (F038). It
 * opens the client timetable on its scope, for approved clients only (ADR-026).
 *
 * - `code` is unique across Fivvi: 8 characters of lower-case Crockford's base32 made by
 *   `new_booking_link_code()` (migration `0029`, Postgres's CSPRNG). It is the column's default, so
 *   a code is made in one place.
 * - `scope` says what it opens. A `class` link names its class (`group_class_id`), a `session`
 *   link one class date (`session_id`, a group session); `all` and `group` name nothing (a check).
 *   The target never changes after the link is made (QE07): there is no update of scope, target or
 *   language, only `deactivated_at`. A class date that is cancelled later keeps its link.
 * - `language` is the page language: `visitor` follows the visitor, `nl` and `en` fix it.
 * - `deactivated_at` is when the Owner stopped the link; it never comes back. At most one *active*
 *   link exists per workspace, scope, target and language (a partial unique index), so making the
 *   same link again returns the existing one.
 * - `created_by_team_member_id` is who made it, `NULL` for the standing links (made by the system)
 *   and once that team member is removed (`ON DELETE SET NULL (created_by_team_member_id)`, the
 *   column list the migration writes by hand, as for `sessions`).
 *
 * Composite foreign keys keep the class, the date and the maker inside the link's workspace.
 */
export const bookingLinks = businessTable(
  'booking_links',
  {
    code: text('code').notNull().default(sql`new_booking_link_code()`),
    scope: bookingLinkScope('scope').notNull(),
    groupClassId: uuid('group_class_id'),
    sessionId: uuid('session_id'),
    language: bookingLinkLanguage('language').notNull(),
    createdByTeamMemberId: uuid('created_by_team_member_id'),
    deactivatedAt: instant('deactivated_at'),
    ...timestamps(),
  },
  (table) => [
    unique('booking_links_code_unique').on(table.code),
    // At most one active link per workspace, scope, target and language. The target is the class or
    // the date, whichever the scope names, and a fixed value for the scopes with none, so two
    // links without a target count as the same target.
    uniqueIndex('booking_links_active_unique')
      .on(
        table.organizationId,
        table.scope,
        table.language,
        sql`coalesce(${table.groupClassId}, ${table.sessionId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${table.deactivatedAt} IS NULL`),
    // The links of one class or one date (the list labels them; a class date's link is looked up).
    index('booking_links_organization_id_group_class_id_idx').on(
      table.organizationId,
      table.groupClassId,
    ),
    index('booking_links_organization_id_session_id_idx').on(table.organizationId, table.sessionId),
    foreignKey({
      name: 'booking_links_group_class_fk',
      columns: [table.organizationId, table.groupClassId],
      foreignColumns: [groupClasses.organizationId, groupClasses.id],
    }),
    foreignKey({
      name: 'booking_links_session_fk',
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.id],
    }),
    foreignKey({
      name: 'booking_links_created_by_fk',
      columns: [table.organizationId, table.createdByTeamMemberId],
      foreignColumns: [teamMembers.organizationId, teamMembers.id],
    }),
    check('booking_links_code_format', sql`${table.code} ~ '^[0-9a-hjkmnp-tv-z]{8}$'`),
    check(
      'booking_links_target_matches_scope',
      sql`(${table.scope} = 'class' AND ${table.groupClassId} IS NOT NULL AND ${table.sessionId} IS NULL)
        OR (${table.scope} = 'session' AND ${table.sessionId} IS NOT NULL AND ${table.groupClassId} IS NULL)
        OR (${table.scope} IN ('all', 'group') AND ${table.groupClassId} IS NULL AND ${table.sessionId} IS NULL)`,
    ),
  ],
);

export type BookingLink = typeof bookingLinks.$inferSelect;
