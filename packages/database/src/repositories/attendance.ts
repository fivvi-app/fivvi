import { and, asc, eq, inArray, like, or } from 'drizzle-orm';
import {
  clients,
  type participantStatusInitiator,
  type participantStatusSource,
  sessionParticipantStatusChanges,
  sessionParticipants,
} from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';
import type { AttendanceStatus } from './sessions.ts';

// Attendance (F025, spec #460, ticket #544): a session's participants with their status, and the
// one write of a status, which is also its history line. The rules (who, when, which change) are in
// `packages/domain` (`changeParticipantStatus`); these functions store what the rules decided and
// know nothing of them. Every function names the scope's workspace itself (barrier 1); RLS says the
// same underneath (barrier 2).

/** Where a change was made: the history's `source`. */
export type ParticipantStatusSource = (typeof participantStatusSource.enumValues)[number];

/** Who a cancellation came from (F026): the history's `initiated_by`. */
export type ParticipantStatusInitiator = (typeof participantStatusInitiator.enumValues)[number];

/** A place in a session, with the client's display name: nothing else of the client. */
export interface AttendanceParticipantView {
  /** The place (`session_participants.id`), which the history lines point at. */
  readonly id: string;
  readonly clientId: string;
  /** The client's display name. */
  readonly name: string;
  readonly status: AttendanceStatus;
  /** When the status last changed; `null` until it does. */
  readonly statusChangedAt: Date | null;
}

/**
 * The participants of a session of the scope's workspace, in the order they were added; none for a
 * session of another workspace (RLS shows no row of it). With `lock` the rows are locked until the
 * transaction ends, so two changes to one place wait for each other and the second decides on what
 * the first left (the history's `from` is always the status before).
 */
export function listAttendanceParticipants(
  scope: WorkspaceScope,
  sessionId: string,
  options: { lock?: boolean } = {},
): Promise<AttendanceParticipantView[]> {
  const query = executorOf(scope)
    .select({
      id: sessionParticipants.id,
      clientId: clients.id,
      name: clients.name,
      status: sessionParticipants.attendanceStatus,
      statusChangedAt: sessionParticipants.statusChangedAt,
    })
    .from(sessionParticipants)
    .innerJoin(
      clients,
      and(
        eq(clients.organizationId, sessionParticipants.organizationId),
        eq(clients.id, sessionParticipants.clientId),
      ),
    )
    .where(
      and(
        eq(sessionParticipants.organizationId, scope.workspaceId),
        eq(sessionParticipants.sessionId, sessionId),
      ),
    )
    .orderBy(asc(sessionParticipants.createdAt), asc(sessionParticipants.id));
  return options.lock ? query.for('update', { of: sessionParticipants }) : query;
}

/** One participant of a session of the scope's workspace, optionally locked; `undefined` when it isn't there. */
export async function findAttendanceParticipant(
  scope: WorkspaceScope,
  sessionId: string,
  clientId: string,
  options: { lock?: boolean } = {},
): Promise<AttendanceParticipantView | undefined> {
  const query = executorOf(scope)
    .select({
      id: sessionParticipants.id,
      clientId: clients.id,
      name: clients.name,
      status: sessionParticipants.attendanceStatus,
      statusChangedAt: sessionParticipants.statusChangedAt,
    })
    .from(sessionParticipants)
    .innerJoin(
      clients,
      and(
        eq(clients.organizationId, sessionParticipants.organizationId),
        eq(clients.id, sessionParticipants.clientId),
      ),
    )
    .where(
      and(
        eq(sessionParticipants.organizationId, scope.workspaceId),
        eq(sessionParticipants.sessionId, sessionId),
        eq(sessionParticipants.clientId, clientId),
      ),
    )
    .limit(1);
  const [row] = await (options.lock ? query.for('update', { of: sessionParticipants }) : query);
  return row;
}

/**
 * The prefix of the request ID of each line of a bulk change: the bulk has one ID for many lines,
 * and the ID of a line is `{clientRequestId}:{session_participant_id}` (the table's unique index).
 */
export function bulkRequestKey(clientRequestId: string, participantId: string): string {
  return `${clientRequestId}:${participantId}`;
}

/**
 * The place a request ID was used for, if a line of the scope's workspace has it: the ID of one
 * change as it is, or the prefix of a bulk's lines. `undefined` when the ID is new, which is the
 * only time the request changes anything. A request ID is a UUID, so it holds no `LIKE` wildcard.
 */
