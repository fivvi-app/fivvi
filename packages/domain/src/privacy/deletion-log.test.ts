import { describe, expect, it } from 'vitest';
import {
  createDeletionLog,
  type DeletionLogEntry,
  type DeletionLogStore,
  deletionLogEntry,
  InvalidDeletionLogEntryError,
} from './deletion-log.ts';

// The deletion log writer (E014, ticket #1173, AC21, retention-policy.md §3.5): the table name and
// the record ID of a hard deletion or anonymization, with the workspace and the time. No content.
// Synthetic IDs only.

const WORKSPACE = '44444444-4444-4444-8444-444444444444';
const RECORD = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-11-11T09:00:00Z');

function recordingStore() {
  const entries: DeletionLogEntry[] = [];
  const store: DeletionLogStore = {
    append: (batch) => {
      entries.push(...batch);
      return Promise.resolve();
    },
  };
  return { store, entries };
}

describe('E014 the deletion log writer', () => {
  it('AC21: keeps the table name and the record ID, with the workspace and the time, and nothing else', () => {
    expect(
      deletionLogEntry({ table: 'clients', recordId: RECORD, workspaceId: WORKSPACE }, NOW),
    ).toEqual({ table: 'clients', recordId: RECORD, workspaceId: WORKSPACE, deletedAt: NOW });
  });

  it('AC21: takes only a table of the privacy registry, so no free text gets in as a table name', () => {
    expect(() =>
      deletionLogEntry({ table: 'Anna de Vries', recordId: RECORD, workspaceId: WORKSPACE }, NOW),
    ).toThrow(expect.objectContaining({ field: 'table' }));
    expect(() =>
      deletionLogEntry({ table: 'f099_unknown', recordId: RECORD, workspaceId: WORKSPACE }, NOW),
    ).toThrow(InvalidDeletionLogEntryError);
  });

  it('AC21: takes a UUID as the record and the workspace, never a value', () => {
    try {
      deletionLogEntry(
        { table: 'clients', recordId: 'anna@example.com', workspaceId: WORKSPACE },
        NOW,
      );
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidDeletionLogEntryError).field).toBe('recordId');
      expect((error as Error).message).not.toContain('anna@example.com');
    }
    expect(() =>
      deletionLogEntry({ table: 'clients', recordId: RECORD, workspaceId: 'x' }, NOW),
    ).toThrow(expect.objectContaining({ field: 'workspaceId' }));
  });

  it('writes the checked entries in one call, dated by the injected clock', async () => {
    const { store, entries } = recordingStore();
    const log = createDeletionLog(store, { now: () => NOW });

    await log.record([
      { table: 'clients', recordId: RECORD, workspaceId: WORKSPACE },
      { table: 'payment_customers', recordId: WORKSPACE, workspaceId: WORKSPACE },
    ]);

    expect(entries.map((entry) => entry.table)).toEqual(['clients', 'payment_customers']);
    expect(entries.every((entry) => entry.deletedAt === NOW)).toBe(true);
  });

  it('writes nothing when one entry of the batch is not valid', async () => {
    const { store, entries } = recordingStore();
    const log = createDeletionLog(store, { now: () => NOW });

    await expect(
      log.record([
        { table: 'clients', recordId: RECORD, workspaceId: WORKSPACE },
        { table: 'nope', recordId: RECORD, workspaceId: WORKSPACE },
      ]),
    ).rejects.toBeInstanceOf(InvalidDeletionLogEntryError);

    expect(entries).toEqual([]);
  });

  it('an empty batch writes nothing and is no error', async () => {
    const { store, entries } = recordingStore();
    await createDeletionLog(store, { now: () => NOW }).record([]);
    expect(entries).toEqual([]);
  });
});
