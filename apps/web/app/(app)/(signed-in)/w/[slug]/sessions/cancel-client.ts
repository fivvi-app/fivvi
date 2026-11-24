import type { Schemas } from '@fivvi/contract';
import type { Session } from './sessions-client';

export type CancelledPrivateSession = Schemas['CancelledPrivateSession'];
export type CancelledClassDate = Schemas['CancelledClassDate'];
export type ClassCancellationPreview = Schemas['ClassCancellationPreview'];

type Failed =
  /** The person may not cancel this (any more), for example a Trainer on a colleague's session. */
  | { ok: false; reason: 'forbidden' }
  /** Not signed in: the signed-in home knows where this person belongs. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * `session_changed`: someone else changed it first; `session_cancelled`: it was cancelled already.
 * Nothing was stored; `session` is how it is now and `changedBy` who changed it last, when known.
 */
export type CancelConflict = {
  ok: false;
  reason: 'conflict';
  code: 'session_changed' | 'session_cancelled';
  session: Session;
  changedBy?: string;
};

export type CancelPrivateResult =
  | ({ ok: true } & CancelledPrivateSession)
  | CancelConflict
  | Failed;
export type CancelClassResult = ({ ok: true } & CancelledClassDate) | CancelConflict | Failed;
export type CancelPreviewResult =
  | { ok: true; preview: ClassCancellationPreview }
  /** `session_cancelled`: the date was cancelled already. */
  | { ok: false; reason: 'cancelled' | 'forbidden' | 'home' | 'failed' };

/**
 * Cancels a private session (`POST …/sessions/{sessionId}/cancel`, F026 AC1, AC2, PS-06):
 * `initiator` is *De klant* (`client`) or *Wij* (`workspace`), `notify` the email box, `version` the
 * one the person saw. The API decides every rule; a 409 comes back with the session as it is now.
 */
export async function cancelPrivateSession(
  workspaceId: string,
  sessionId: string,
  input: Schemas['CancelPrivateSessionRequest'],
  fetchFn: typeof fetch = fetch,
): Promise<CancelPrivateResult> {
  const answered = await post(
    `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/cancel`,
    { initiator: input.initiator, notify: input.notify, version: input.version },
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 200) {
    const cancelled = answered.body as CancelledPrivateSession | null;
    if (!cancelled?.session) return { ok: false, reason: 'generic' };
    return { ok: true, ...cancelled };
  }
  return refusal(answered.status, answered.body);
}

/**
 * Cancels a class date, or this one and the rest of its series (`POST …/sessions/{sessionId}/cancel-class`,
 * F026 AC6, AC7, CO-03, the Owner): `message` goes to the participants as typed; a blank one is left out.
 */
export async function cancelClassDate(
  workspaceId: string,
  sessionId: string,
  input: Schemas['CancelClassDateRequest'],
  fetchFn: typeof fetch = fetch,
): Promise<CancelClassResult> {
  const body: Schemas['CancelClassDateRequest'] = { scope: input.scope, version: input.version };
  if (input.message?.trim()) body.message = input.message;
  const answered = await post(
    `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/cancel-class`,
    body,
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 200) {
    const cancelled = answered.body as CancelledClassDate | null;
    if (!cancelled?.session) return { ok: false, reason: 'generic' };
    return { ok: true, ...cancelled };
  }
  return refusal(answered.status, answered.body);
}

/**
 * What cancelling a class date would do (`GET …/sessions/{sessionId}/cancel-preview`, CO-03): how
 * many people get the email for each scope, and whether the date has started. Stores nothing.
 */
export async function loadCancelPreview(
  workspaceId: string,
  sessionId: string,
  fetchFn: typeof fetch = fetch,
): Promise<CancelPreviewResult> {
  let response: Response;
  try {
    response = await fetchFn(
      `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/cancel-preview`,
    );
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (response.status === 401) return { ok: false, reason: 'home' };
  if (response.status === 403) return { ok: false, reason: 'forbidden' };
  if (response.status === 409) return { ok: false, reason: 'cancelled' };
  if (response.status !== 200) return { ok: false, reason: 'failed' };
  const preview = (await response.json().catch(() => null)) as ClassCancellationPreview | null;
  return preview?.thisDate ? { ok: true, preview } : { ok: false, reason: 'failed' };
}

async function post(
  url: string,
  body: unknown,
  fetchFn: typeof fetch,
): Promise<{ status: number; body: unknown } | { failed: Failed }> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { failed: { ok: false, reason: 'noConnection' } };
  }
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** The words for an answer that was not the success. */
function refusal(status: number, body: unknown): CancelConflict | Failed {
  if (status === 401) return { ok: false, reason: 'home' };
  if (status === 403) return { ok: false, reason: 'forbidden' };
  if (status === 409) {
    const refused = body as Schemas['CancelPrivateSessionRefusal'] | null;
    if (!refused?.session) return { ok: false, reason: 'generic' };
    return {
      ok: false,
      reason: 'conflict',
      code: refused.code,
      session: refused.session,
      ...(refused.changedBy?.name ? { changedBy: refused.changedBy.name } : {}),
    };
  }
  return { ok: false, reason: 'generic' };
}
