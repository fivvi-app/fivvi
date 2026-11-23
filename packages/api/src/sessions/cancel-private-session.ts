import {
  cancelSession,
  findClient,
  findSession,
  type ParticipantStatusSource,
  type SessionView,
  type WorkspaceScope,
  type WorkspaceView,
} from '@fivvi/database';
import {
  type CancelPrivateSessionRefusal,
  type CancelRequest,
  cancelPrivateSession,
  confirmationLanguage,
} from '@fivvi/domain';
import type { PrivateSessionMail } from '@fivvi/email/private-session-mail';
import type { AfterCommit } from '../access.ts';
import type { ApiDependencies } from '../dependencies.ts';
import { privateSessionEmailEvent } from './email-event.ts';

// Cancelling a private session inside a request's transaction (F026, spec #462, ticket #557): the
// one function the cancel route calls, and the one another feature calls from its own request (the
// trainer handover, ticket #537) to cancel sessions with the same record, the same history lines
// and the same email (EM-05). It decides with `cancelPrivateSession` of @fivvi/domain, stores with
// `cancelSession` of @fivvi/database and queues the email and the event for after the commit
// (`afterCommit`), so nothing is sent for a request that fails or is rolled back, and a send that
// fails does not undo the cancellation.

/** Who cancels: their team-member record in the workspace and their own account. */
export interface CancellingTeamMember {
  readonly teamMemberId: string;
  readonly role: 'owner' | 'trainer';
  readonly accountId: string;
}

export interface CancelPrivateSessionInput {
  readonly scope: WorkspaceScope;
  readonly afterCommit: AfterCommit;
  readonly dependencies: Pick<ApiDependencies, 'sendPrivateSession' | 'productEvents'>;
  /** The session as it was read in this request's transaction; the caller has checked it is private. */
  readonly session: SessionView;
  readonly workspace: Pick<WorkspaceView, 'name' | 'timeZone' | 'defaultLocale' | 'trainerWord'>;
  readonly actor: CancellingTeamMember;
  /** `expectedVersion` is left out by a caller that read the session itself, in its own transaction. */
  readonly request: CancelRequest;
  /** Where the cancellation is made, for the history; `system` records no product event. */
  readonly source: ParticipantStatusSource;
  readonly now: Date;
}

export type CancelPrivateSessionResult =
  | {
      readonly outcome: 'cancelled';
      /** The session as it is now. */
      readonly session: SessionView;
      /** How many clients get the cancellation email (after the commit). */
      readonly clientsNotified: number;
    }
  | { readonly outcome: 'refused'; readonly reason: 'not-allowed' }
  | {
      readonly outcome: 'refused';
      /** `session-cancelled`: it was cancelled already; `session-changed`: someone changed it after the version the caller read. */
      readonly reason: 'session-cancelled' | 'session-changed';
      /** The session as it is now, for the `409`. */
      readonly session: SessionView;
    };

const refusalOf: Record<
  CancelPrivateSessionRefusal,
  'not-allowed' | 'session-cancelled' | 'session-changed'
> = {
  'not-allowed': 'not-allowed',
  'not-scheduled': 'session-cancelled',
  'stale-version': 'session-changed',
};

/**
 * Cancels a private session and queues its emails and its event. The checks run in the order of the
 * domain: who, a cancelled session, a stale version; a cancel that loses a race with another change
 * (the version moved between the read and the write) is refused the same way, with the session as
 * the winner left it. Nothing is stored for a refusal.
 */
export async function cancelPrivateSessionInRequest(
  input: CancelPrivateSessionInput,
): Promise<CancelPrivateSessionResult> {
  const { scope, session, workspace, actor, request, now } = input;
  const decision = cancelPrivateSession(
    {
      status: session.status,
      version: session.version,
      startsAt: session.startsAt,
      trainerTeamMemberId: session.trainer?.id ?? null,
      participants: session.participants.map(({ clientId, attendanceStatus }) => ({
        clientId,
        status: attendanceStatus,
      })),
    },
    { role: actor.role, teamMemberId: actor.teamMemberId },
    request,
    now,
  );
  if (decision.outcome === 'refused') {
    const reason = refusalOf[decision.reason];
    return reason === 'not-allowed'
      ? { outcome: 'refused', reason }
      : { outcome: 'refused', reason, session };
  }

  const cancelled = await cancelSession(scope, {
    sessionId: session.id,
    expectedVersion: request.expectedVersion ?? session.version,
    cancelledAt: decision.cancelledAt,
    cancelledBy: { teamMemberId: actor.teamMemberId, accountId: actor.accountId },
    initiator: decision.initiator,
    source: input.source,
    clientIds: decision.participantChanges.map((change) => change.clientId),
  });
  if (!cancelled) {
    // Lost a race with another change between the read and the write: show what won.
    const latest = await findSession(scope, session.id);
    if (!latest) throw new Error('The session of a lost cancellation was not found.');
    return {
      outcome: 'refused',
      reason: latest.status === 'cancelled' ? 'session-cancelled' : 'session-changed',
      session: latest,
    };
  }

  // EM-05: one email to each client whose place was cancelled, in their language (their own, then
  // the workspace's), naming no other participant. The event is the cancellation at the version it
  // has now and the client, so the provider's idempotency key makes it go out once.
  let clientsNotified = 0;
  for (const clientId of decision.notifyClientIds) {
    const client = await findClient(scope, clientId);
    if (!client) continue;
    clientsNotified += 1;
    const mail: PrivateSessionMail = {
      to: { email: client.email, name: client.name },
      locale: confirmationLanguage({
        clientEmailLocale: client.emailLocale,
        workspaceDefault: workspace.defaultLocale,
      }),
      workspaceName: workspace.name,
      timeZone: workspace.timeZone,
      startsAt: cancelled.startsAt,
      endsAt: cancelled.endsAt,
      cancelled: true,
      location: { name: cancelled.location.name, address: cancelled.location.address },
      trainerName: cancelled.trainer?.name.trim() ? cancelled.trainer.name : null,
      trainerWord: workspace.trainerWord,
      event: privateSessionEmailEvent(cancelled.id, cancelled.version, client.id),
    };
    input.afterCommit(() => input.dependencies.sendPrivateSession(mail));
  }

  // The workspace ID, the platform and the initiator only (OBSERVABILITY.md §4): no session,
  // client or trainer, no name, message, date or time.
  if (input.source !== 'system') {
    const platform = input.source;
    input.afterCommit(() =>
      input.dependencies.productEvents.track({
        event: 'private_session_cancelled',
        distinctId: actor.accountId,
        properties: { workspace_id: scope.workspaceId, platform, initiator: decision.initiator },
      }),
    );
  }
  return { outcome: 'cancelled', session: cancelled, clientsNotified };
}
