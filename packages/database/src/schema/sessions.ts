import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgEnum, unique, uuid } from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';
import { groupClasses } from './group-classes.ts';
import { locations } from './locations.ts';
import { clients, teamMembers, trainerProfiles } from './tenancy.ts';

/**
 * The kinds of session (`PRODUCT.md §16`): the one scheduling engine. `private` is written in
 * F020 and `group` in F021 (a class on a date); Open Gym (F034) adds rows, not columns.
 */
export const sessionType = pgEnum('session_type', ['private', 'group', 'open_gym']);

/**
 * Whether a session still takes place. A session is never deleted: cancelling (F026) sets
 * `cancelled`, and the row stays for the history and for credits (M11).
 */
export const sessionStatus = pgEnum('session_status', ['scheduled', 'cancelled']);

/** What became of a participant's place (F025 attendance, F026 cancellations); `booked` at the start. */
export const attendanceStatus = pgEnum('attendance_status', [
  'booked',
  'attended',
  'cancelled',
  'no_show',
]);

/**
 * A session of a workspace: the one record that private sessions, group classes and Open Gym all
 * use (F020, spec #425; `ROADMAP.md` M4), so calendars (F013, F014), attendance (F025),
 * cancellations (F026) and the double-booking warning (F023) hang off one table.
 *
 * - `starts_at` and `ends_at` are UTC instants (ADR-012). The wall-clock time the person typed is
 *   not stored: it is turned into the instants by `planPrivateSession` in `packages/domain`, and
 *   shown again in the workspace's time zone.
 * - `capacity` is 1 for a private session. A check keeps the end after the start.
 * - `trainer_profile_id` is nullable (Open Gym has no trainer). Removing the trainer's profile (the
 *   Owner stops training, or the team member is removed) leaves the session with no trainer
 *   (`ON DELETE SET NULL (trainer_profile_id)`, which only clears that column; the migration
 *   writes the column list, Drizzle cannot): history stays and removing a team member is never
 *   blocked by their sessions. Reassigning is the Owner's call (F026 follow-up).
 * - `created_by_team_member_id` is who planned it, cleared the same way when that team member is
 *   removed.
 * - `group_class_id` is the class of a group session (F021: required for `type = group`, a check)
 *   and empty for the other kinds. The date keeps its own trainer, capacity, start and end.
 * - `series_id` is empty here; recurring series (F022) point it at their series without a
 *   migration of existing rows.
 * - `version` starts at 1 and is raised by every change, for optimistic concurrency (reschedule,
 *   AC8 of the spec): the writer says which version it read.
 *
 * Composite foreign keys `(organization_id, <x>_id)` keep the location and the trainer inside the
 * session's workspace.
 */
export const sessions = businessTable(
  'sessions',
  {
    type: sessionType('type').notNull(),
    status: sessionStatus('status').notNull().default('scheduled'),
    trainerProfileId: uuid('trainer_profile_id'),
    locationId: uuid('location_id').notNull(),
    startsAt: instant('starts_at').notNull(),
    endsAt: instant('ends_at').notNull(),
    capacity: integer('capacity').notNull(),
    seriesId: uuid('series_id'),
    groupClassId: uuid('group_class_id'),
    version: integer('version').notNull().default(1),
    createdByTeamMemberId: uuid('created_by_team_member_id'),
    ...timestamps(),
  },
  (table) => [
    // The calendars list a workspace's sessions by time.
    index('sessions_organization_id_starts_at_idx').on(table.organizationId, table.startsAt),
    // The dates of one class (the class page, F021; the series of F022).
    index('sessions_organization_id_group_class_id_starts_at_idx').on(
      table.organizationId,
      table.groupClassId,
      table.startsAt,
    ),
    // A trainer's own calendar and the double-booking check (F013, F023).
    index('sessions_organization_id_trainer_profile_id_starts_at_idx').on(
      table.organizationId,
      table.trainerProfileId,
      table.startsAt,
    ),
    foreignKey({
      name: 'sessions_trainer_profile_fk',
      columns: [table.organizationId, table.trainerProfileId],
      foreignColumns: [trainerProfiles.organizationId, trainerProfiles.id],
    }),
    foreignKey({
      name: 'sessions_location_fk',
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    // A class on a date: the class it was scheduled from (F021). Classes are archived, never
    // deleted, so the reference cannot dangle.
    foreignKey({
      name: 'sessions_group_class_fk',
      columns: [table.organizationId, table.groupClassId],
      foreignColumns: [groupClasses.organizationId, groupClasses.id],
    }),
    foreignKey({
      name: 'sessions_created_by_fk',
      columns: [table.organizationId, table.createdByTeamMemberId],
      foreignColumns: [teamMembers.organizationId, teamMembers.id],
    }),
    check('sessions_ends_after_starts', sql`${table.endsAt} > ${table.startsAt}`),
    check('sessions_capacity_positive', sql`${table.capacity} >= 1`),
    check('sessions_version_positive', sql`${table.version} >= 1`),
    // A group session is a class on a date (F021, AC9): it needs its class.
    check(
      'sessions_group_has_class',
      sql`${table.type} <> 'group' OR ${table.groupClassId} IS NOT NULL`,
    ),
    check(
      'sessions_private_has_capacity_one',
      sql`${table.type} <> 'private' OR ${table.capacity} = 1`,
    ),
  ],
);

/**
 * A client's place in a session (F020; `PRODUCT.md §76`). A private session has exactly one. At
 * most one per session and client. `attendance_status` is `booked` until attendance (F025) or a
 * cancellation (F026) changes it. `agreement_id` is the M11 agreement (credits) the place uses,
 * empty until then; it has no foreign key yet because the table does not exist.
 *
 * The client policy applies (a client sees only their own places). The session and the client are
 * both in the participant's workspace (composite foreign keys). Participants go with their
 * session; a client with sessions is never removed (`NO ACTION`): their history stays.
 */
export const sessionParticipants = businessTable(
  'session_participants',
  {
    sessionId: uuid('session_id').notNull(),
    clientId: uuid('client_id').notNull(),
    attendanceStatus: attendanceStatus('attendance_status').notNull().default('booked'),
    agreementId: uuid('agreement_id'),
    ...timestamps(),
  },
  (table) => [
    unique('session_participants_session_id_client_id_unique').on(table.sessionId, table.clientId),
    // A client's upcoming sessions (F020 later ticket, TW-02 / TM-03).
    index('session_participants_organization_id_client_id_idx').on(
      table.organizationId,
      table.clientId,
    ),
    foreignKey({
      name: 'session_participants_session_fk',
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'session_participants_client_fk',
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
  ],
  { clientColumn: 'clientId' },
);

export type Session = typeof sessions.$inferSelect;
export type SessionParticipant = typeof sessionParticipants.$inferSelect;
