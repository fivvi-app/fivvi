import { sql } from 'drizzle-orm';
import { check, index, pgEnum, uuid } from 'drizzle-orm/pg-core';
import { businessTable } from './business-table.ts';
import { instant, timestamps } from './columns.ts';

// The access log (E014, spec #477, ticket #1173; `retention-policy.md` §3.4, R12): who exported,
// trashed, restored or purged which client, and from M7 who viewed or changed which note. The Owner
// reads it (`access_log.read`); every privacy action writes it. The writer and its rules are in
// `packages/domain/src/privacy/access-log.ts`; the table repeats the ones it can.

/**
 * What the log records. The domain's `ACCESS_LOG_ACTIONS` is the same list in the same order (a
 * test ties them); a new action is a migration (`ALTER TYPE … ADD VALUE`) and a line in both.
 */
export const accessLogAction = pgEnum('access_log_action', [
  'client.exported',
  'client.trashed',
  'client.restored',
  'client.purged',
  'workspace.exported',
  'client.retention_kept',
  'note.viewed',
  'note.changed',
]);

/**
 * One entry: the workspace, the actor (a team member; empty for what the daily cleanup does by
 * itself), the action, the client it was about, an object (a note's ID for `note.viewed` and
 * `note.changed`) and the time, in UTC. **IDs and a time only**: no free text, no name, no note
 * content, so the log is no new place for health data or a name to linger.
 *
 * - There is no foreign key on the actor or on the client, on purpose. A removed team member or a
 *   purged client must not take the entries with them, nor keep the removal from happening: the
 *   entry stays until the 12 months of `RETENTION.ACCESS_LOG` are over, and the reader resolves the
 *   names at read time (a client that is gone reads as *Verwijderde klant* / *Deleted client*).
 *   The writer only takes IDs of the scope's own workspace.
 * - The entries are append-only: a trigger refuses every update, for every role. The retention task
 *   deletes by age (E014 retention); nothing else deletes.
 * - `updated_at` exists for the table conventions and never changes.
 */
export const accessLog = businessTable(
  'access_log',
  {
    actorTeamMemberId: uuid('actor_team_member_id'),
    action: accessLogAction('action').notNull(),
    subjectClientId: uuid('subject_client_id'),
    objectId: uuid('object_id'),
    occurredAt: instant('occurred_at').notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [
    // The Owner's list, newest first, and filtered by client.
    index('access_log_organization_id_occurred_at_idx').on(
      table.organizationId,
      table.occurredAt,
      table.id,
    ),
    index('access_log_organization_id_subject_client_id_idx').on(
      table.organizationId,
      table.subjectClientId,
      table.occurredAt,
    ),
    // The retention task deletes across workspaces by age.
    index('access_log_occurred_at_idx').on(table.occurredAt),
    // A note entry names its note, no other entry does; the workspace export names no client, and
    // every other action does.
    check(
      'access_log_object_matches_action',
      sql`(${table.action} IN ('note.viewed', 'note.changed')) = (${table.objectId} IS NOT NULL)`,
    ),
    check(
      'access_log_client_matches_action',
      sql`(${table.action} = 'workspace.exported') = (${table.subjectClientId} IS NULL)`,
    ),
    // Only the daily cleanup acts without a team member: it trashes and purges.
    check(
      'access_log_actor_matches_action',
      sql`${table.actorTeamMemberId} IS NOT NULL OR ${table.action} IN ('client.trashed', 'client.purged')`,
    ),
  ],
);

export type AccessLogRow = typeof accessLog.$inferSelect;
