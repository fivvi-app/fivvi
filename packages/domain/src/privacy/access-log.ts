// The access log writer (E014, spec #477, ticket #1173; `retention-policy.md` §3.4, R12): who
// exported, trashed, restored or purged which client, and (from M7) who viewed or changed which
// note. Everything that writes to the log goes through `createAccessLog`, so an entry can only be
// one of the actions below, with IDs and a time: no free text, never note content. The log is read
// by the Owner only (`access_log.read`); the names are resolved when it is read, never stored.

/**
 * The closed list of what the log records. `note.viewed` and `note.changed` are called by the notes
 * of M7 (F046 to F048) with the note's ID. The database enum `access_log_action` repeats the list;
 * a test ties the two.
 */
export const ACCESS_LOG_ACTIONS = [
  'client.exported',
  'client.trashed',
  'client.restored',
  'client.purged',
  'workspace.exported',
  'client.retention_kept',
  'note.viewed',
  'note.changed',
] as const;

export type AccessLogAction = (typeof ACCESS_LOG_ACTIONS)[number];

/** What a caller says: the action, who did it, and what it was about. */
export interface AccessLogEntryInput {
  readonly action: AccessLogAction;
  /**
   * The team member who did it. `null` only for what the daily cleanup does by itself (it trashes
   * a client nobody answered for, and removes a client from the trash), and it reads as no one.
   */
  readonly actorTeamMemberId: string | null;
  /** The client the action was about; none for the workspace export. */
  readonly subjectClientId?: string | null;
  /** The note's ID for `note.viewed` and `note.changed`; none for any other action. */
  readonly objectId?: string | null;
}

/** An entry as it is stored: the checked input and the time, in UTC. */
export interface AccessLogEntry {
  readonly action: AccessLogAction;
  readonly actorTeamMemberId: string | null;
  readonly subjectClientId: string | null;
  readonly objectId: string | null;
  readonly occurredAt: Date;
}

export type InvalidAccessLogEntryField =
  | 'action'
  | 'actorTeamMemberId'
  | 'subjectClientId'
  | 'objectId';

/** The entry breaks a rule of the log. The message names the field and never quotes a value. */
export class InvalidAccessLogEntryError extends Error {
  readonly field: InvalidAccessLogEntryField;

  constructor(field: InvalidAccessLogEntryField, message: string) {
    super(message);
    this.name = 'InvalidAccessLogEntryError';
    this.field = field;
  }
}

/** Where the log is kept; `packages/database` implements it for a workspace scope. */
export interface AccessLogStore {
  append(entry: AccessLogEntry): Promise<void>;
}

/** Actions the daily cleanup does by itself, without a team member. */
const BY_THE_DAILY_CLEANUP: readonly AccessLogAction[] = ['client.trashed', 'client.purged'];
const ABOUT_A_NOTE: readonly AccessLogAction[] = ['note.viewed', 'note.changed'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkId(field: InvalidAccessLogEntryField, value: string): string {
  if (!UUID.test(value)) {
    throw new InvalidAccessLogEntryError(field, `${field} is an ID (a UUID), never text.`);
  }
  return value;
}

/**
 * Checks an entry against the rules of its action and dates it. A client action names the client
 * and no object; a note action names the client and the note; the workspace export names neither.
 * Every action has a team member, except the two of the daily cleanup.
 */
export function accessLogEntry(input: AccessLogEntryInput, now: Date): AccessLogEntry {
  const { action } = input;
  if (!(ACCESS_LOG_ACTIONS as readonly string[]).includes(action)) {
    throw new InvalidAccessLogEntryError('action', 'The action is not on the list of the log.');
  }
  const actor = input.actorTeamMemberId ?? null;
  const client = input.subjectClientId ?? null;
  const object = input.objectId ?? null;

  if (actor === null && !BY_THE_DAILY_CLEANUP.includes(action)) {
    throw new InvalidAccessLogEntryError('actorTeamMemberId', `${action} needs a team member.`);
  }
  if (action === 'workspace.exported' ? client !== null : client === null) {
    throw new InvalidAccessLogEntryError(
      'subjectClientId',
      action === 'workspace.exported'
        ? 'The workspace export is about no client.'
        : `${action} needs the client.`,
    );
  }
  if (ABOUT_A_NOTE.includes(action) ? object === null : object !== null) {
    throw new InvalidAccessLogEntryError(
      'objectId',
      ABOUT_A_NOTE.includes(action)
        ? `${action} needs the note’s ID.`
        : `${action} is about no object.`,
    );
  }
  return {
    action,
    actorTeamMemberId: actor === null ? null : checkId('actorTeamMemberId', actor),
    subjectClientId: client === null ? null : checkId('subjectClientId', client),
    objectId: object === null ? null : checkId('objectId', object),
    occurredAt: now,
  };
}

/**
 * The writer other code calls. `now` is the injected clock (the domain never reads the system
 * time). An entry that is not valid throws before anything is written.
 */
export function createAccessLog(store: AccessLogStore, clock: { now: () => Date }) {
  return {
    async record(input: AccessLogEntryInput): Promise<AccessLogEntry> {
      const entry = accessLogEntry(input, clock.now());
      await store.append(entry);
      return entry;
    },
  };
}

export type AccessLog = ReturnType<typeof createAccessLog>;
