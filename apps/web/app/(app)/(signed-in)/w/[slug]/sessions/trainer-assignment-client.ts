import type { Schemas } from '@fivvi/contract';
import { type Session, type TrainerConflictRefusal, trainerConflict } from './sessions-client';

export type TrainerCandidates = Schemas['TrainerCandidates'];
export type TrainerCandidate = Schemas['TrainerCandidate'];

export type CandidatesResult =
  | { ok: true; candidates: TrainerCandidates }
  /** Not signed in, or not allowed (any more): the signed-in home knows where this person belongs. */
  | { ok: false; reason: 'home' | 'failed' };

/**
 * Reads the trainers a session can go to (`GET …/sessions/{sessionId}/trainer-candidates`, F023
 * AC3, AC17): each with what they already have at that time in this workspace, and how many
 * clients the email would reach for each scope. The API decides all of it; the dialog words it.
 */
export async function loadTrainerCandidates(
  workspaceId: string,
  sessionId: string,
  fetchFn: typeof fetch = fetch,
): Promise<CandidatesResult> {
  let response: Response;
  try {
    response = await fetchFn(
      `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/trainer-candidates`,
    );
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status !== 200) return { ok: false, reason: 'failed' };
  const candidates = (await response.json().catch(() => null)) as TrainerCandidates | null;
  return candidates ? { ok: true, candidates } : { ok: false, reason: 'failed' };
}

/** What the dialog sends: who, for which dates, on which version of the session, and the notify box. */
export interface AssignInput {
  /** The new trainer's team-member ID. */
  trainerId: string;
  /** For a class date; a private session sends none. */
  scope?: 'this' | 'following';
  /** The `version` of the session the person saw. */
  version: number;
  /** The box *{n} deelnemers informeren per e-mail* / *{client} informeren per e-mail*. */
  notifyClients: boolean;
  /** *Toch opslaan* (PS-07): save although the trainer has something then. Left out, the API warns. */
  allowConflicts?: boolean;
}

export type AssignResult =
  | { ok: true; session: Session; clientsNotified: number }
  /** The new trainer already has something then (`409` `trainer_conflict`): PS-07, and nothing was stored. */
  | TrainerConflictRefusal
  /** Someone changed the session first (`session_changed`), or it was cancelled: nothing was stored. */
  | {
      ok: false;
      reason: 'conflict';
      code: 'session_changed' | 'session_cancelled';
      /** The session as it is now. */
      session: Session;
      /** Who changed it last; left out when unknown. */
      changedBy?: string;
    }
  /** The person may not assign (any more): F023 AC12, AC13. */
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Gives a session another trainer (`POST …/sessions/{sessionId}/trainer`, F023 AC1, AC2, AC8):
 * the API checks every rule, including the double booking (PS-07), and sends the email to the
 * clients when `notifyClients` says so.
 */
export async function assignTrainer(
  workspaceId: string,
  sessionId: string,
  input: AssignInput,
  fetchFn: typeof fetch = fetch,
): Promise<AssignResult> {
  const body: Schemas['AssignTrainerRequest'] = {
    trainerId: input.trainerId,
    version: input.version,
    notifyClients: input.notifyClients,
  };
  if (input.scope) body.scope = input.scope;
  if (input.allowConflicts) body.allowConflicts = true;
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/trainer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  const answer: unknown = await response.json().catch(() => null);
  if (response.status === 200) {
    const assigned = answer as Schemas['TrainerAssigned'] | null;
    if (!assigned?.session) return { ok: false, reason: 'generic' };
    return { ok: true, session: assigned.session, clientsNotified: assigned.clientsNotified };
  }
  if (response.status === 409) {
    const refusal = answer as Schemas['AssignTrainerRefusal'] | null;
    if (refusal?.code === 'trainer_conflict') return trainerConflict(refusal);
    if (!refusal?.session) return { ok: false, reason: 'generic' };
    return {
      ok: false,
      reason: 'conflict',
      code: refusal.code,
      session: refusal.session,
      ...(refusal.changedBy?.name ? { changedBy: refusal.changedBy.name } : {}),
    };
  }
  if (response.status === 401) return { ok: false, reason: 'home' };
  if (response.status === 403) return { ok: false, reason: 'forbidden' };
  return { ok: false, reason: 'generic' };
}
