import { and, eq, sql } from 'drizzle-orm';
import { sessions } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';
import {
  listAttendanceParticipants,
  type ParticipantStatusSource,
  recordParticipantStatusChange,
} from './attendance.ts';
import { type CancellationInitiator, findSession, type SessionView } from './sessions.ts';

// Cancelling a session (F026, spec #462): the one write that stores a cancellation. The rules (who
// may, a cancelled session, a stale version, which places change, who is emailed) are in
// `packages/domain` (`cancelPrivateSession`); this stores what they decided and knows nothing of
// them. It runs in the scope's transaction, so a caller with a transaction of its own (the trainer
// handover, F026's later tickets) cancels inside it: the session's record and the history lines
// of its places stand or fall with the rest of that request.

/** What cancelling one session stores, as `cancelPrivateSession` decided it. */
export interface SessionCancellation {
  readonly sessionId: string;
  /** The version the caller read. The session is cancelled only if it still has it and is still scheduled. */
  readonly expectedVersion: number;
  /** The server's time of the cancellation, UTC. */
  readonly cancelledAt: Date;
  /** The team member who cancels, with their account (the history names both). */
  readonly cancelledBy: { readonly teamMemberId: string; readonly accountId: string };
  readonly initiator: CancellationInitiator;
  /** Where the cancellation was made, for the history's `source`. */
  readonly source: ParticipantStatusSource;
  /** The clients whose places go to `cancelled`: the decision's `participantChanges`. */
  readonly clientIds: readonly string[];
  /** The text sent with a class date's cancellation, as typed; left out for a private session. */
  readonly message?: string;
}

/**
 * Cancels a session of the scope's workspace and returns it as `findSession` shows it: the status
 * becomes `cancelled`, the time, the team member and the initiator are recorded, the version is
 * raised and the team member is the one who changed it last. Each named client's place goes to
 * `cancelled`, one line of the status history each (from what it was, to `cancelled`, the actor, the
 * source and the initiator), written through `recordParticipantStatusChange`, the only writer of a
 * status. One statement matches the version and the status, so of two cancellations (or a
 * cancellation and a reschedule) from the same version exactly one is stored: the second waits for
 * the first's row lock and then matches nothing. `undefined` when it did not match (or the
 * workspace has no such session): nothing changed, and the caller reads the session to tell which.
 */
export async function cancelSession(
  scope: WorkspaceScope,
  input: SessionCancellation,
): Promise<SessionView | undefined> {
  const db = executorOf(scope);
  const [changed] = await db
    .update(sessions)
    .set({
      status: 'cancelled',
      cancelledAt: input.cancelledAt,
      cancelledByTeamMemberId: input.cancelledBy.teamMemberId,
      cancellationInitiator: input.initiator,
      cancellationMessage: input.message ?? null,
      version: sql`${sessions.version} + 1`,
      updatedByTeamMemberId: input.cancelledBy.teamMemberId,
    })
    .where(
      and(
        eq(sessions.organizationId, scope.workspaceId),
        eq(sessions.id, input.sessionId),
        eq(sessions.version, input.expectedVersion),
        eq(sessions.status, 'scheduled'),
      ),
    )
    .returning({ id: sessions.id });
  if (!changed) return undefined;
  // Locked until the transaction ends: a change of a place by someone else waits, and the history's
  // `from` is the status the place had when it was cancelled.
  const places = await listAttendanceParticipants(scope, input.sessionId, { lock: true });
  for (const place of places) {
    if (place.status === 'cancelled' || !input.clientIds.includes(place.clientId)) continue;
    await recordParticipantStatusChange(scope, {
      participantId: place.id,
      clientId: place.clientId,
      from: place.status,
      to: 'cancelled',
      changedAt: input.cancelledAt,
      actor: {
        type: 'team_member',
        teamMemberId: input.cancelledBy.teamMemberId,
        accountId: input.cancelledBy.accountId,
      },
      source: input.source,
      initiatedBy: input.initiator,
    });
  }
  return findSession(scope, changed.id);
}
