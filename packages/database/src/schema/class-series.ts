import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, text, time, uuid } from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { timestamps } from './columns.ts';
import { groupClasses } from './group-classes.ts';
import { trainerProfiles } from './tenancy.ts';

/**
 * A weekly series of a class (F022, spec #428, ADR-012): "Kracht, every Tuesday 18:00 with Sarah".
 * It holds the rule in wall-clock time and the defaults every date of the series copies; the dates
 * themselves are ordinary `sessions` rows (`series_id`, `occurrence_date`), each with its own
 * trainer, capacity, status, bookings and attendance, so a substitution or a cancelled date is the
 * normal case. The rule is expanded by `expandSeries` in `packages/domain` and nowhere else.
 *
 * - `rrule` is `FREQ=WEEKLY;BYDAY=XX` (one weekday, M4); `local_start_time` is the wall-clock
 *   start and `time_zone` the zone it is read in (the workspace's), so 18:00 stays 18:00 across
 *   the clocks changing. Instants live in the dates, never here.
 * - `starts_on` and `ends_on` are local dates: the series has dates from `starts_on` to `ends_on`
 *   (empty: until it is stopped). Changing a series from a date on ends it the week before and
 *   starts a new one there (`applyThisAndFollowing`), which is why a class can have several.
 * - `materialized_until` is the last local day the calendar was filled to; the daily task (E012)
 *   fills series whose day is less than 12 weeks away.
 * - `trainer_profile_id` is the usual trainer of the series' dates, empty for *Trainer nodig*;
 *   removing the trainer's profile clears it (`ON DELETE SET NULL (trainer_profile_id)`, written
 *   in the migration by hand, as for `sessions`).
 * - `version` is raised by every change of the series.
 */
export const classSeries = businessTable(
  'class_series',
  {
    groupClassId: uuid('group_class_id').notNull(),
    rrule: text('rrule').notNull(),
    localStartTime: time('local_start_time').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    timeZone: text('time_zone').notNull(),
    trainerProfileId: uuid('trainer_profile_id'),
    capacity: integer('capacity').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    materializedUntil: date('materialized_until', { mode: 'string' }).notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    // The series of one class (the class page) and the daily task's pick of those to extend.
    index('class_series_organization_id_group_class_id_idx').on(
      table.organizationId,
      table.groupClassId,
    ),
    index('class_series_materialized_until_idx').on(table.materializedUntil),
    foreignKey({
      name: 'class_series_group_class_fk',
      columns: [table.organizationId, table.groupClassId],
      foreignColumns: [groupClasses.organizationId, groupClasses.id],
    }),
    foreignKey({
      name: 'class_series_trainer_profile_fk',
      columns: [table.organizationId, table.trainerProfileId],
      foreignColumns: [trainerProfiles.organizationId, trainerProfiles.id],
    }),
    check(
      'class_series_rrule_weekly',
      sql`${table.rrule} ~ '^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$'`,
    ),
    check('class_series_capacity_valid', sql`${table.capacity} BETWEEN 1 AND 100`),
    check(
      'class_series_duration_valid',
      sql`${table.durationMinutes} BETWEEN 15 AND 240 AND ${table.durationMinutes} % 5 = 0`,
    ),
    check(
      'class_series_ends_after_starts',
      sql`${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`,
    ),
    check('class_series_version_positive', sql`${table.version} >= 1`),
  ],
);

export type ClassSeries = typeof classSeries.$inferSelect;
