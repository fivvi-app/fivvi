import { sql } from 'drizzle-orm';
import { check, index, pgPolicy, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { CRON_ROLE } from '../cron-role.ts';
import { id, instant } from './columns.ts';
import { APP_ROLE } from './tenant-policies.ts';

// The deletion log (E014, spec #477, ticket #1173; `retention-policy.md` §3.5, AC21): the table
// name and the record ID of every hard deletion and anonymization, so that a restore of a backup
// (E016) re-applies them and does not bring a deleted person back. The writer is in
// `packages/domain/src/privacy/deletion-log.ts`.

/**
 * One entry: the table, the ID of the row that was deleted or anonymized, the workspace it was in
 * and the time, in UTC. **Nothing of the content**, and no foreign key: the row it names is gone
 * and so can be the workspace. Kept for `RETENTION.DELETION_LOG` (30 days), which the backups
 * outlive by design; a daily task deletes older entries.
 *
 * Platform data, owned by the cron role (E012, ADR-006): it is not a business table (it has
 * `organization_id`, but no workspace reads it), so it is on the conventions' non-business list.
 * Row-level security is on and forced all the same, because the retention tasks run as the cron
 * role and the API's purge writes in a request of the Owner:
 *
 * - the cron role reads, writes and deletes any entry (`deletion_log_cron`);
 * - the app role may only **insert**, and only for the workspaces of the request's context
 *   (`deletion_log_app_insert`); it can read, change or delete none;
 * - a trigger refuses every update, for every role: an entry is written once.
 */
export const deletionLog = pgTable(
  'deletion_log',
  {
    id: id(),
    tableName: text('table_name').notNull(),
    recordId: uuid('record_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    deletedAt: instant('deleted_at').notNull().defaultNow(),
  },
  (table) => [
    // The daily task deletes by age; a restore reads the entries since the backup.
    index('deletion_log_deleted_at_idx').on(table.deletedAt),
    check('deletion_log_table_name_valid', sql`${table.tableName} ~ '^[a-z][a-z0-9_]{0,62}$'`),
    pgPolicy('deletion_log_cron', {
      as: 'permissive',
      for: 'all',
      to: CRON_ROLE,
      using: sql`true`,
      withCheck: sql`true`,
    }),
    pgPolicy('deletion_log_app_insert', {
      as: 'permissive',
      for: 'insert',
      to: APP_ROLE,
      withCheck: sql`${table.organizationId} = ANY (app_workspace_ids())`,
    }),
  ],
);

export type DeletionLogRow = typeof deletionLog.$inferSelect;
