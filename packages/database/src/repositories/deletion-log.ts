import type { DatabaseExecutor } from '../client.ts';
import { deletionLog } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The deletion log (E014, ticket #1173; `retention-policy.md` §3.5, AC21). The rules (a table of
// the privacy registry, IDs only) are in `packages/domain/src/privacy/deletion-log.ts`, which also
// defines the `DeletionLogStore` port; the table repeats the ones it can. Platform data of the cron
// role: the retention tasks write it through the cron connection (`appendDeletionLog`), the Owner's
// request through its scope (`deletionLogStore`), where the database lets it **insert** entries
// for its own workspace and nothing else. Reading and deleting old entries is the cron's.

/** An entry as the domain writer hands it over: the table, the record, the workspace and the time. */
export interface DeletionLogEntryRecord {
  readonly table: string;
  readonly recordId: string;
  readonly workspaceId: string;
  readonly deletedAt: Date;
}

type Inserter = Pick<DatabaseExecutor, 'insert'>;

/** Adds the entries in one statement. For the cron role's connection and for the privileged setup. */
export async function appendDeletionLog(
  db: Inserter,
  entries: readonly DeletionLogEntryRecord[],
): Promise<void> {
  if (entries.length === 0) return;
  await db.insert(deletionLog).values(
    entries.map((entry) => ({
      tableName: entry.table,
      recordId: entry.recordId,
      organizationId: entry.workspaceId,
      deletedAt: entry.deletedAt,
    })),
  );
}

/**
 * The deletion log as the domain's `DeletionLogStore` port, written inside the scope's transaction
 * so an entry commits or rolls back with the deletion it records.
 */
export function deletionLogStore(scope: WorkspaceScope) {
  return {
    append: (entries: readonly DeletionLogEntryRecord[]) =>
      appendDeletionLog(executorOf(scope), entries),
  };
}
