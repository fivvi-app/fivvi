import { accessLogAction } from '@fivvi/database';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_LOG_ACTIONS,
  type AccessLogEntry,
  type AccessLogStore,
  accessLogEntry,
  createAccessLog,
  InvalidAccessLogEntryError,
} from './access-log.ts';

// The access log writer (E014, ticket #1173, AC21/AC22): a closed list of actions, IDs only, never
// free text or note content. Synthetic people: John (Owner) and Anna de Vries (client).

const JOHN = '11111111-1111-4111-8111-111111111111';
const ANNA = '22222222-2222-4222-8222-222222222222';
const NOTE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-11T09:00:00Z');

function recordingStore() {
  const entries: AccessLogEntry[] = [];
  const store: AccessLogStore = {
    append: (entry) => {
      entries.push(entry);
      return Promise.resolve();
    },
  };
  return { store, entries };
}

describe('E014 the access log writer', () => {
  it('AC22: the actions are a closed list, with the note actions for F046 to F048', () => {
    expect(ACCESS_LOG_ACTIONS).toEqual([
      'client.exported',
      'client.trashed',
      'client.restored',
      'client.purged',
      'workspace.exported',
      'client.retention_kept',
      'note.viewed',
      'note.changed',
    ]);
  });

  it('the database enum has the same actions in the same order', () => {
    expect(accessLogAction.enumValues).toEqual(ACCESS_LOG_ACTIONS);
  });

  it('AC22: keeps the actor, the action, the client and the time, and nothing else', () => {
    expect(
      accessLogEntry(
        { action: 'client.exported', actorTeamMemberId: JOHN, subjectClientId: ANNA },
        NOW,
      ),
    ).toEqual({
      action: 'client.exported',
      actorTeamMemberId: JOHN,
      subjectClientId: ANNA,
      objectId: null,
      occurredAt: NOW,
    });
  });

  it('AC22: a note entry carries the note ID, and cannot be written without it', () => {
    expect(
      accessLogEntry(
        { action: 'note.viewed', actorTeamMemberId: JOHN, subjectClientId: ANNA, objectId: NOTE },
        NOW,
      ),
    ).toMatchObject({ action: 'note.viewed', objectId: NOTE, subjectClientId: ANNA });
    expect(() =>
      accessLogEntry(
        { action: 'note.changed', actorTeamMemberId: JOHN, subjectClientId: ANNA },
        NOW,
      ),
    ).toThrow(InvalidAccessLogEntryError);
  });

  it('a client action names the client and no object; the workspace export names neither', () => {
    for (const action of [
      'client.exported',
      'client.trashed',
      'client.restored',
      'client.purged',
      'client.retention_kept',
    ] as const) {
      expect(() => accessLogEntry({ action, actorTeamMemberId: JOHN }, NOW), action).toThrow(
        InvalidAccessLogEntryError,
      );
      expect(
        () =>
          accessLogEntry(
            { action, actorTeamMemberId: JOHN, subjectClientId: ANNA, objectId: NOTE },
            NOW,
          ),
        action,
      ).toThrow(InvalidAccessLogEntryError);
    }
    expect(
      accessLogEntry({ action: 'workspace.exported', actorTeamMemberId: JOHN }, NOW),
    ).toMatchObject({
      subjectClientId: null,
      objectId: null,
    });
    expect(() =>
      accessLogEntry(
        { action: 'workspace.exported', actorTeamMemberId: JOHN, subjectClientId: ANNA },
        NOW,
      ),
    ).toThrow(InvalidAccessLogEntryError);
  });

  it('only the daily cleanup acts without a team member: it trashes and purges', () => {
    expect(
      accessLogEntry(
        { action: 'client.purged', actorTeamMemberId: null, subjectClientId: ANNA },
        NOW,
      ),
    ).toMatchObject({ actorTeamMemberId: null });
    expect(
      accessLogEntry(
        { action: 'client.trashed', actorTeamMemberId: null, subjectClientId: ANNA },
        NOW,
      ),
    ).toMatchObject({ actorTeamMemberId: null });
    for (const action of ['client.exported', 'client.restored', 'client.retention_kept'] as const) {
      expect(
        () => accessLogEntry({ action, actorTeamMemberId: null, subjectClientId: ANNA }, NOW),
        action,
      ).toThrow(InvalidAccessLogEntryError);
    }
  });

  it('refuses an action outside the list and an ID that is no UUID, naming the field and no value', () => {
    expect(() =>
      accessLogEntry(
        { action: 'client.deleted' as never, actorTeamMemberId: JOHN, subjectClientId: ANNA },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ field: 'action' }));
    try {
      accessLogEntry(
        { action: 'client.exported', actorTeamMemberId: JOHN, subjectClientId: 'anna@example.com' },
        NOW,
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAccessLogEntryError);
      expect((error as InvalidAccessLogEntryError).field).toBe('subjectClientId');
      expect((error as Error).message).not.toContain('anna@example.com');
    }
  });

  it('writes the checked entry through the store, dated by the injected clock', async () => {
    const { store, entries } = recordingStore();
    const log = createAccessLog(store, { now: () => NOW });

    await log.record({ action: 'client.trashed', actorTeamMemberId: JOHN, subjectClientId: ANNA });

    expect(entries).toEqual([
      {
        action: 'client.trashed',
        actorTeamMemberId: JOHN,
        subjectClientId: ANNA,
        objectId: null,
        occurredAt: NOW,
      },
    ]);
  });

  it('writes nothing for an entry that is not valid', async () => {
    const { store, entries } = recordingStore();
    const log = createAccessLog(store, { now: () => NOW });

    await expect(
      log.record({ action: 'note.viewed', actorTeamMemberId: JOHN, subjectClientId: ANNA }),
    ).rejects.toBeInstanceOf(InvalidAccessLogEntryError);

    expect(entries).toEqual([]);
  });
});
