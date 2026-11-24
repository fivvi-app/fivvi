import {
  type ClassSeriesView,
  cancelSession,
  findClient,
  findSession,
  listLaterSeriesDates,
  lockClassSeriesOfWorkspace,
  type ParticipantStatusSource,
  removeSeriesDates,
  type SessionView,
  updateClassSeries,
  type WorkspaceScope,
  type WorkspaceView,
} from '@fivvi/database';
import {
  type CancelClassDateRefusal,
  type CancelClassDateRequest,
  type CancellableClassDate,
  cancelClassDate,
  confirmationLanguage,
  type LaterSeriesDate,
} from '@fivvi/domain';
import type { ClassCancelledMail } from '@fivvi/email/class-cancelled-mail';
import type { AfterCommit } from '../access.ts';
import type { ApiDependencies } from '../dependencies.ts';
import type { CancellingTeamMember } from './cancel-private-session.ts';
import { privateSessionEmailEvent } from './email-event.ts';

// Cancelling a class date, alone or with the rest of its series, inside a request's transaction
// (F026, spec #462, ticket #558): the one function the class cancel route calls. It decides with
// `cancelClassDate` of @fivvi/domain, stores with `cancelSession`, `removeSeriesDates` and
// `updateClassSeries` of @fivvi/database (every place of a cancelled date goes through
// `recordParticipantStatusChange`, the one writer of a status) and queues the emails (EM-05, the
// class variant) and the event for after the commit, so nothing is sent for a request that fails or
// is rolled back, and a send that fails does not undo the cancellation.

/** The class date as the rules read it, with the series it belongs to. */
export function cancellableClassDate(
  session: SessionView,
  series: Pick<ClassSeriesView, 'startsOn' | 'endsOn'> | undefined,
): CancellableClassDate {
  return {
    id: session.id,
    status: session.status,
    version: session.version,
    startsAt: session.startsAt,
    series:
      session.series && series
        ? {
            occurrenceDate: session.series.occurrenceDate,
            startsOn: series.startsOn,
            endsOn: series.endsOn,
          }
        : null,
    participants: session.participants.map(({ clientId, attendanceStatus }) => ({
      clientId,
      status: attendanceStatus,
    })),
  };
}

export interface CancelClassDateInput {
  readonly scope: WorkspaceScope;
  readonly afterCommit: AfterCommit;
  readonly dependencies: Pick<ApiDependencies, 'sendClassCancelled' | 'productEvents'>;
  /** The class date as it was read in this request's transaction; the caller has checked it is one. */
  readonly session: SessionView;
  readonly workspace: Pick<WorkspaceView, 'name' | 'timeZone' | 'defaultLocale'>;
  readonly actor: CancellingTeamMember;
  readonly request: CancelClassDateRequest;
  /** Where the cancellation is made, for the history; `system` records no product event. */
  readonly source: ParticipantStatusSource;
  readonly now: Date;
}

export type CancelClassDateResult =
  | {
      readonly outcome: 'cancelled';
      /** The chosen date as it is now. */
      readonly session: SessionView;
      /** Dates that became `cancelled`, the chosen one included. */
      readonly datesCancelled: number;
      /** Later dates removed from the calendar. */
      readonly datesRemoved: number;
      /** Different people who get the cancellation email (after the commit). */
      readonly participantsNotified: number;
      /** The last day of the series after *de reeks stopt*; `null` for one date. */
      readonly seriesEndsOn: string | null;
    }
  | { readonly outcome: 'refused'; readonly reason: 'not-allowed' | 'not-in-series' }
  | {
      readonly outcome: 'refused';
      /** `session-cancelled`: it was cancelled already; `session-changed`: someone changed it after the version the caller read. */
      readonly reason: 'session-cancelled' | 'session-changed';
      /** The date as it is now, for the `409`. */
      readonly session: SessionView;
    };

const refusalOf: Record<
  CancelClassDateRefusal,
  'not-allowed' | 'not-in-series' | 'session-cancelled' | 'session-changed'
> = {
  'not-allowed': 'not-allowed',
  'not-scheduled': 'session-cancelled',
  'not-in-series': 'not-in-series',
  'stale-version': 'session-changed',
};

/**
 * Cancels a class date (and with `following` the rest of its series) and queues its emails and its
 * event. The checks run in the order of the domain: who, a cancelled date, a date in no series asked
 * for the rest of one, a stale version; a cancel that loses a race with another change (the version
 * moved between the read and the write) is refused the same way, with the date as the winner left
 * it. Nothing is stored for a refusal. For the rest of a series the series' row and the later dates
 * are locked first, so the daily task that fills the calendar waits and cannot add a date after the
 * new end.
 */
