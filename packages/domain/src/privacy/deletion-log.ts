import { declaredTable } from './registry.ts';

// The deletion log writer (E014, spec #477, ticket #1173; `retention-policy.md` §3.5, AC21): every
// hard deletion and anonymization writes the table name and the record ID, with the workspace and
// the time, and nothing of the content. E016's restore of a backup re-applies the log, so a
// restored backup does not bring a deleted person back. Kept for the period of
// `RETENTION.DELETION_LOG`. Platform data: the cron role owns the table.

/** What a caller says: the table of the registry, the record's ID and the workspace it was in. */
export interface DeletionLogEntryInput {
  readonly table: string;
  readonly recordId: string;
  readonly workspaceId: string;
}

/** An entry as it is stored: the checked input and the time, in UTC. */
export interface DeletionLogEntry extends DeletionLogEntryInput {
  readonly deletedAt: Date;
}

export type InvalidDeletionLogEntryField = 'table' | 'recordId' | 'workspaceId';

/** The entry breaks a rule of the log. The message names the field and never quotes a value. */
export class InvalidDeletionLogEntryError extends Error {
  readonly field: InvalidDeletionLogEntryField;

  constructor(field: InvalidDeletionLogEntryField, message: string) {
    super(message);
    this.name = 'InvalidDeletionLogEntryError';
    this.field = field;
  }
}

/** Where the log is kept; `packages/database` implements it for the cron role and for a workspace scope. */
export interface DeletionLogStore {
  append(entries: readonly DeletionLogEntry[]): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks an entry and dates it. The table must be one the privacy registry declares, and the two
 * IDs must be UUIDs, so nothing but IDs and table names can reach the log.
 */
export function deletionLogEntry(input: DeletionLogEntryInput, now: Date): DeletionLogEntry {
  if (!declaredTable(input.table)) {
    throw new InvalidDeletionLogEntryError('table', 'The table is not in the privacy registry.');
  }
  if (!UUID.test(input.recordId)) {
    throw new InvalidDeletionLogEntryError('recordId', 'recordId is an ID (a UUID), never text.');
  }
  if (!UUID.test(input.workspaceId)) {
    throw new InvalidDeletionLogEntryError(
      'workspaceId',
      'workspaceId is an ID (a UUID), never text.',
    );
  }
  return {
    table: input.table,
    recordId: input.recordId,
    workspaceId: input.workspaceId,
    deletedAt: now,
  };
}

/**
 * The writer every hard deletion and anonymization calls, with all the rows of one step at once.
 * `now` is the injected clock. One entry that is not valid throws before anything is written.
 */
export function createDeletionLog(store: DeletionLogStore, clock: { now: () => Date }) {
  return {
    async record(inputs: readonly DeletionLogEntryInput[]): Promise<void> {
      if (inputs.length === 0) return;
      const now = clock.now();
      await store.append(inputs.map((input) => deletionLogEntry(input, now)));
    },
  };
}

export type DeletionLog = ReturnType<typeof createDeletionLog>;
