import type { Schemas } from '@fivvi/contract';

/** What a person has coming in this workspace, in the next 2 weeks and after them (F023 AC9, AC10). */
export type FutureSessions = Schemas['TeamMemberFutureSessions'];
/** What a removal with a handover changed (`200`). */
export type HandoverDone = Schemas['TeamMemberHandover'];

/** Where the removed person's sessions go (F023 AC9, AC9a): a trainer's team-member ID, or `null` (*Niemand*). */
export interface Handover {
  /** The next 2 weeks' private sessions: a trainer, or `null`: they are cancelled, with the email. */
  privateTo: string | null;
  /** The next 2 weeks' class dates: a trainer, or `null`: they get *Trainer nodig*. */
  classesTo: string | null;
  /** *Klanten informeren per e-mail*. */
  notifyClients: boolean;
}

export type RemoveTeamMemberResult =
  | { ok: true; handover?: HandoverDone }
  /** Not signed in, or no longer allowed to remove anyone: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  /** The person has sessions coming and the request held no handover (`409` `has_future_sessions`): nothing changed. */
  | { ok: false; reason: 'hasFutureSessions'; future: FutureSessions }
  | { ok: false; reason: 'noConnection' | 'generic' };

export type FutureSessionsResult =
  | { ok: true; future: FutureSessions }
  | { ok: false; reason: 'home' | 'failed' };

/**
 * Reads what the person has coming (`GET …/team-members/{id}/future-sessions`, F023 AC9, AC10): the
 * counts the removal dialog shows. The API decides whether a handover is needed (`hasFutureSessions`).
 */
export async function loadFutureSessions(
  workspaceId: string,
  teamMemberId: string,
  fetchFn: typeof fetch = fetch,
): Promise<FutureSessionsResult> {
  let response: Response;
  try {
    response = await fetchFn(
      `/api/v1/workspaces/${workspaceId}/team-members/${teamMemberId}/future-sessions`,
    );
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status !== 200) return { ok: false, reason: 'failed' };
  const future = (await response.json().catch(() => null)) as FutureSessions | null;
  return future ? { ok: true, future } : { ok: false, reason: 'failed' };
}

/**
 * Removes a person from the team (`DELETE /api/v1/workspaces/{workspaceId}/team-members/{id}`,
 * F003 AC4). The API's rules are the only ones: it answers 409 for the last Owner, which the page
 * never offers, so it is worded like any other failure. A person with sessions coming answers 409
 * `has_future_sessions` with the counts: the page then asks for a handover (`removeWithHandover`).
 */
export function removeTeamMember(
  workspaceId: string,
  teamMemberId: string,
  fetchFn: typeof fetch = fetch,
): Promise<RemoveTeamMemberResult> {
  return remove(workspaceId, teamMemberId, undefined, fetchFn);
}

/**
 * Removes a person and hands their sessions over in one step (F023 AC9, AC9a, AC18): the next 2
 * weeks' private sessions go to `privateTo` or are cancelled, the class dates go to `classesTo` or
 * get *Trainer nodig*, every later session gets *Trainer nodig*, and the clients are told when
 * `notifyClients` says so.
 */
export function removeWithHandover(
  workspaceId: string,
  teamMemberId: string,
  handover: Handover,
  fetchFn: typeof fetch = fetch,
): Promise<RemoveTeamMemberResult> {
  return remove(workspaceId, teamMemberId, handover, fetchFn);
}

async function remove(
  workspaceId: string,
  teamMemberId: string,
  handover: Handover | undefined,
  fetchFn: typeof fetch,
): Promise<RemoveTeamMemberResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/team-members/${teamMemberId}`, {
      method: 'DELETE',
      ...(handover
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(handover) }
        : {}),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 204) return { ok: true };
  if (response.status === 200) {
    const done = (await response.json().catch(() => null)) as HandoverDone | null;
    return done ? { ok: true, handover: done } : { ok: true };
  }
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status === 409) {
    const refusal = (await response.json().catch(() => null)) as Partial<
      Schemas['RemoveTeamMemberRefusal']
    > | null;
    if (refusal?.code === 'has_future_sessions' && refusal.nextTwoWeeks && refusal.later) {
      return {
        ok: false,
        reason: 'hasFutureSessions',
        future: {
          teamMemberId,
          nextTwoWeeks: refusal.nextTwoWeeks,
          later: refusal.later,
          regularTrainerOfSeries: refusal.regularTrainerOfSeries ?? false,
          hasFutureSessions: true,
        },
      };
    }
  }
  return { ok: false, reason: 'generic' };
}