export async function findStatusChangeByRequest(
  scope: WorkspaceScope,
  clientRequestId: string,
): Promise<{ sessionParticipantId: string; bulk: boolean } | undefined> {
  const [row] = await executorOf(scope)
    .select({
      sessionParticipantId: sessionParticipantStatusChanges.sessionParticipantId,
      clientRequestId: sessionParticipantStatusChanges.clientRequestId,
    })
    .from(sessionParticipantStatusChanges)
    .where(
      and(
        eq(sessionParticipantStatusChanges.organizationId, scope.workspaceId),
        or(
          eq(sessionParticipantStatusChanges.clientRequestId, clientRequestId),
          like(sessionParticipantStatusChanges.clientRequestId, `${clientRequestId}:%`),
        ),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return {
    sessionParticipantId: row.sessionParticipantId,
    bulk: row.clientRequestId !== clientRequestId,
  };
}

/** One change of a participant's status, as `changeParticipantStatus` decided it. */
export interface ParticipantStatusChange {
  readonly participantId: string;
  readonly clientId: string;
  /** The status before; `null` for the line that creates a place (bookings, M5). */
  readonly from: AttendanceStatus | null;
  readonly to: AttendanceStatus;
  /** The server's time of the change, UTC. */
  readonly changedAt: Date;
  /** The team-member record of the caller (a team member acts), with their account. */
  readonly actor:
    | { readonly type: 'team_member'; readonly teamMemberId: string; readonly accountId: string }
    | { readonly type: 'client'; readonly accountId: string }
    | { readonly type: 'system' };
  readonly source: ParticipantStatusSource;
  readonly initiatedBy?: ParticipantStatusInitiator;
  /** The request's key (`bulkRequestKey` for a bulk's lines); `undefined` when there is no request. */
  readonly requestKey?: string;
}

/**
 * Writes one change: the history line and the participant's new status and `status_changed_at`, in
 * the request's transaction, so they stand or fall together. The only function that changes
 * `attendance_status` (the domain's `changeParticipantStatus` decides, this stores). `false`
 * when the request key was used already (a retry that lost a race with its first try, which holds
 * the same key): nothing is stored. A participant in no place of the workspace changes no row.
 */
export async function recordParticipantStatusChange(
  scope: WorkspaceScope,
  change: ParticipantStatusChange,
): Promise<boolean> {
  const db = executorOf(scope);
  const [line] = await db
    .insert(sessionParticipantStatusChanges)
    .values({
      organizationId: scope.workspaceId,
      sessionParticipantId: change.participantId,
      clientId: change.clientId,
      fromStatus: change.from,
      toStatus: change.to,
      changedAt: change.changedAt,
      actorType: change.actor.type,
      actorTeamMemberId: change.actor.type === 'team_member' ? change.actor.teamMemberId : null,
      actorAccountId: change.actor.type === 'system' ? null : change.actor.accountId,
      initiatedBy: change.initiatedBy ?? null,
      source: change.source,
      clientRequestId: change.requestKey ?? null,
    })
    .onConflictDoNothing({
      target: [
        sessionParticipantStatusChanges.organizationId,
        sessionParticipantStatusChanges.clientRequestId,
      ],
    })
    .returning({ id: sessionParticipantStatusChanges.id });
  if (!line) return false;
  await db
    .update(sessionParticipants)
    .set({ attendanceStatus: change.to, statusChangedAt: change.changedAt })
    .where(
      and(
        eq(sessionParticipants.organizationId, scope.workspaceId),
        eq(sessionParticipants.id, change.participantId),
      ),
    );
  return true;
}

/** A line of a place's status history, oldest first: for the tests and the later features that read it. */
export interface ParticipantStatusChangeView {
  readonly id: string;
  readonly from: AttendanceStatus | null;
  readonly to: AttendanceStatus;
  readonly changedAt: Date;
  readonly actorType: 'team_member' | 'client' | 'system';
  readonly actorTeamMemberId: string | null;
  readonly actorAccountId: string | null;
  readonly initiatedBy: ParticipantStatusInitiator | null;
  readonly source: ParticipantStatusSource;
}

/** The history of the places in the given sessions of the scope's workspace, by place and then by time. */
export async function listParticipantStatusChanges(
  scope: WorkspaceScope,
  participantIds: readonly string[],
): Promise<(ParticipantStatusChangeView & { participantId: string })[]> {
  if (participantIds.length === 0) return [];
  const rows = await executorOf(scope)
    .select({
      id: sessionParticipantStatusChanges.id,
      participantId: sessionParticipantStatusChanges.sessionParticipantId,
      from: sessionParticipantStatusChanges.fromStatus,
      to: sessionParticipantStatusChanges.toStatus,
      changedAt: sessionParticipantStatusChanges.changedAt,
      actorType: sessionParticipantStatusChanges.actorType,
      actorTeamMemberId: sessionParticipantStatusChanges.actorTeamMemberId,
      actorAccountId: sessionParticipantStatusChanges.actorAccountId,
      initiatedBy: sessionParticipantStatusChanges.initiatedBy,
      source: sessionParticipantStatusChanges.source,
    })
    .from(sessionParticipantStatusChanges)
    .where(
      and(
        eq(sessionParticipantStatusChanges.organizationId, scope.workspaceId),
        inArray(sessionParticipantStatusChanges.sessionParticipantId, [...participantIds]),
      ),
    )
    .orderBy(
      asc(sessionParticipantStatusChanges.sessionParticipantId),
      asc(sessionParticipantStatusChanges.changedAt),
      asc(sessionParticipantStatusChanges.createdAt),
      asc(sessionParticipantStatusChanges.id),
    );
  return rows;
}
