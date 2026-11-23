import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgEnum, text, unique, uuid } from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';
import { attendanceStatus, sessionParticipants } from './sessions.ts';

/** Who changed a participant's status: a team member, the client themself, or the system (a job, a seed). */
export const participantStatusActorType = pgEnum('participant_status_actor_type', [
  'team_member',
  'client',
  'system',
]);

/**
 * Who a cancellation came from (F026 sets it): the client cancelled, or the workspace did. Empty
 * for a change that is no cancellation.
 */
export const participantStatusInitiator = pgEnum('participant_status_initiator', [
  'client',
  'workspace',
]);

/** Where the change was made: the web, an app, or the system. */
export const participantStatusSource = pgEnum('participant_status_source', [
  'web',
  'ios',
  'android',
  'system',
]);

/**
 * The history of every status a place in a session has had (F025, spec #460, ticket #544;
 * `ROADMAP.md` M4: "M4 records the time and the actor of every status change, so M11 can apply the
 * cancellation policy"). **One line for every change** of `session_participants.attendance_status`,
 * written by the caller of `changeParticipantStatus` in the same transaction as the change: by
 * attendance (F025), cancelling (F026) and bookings (M5). The lines are **append-only**: a trigger
 * refuses every update and delete (and a truncate), for every role, so the history cannot be
 * rewritten. A correction is a new line (`attended → booked`), and the last line is the status.
 *
 * - `from_status` is empty for the line that creates a place (bookings, M5); `from_status` and
 *   `to_status` differ.
 * - `changed_at` is the server's time (UTC) of the change; `created_at` is when the line was
 *   written (the same transaction). `updated_at` exists for the table conventions and never changes.
 * - The actor is a team member (`actor_team_member_id`, with their account), the client themself
 *   (`actor_account_id`) or the system (neither). `initiated_by` says who a cancellation came from.
 * - `client_request_id` makes a retry harmless: the same ID twice in a workspace stores one change
 *   (the apps queue taps offline and send them again after a reconnect). A single change keeps the
 *   request's ID as it is; the bulk *Iedereen aanwezig* has one ID for many lines, so each line is
 *   `{clientRequestId}:{session_participant_id}`. Empty when the change has no request (the seed).
 * - There is no foreign key on the actor, on purpose, like the access log: a removed team member
 *   must not take their lines with them, nor keep the removal from happening. The writer only
 *   takes IDs of the scope's own workspace. `client_id` repeats the place's client (a composite key
 *   keeps them equal), for the client policy.
 */
export const sessionParticipantStatusChanges = businessTable(
  'session_participant_status_changes',
  {
    sessionParticipantId: uuid('session_participant_id').notNull(),
    clientId: uuid('client_id').notNull(),
    fromStatus: attendanceStatus('from_status'),
    toStatus: attendanceStatus('to_status').notNull(),
    changedAt: instant('changed_at').notNull(),
    actorType: participantStatusActorType('actor_type').notNull(),
    actorTeamMemberId: uuid('actor_team_member_id'),
    actorAccountId: uuid('actor_account_id'),
    initiatedBy: participantStatusInitiator('initiated_by'),
    source: participantStatusSource('source').notNull(),
    clientRequestId: text('client_request_id'),
    ...timestamps(),
  },
  (table) => [
    // A request ID is used once per workspace (several empty IDs are fine: a null is never equal).
    unique('session_participant_status_changes_request_id_unique').on(
      table.organizationId,
      table.clientRequestId,
    ),
    // The history of one place, oldest first.
    index('session_participant_status_changes_participant_idx').on(
      table.organizationId,
      table.sessionParticipantId,
      table.changedAt,
      table.id,
    ),
    foreignKey({
      name: 'session_participant_status_changes_participant_fk',
      columns: [table.organizationId, table.sessionParticipantId, table.clientId],
      foreignColumns: [
        sessionParticipants.organizationId,
        sessionParticipants.id,
        sessionParticipants.clientId,
      ],
    }),
    check(
      'session_participant_status_changes_from_differs',
      sql`${table.fromStatus} IS NULL OR ${table.fromStatus} <> ${table.toStatus}`,
    ),
    check(
      'session_participant_status_changes_actor_matches_type',
      sql`(${table.actorType} = 'team_member' AND ${table.actorTeamMemberId} IS NOT NULL)
        OR (${table.actorType} = 'client' AND ${table.actorAccountId} IS NOT NULL)
        OR (${table.actorType} = 'system' AND ${table.actorTeamMemberId} IS NULL AND ${table.actorAccountId} IS NULL)`,
    ),
    check(
      'session_participant_status_changes_request_id_valid',
      sql`${table.clientRequestId} IS NULL OR btrim(${table.clientRequestId}) <> ''`,
    ),
  ],
  { clientColumn: 'clientId' },
);

export type SessionParticipantStatusChange = typeof sessionParticipantStatusChanges.$inferSelect;