export async function cancelClassDateInRequest(
  input: CancelClassDateInput,
): Promise<CancelClassDateResult> {
  const { scope, session, workspace, actor, request, now } = input;
  const series =
    session.series && request.scope === 'following'
      ? await lockClassSeriesOfWorkspace(scope, session.series.id)
      : undefined;
  const later: LaterSeriesDate[] =
    session.series && series
      ? await listLaterSeriesDates(scope, series.id, session.series.occurrenceDate, { lock: true })
      : [];
  const decision = cancelClassDate(
    cancellableClassDate(session, series),
    later,
    { role: actor.role, teamMemberId: actor.teamMemberId },
    request,
    now,
  );
  if (decision.outcome === 'refused') {
    const reason = refusalOf[decision.reason];
    return reason === 'not-allowed' || reason === 'not-in-series'
      ? { outcome: 'refused', reason }
      : { outcome: 'refused', reason, session };
  }

  const cancelledDates: SessionView[] = [];
  for (const [index, date] of decision.dates.entries()) {
    const cancelled = await cancelSession(scope, {
      sessionId: date.sessionId,
      expectedVersion: date.expectedVersion,
      cancelledAt: decision.cancelledAt,
      cancelledBy: { teamMemberId: actor.teamMemberId, accountId: actor.accountId },
      initiator: decision.initiator,
      source: input.source,
      clientIds: date.participantChanges.map((change) => change.clientId),
      ...(date.message === null ? {} : { message: date.message }),
    });
    if (!cancelled) {
      if (index > 0) {
        // The later dates are locked: nothing can have moved them since they were read.
        throw new Error('A later date of a series could not be cancelled.');
      }
      // Lost a race with another change between the read and the write: show what won.
      const latest = await findSession(scope, session.id);
      if (!latest) throw new Error('The class date of a lost cancellation was not found.');
      return {
        outcome: 'refused',
        reason: latest.status === 'cancelled' ? 'session-cancelled' : 'session-changed',
        session: latest,
      };
    }
    cancelledDates.push(cancelled);
  }
  const removed = await removeSeriesDates(scope, decision.removedSessionIds);
  if (removed !== decision.removedSessionIds.length) {
    // A date gained a place or a link since it was read, which the locks rule out: roll back.
    throw new Error('A later date of a series could not be removed.');
  }
  if (series && decision.seriesEndsOn !== null && decision.seriesEndsOn !== series.endsOn) {
    await updateClassSeries(scope, series.id, { endsOn: decision.seriesEndsOn });
  }

  // EM-05, the class variant: one email to each participant whose place was cancelled on a date that
  // has not started, in their language (their own, then the workspace's), naming no other
  // participant. The event is the date at the version it has now and the client, so the provider's
  // idempotency key makes it go out once.
  const notified = new Set<string>();
  for (const [index, date] of decision.dates.entries()) {
    const cancelled = cancelledDates[index];
    if (!cancelled) continue;
    for (const clientId of date.notifyClientIds) {
      const client = await findClient(scope, clientId);
      if (!client) continue;
      notified.add(client.id);
      const mail: ClassCancelledMail = {
        to: { email: client.email, name: client.name },
        locale: confirmationLanguage({
          clientEmailLocale: client.emailLocale,
          workspaceDefault: workspace.defaultLocale,
        }),
        workspaceName: workspace.name,
        timeZone: workspace.timeZone,
        class: {
          nameNl: cancelled.groupClass?.nameNl ?? '',
          nameEn: cancelled.groupClass?.nameEn ?? null,
        },
        startsAt: cancelled.startsAt,
        endsAt: cancelled.endsAt,
        location: { name: cancelled.location.name, address: cancelled.location.address },
        message: date.message,
        event: privateSessionEmailEvent(cancelled.id, cancelled.version, client.id),
      };
      input.afterCommit(() => input.dependencies.sendClassCancelled(mail));
    }
  }

  // The workspace ID, the platform and the scope only (OBSERVABILITY.md §4): no class, date or
  // series, no participant, name, message, date or time.
  if (input.source !== 'system') {
    const platform = input.source;
    input.afterCommit(() =>
      input.dependencies.productEvents.track({
        event: 'class_cancelled',
        distinctId: actor.accountId,
        properties: { workspace_id: scope.workspaceId, platform, scope: request.scope },
      }),
    );
  }
  const [first] = cancelledDates;
  if (!first) throw new Error('A cancellation of a class date cancelled no date.');
  return {
    outcome: 'cancelled',
    session: first,
    datesCancelled: cancelledDates.length,
    datesRemoved: removed,
    participantsNotified: notified.size,
    seriesEndsOn: decision.seriesEndsOn,
  };
}
