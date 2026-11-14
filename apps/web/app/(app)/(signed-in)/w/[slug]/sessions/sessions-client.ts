import type { Schemas } from '@fivvi/contract';
import type { Locale } from '@fivvi/i18n';

export type Session = Schemas['Session'];
export type Trainer = Schemas['Trainer'];

/** The `sessions.form.errors.*` keys that word a refused field of the date and start. */
export type DateErrorKey = 'invalidDate';
export type StartErrorKey = 'timeDoesNotExist' | 'invalidTime';

/** What both forms (PS-01, PS-05) say about the time; the same fields are refused in the same words. */
export interface TimeInput {
  /** The date in the workspace's time zone: `YYYY-MM-DD`. */
  localDate: string;
  /** The start in the workspace's time zone: `HH:mm`. */
  localStart: string;
  durationMinutes: number;
  notify: boolean;
}

/** The refusals both calls share. */
type Refused =
  /** The API refused the date or the start: the form words it under the field and keeps the input. */
  | { ok: false; reason: 'fields'; date?: DateErrorKey; start?: StartErrorKey }
  /** The person may not do this (any more), for example a Trainer moving a colleague's session. */
  | { ok: false; reason: 'forbidden' }
  /** Not signed in: the signed-in home knows where this person belongs. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

export type PlanResult = { ok: true; session: Session } | Refused;

export type RescheduleResult =
  | { ok: true; session: Session }
  /** `session_changed`: someone else changed it first; `session_cancelled`: it was cancelled. Nothing was stored. */
  | {
      ok: false;
      reason: 'conflict';
      code: 'session_changed' | 'session_cancelled';
      /** The session as it is now: the form shows its values. */
      session: Session;
      /** Who changed it last; left out when unknown. */
      changedBy?: string;
    }
  | Refused;

/**
 * Plans a private session (`POST /api/v1/workspaces/{workspaceId}/sessions/private`, F020 AC1–AC5).
 * `trainerId` is left out to plan for oneself: a Trainer never sends it. The API decides every rule;
 * its 400 names the field, and a start the clocks skip comes back with the code
 * `time_does_not_exist`.
 */
export async function planPrivateSession(
  workspaceId: string,
  input: TimeInput & { clientId: string; trainerId?: string },
  fetchFn: typeof fetch = fetch,
): Promise<PlanResult> {
  const body: Schemas['PlanPrivateSessionRequest'] = {
    clientId: input.clientId,
    localDate: input.localDate,
    localStart: input.localStart,
    durationMinutes: input.durationMinutes,
    notify: input.notify,
  };
  if (input.trainerId) body.trainerId = input.trainerId;
  const answered = await send(`/api/v1/workspaces/${workspaceId}/sessions/private`, body, fetchFn);
  if ('failed' in answered) return answered.failed;
  if (answered.status !== 201) return refusal(answered.status, answered.body);
  const planned = answered.body as Schemas['PlannedPrivateSession'] | null;
  if (!planned?.session) return { ok: false, reason: 'generic' };
  return { ok: true, session: planned.session };
}

/**
 * Moves a private session (`POST …/sessions/{sessionId}/reschedule`, F020 AC6, AC8): `version` is
 * the one the person saw. A 409 comes back with the session as it is now and who changed it.
 */
export async function reschedulePrivateSession(
  workspaceId: string,
  sessionId: string,
  input: TimeInput & { version: number },
  fetchFn: typeof fetch = fetch,
): Promise<RescheduleResult> {
  const body: Schemas['ReschedulePrivateSessionRequest'] = {
    localDate: input.localDate,
    localStart: input.localStart,
    durationMinutes: input.durationMinutes,
    notify: input.notify,
    version: input.version,
  };
  const answered = await send(
    `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/reschedule`,
    body,
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 200) {
    const moved = answered.body as Schemas['ReschedulePrivateSessionResult'] | null;
    if (!moved?.session) return { ok: false, reason: 'generic' };
    return { ok: true, session: moved.session };
  }
  if (answered.status === 409) {
    const conflict = answered.body as Schemas['SessionConflict'] | null;
    if (!conflict?.session) return { ok: false, reason: 'generic' };
    return {
      ok: false,
      reason: 'conflict',
      code: conflict.code,
      session: conflict.session,
      ...(conflict.changedBy?.name ? { changedBy: conflict.changedBy.name } : {}),
    };
  }
  return refusal(answered.status, answered.body);
}

async function send(
  url: string,
  body: unknown,
  fetchFn: typeof fetch,
): Promise<{ status: number; body: unknown } | { failed: Refused }> {
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

/** The words for an answer that was not the success: the same for planning and moving. */
function refusal(status: number, body: unknown): Refused {
  if (status === 401) return { ok: false, reason: 'home' };
  if (status === 403) return { ok: false, reason: 'forbidden' };
  if (status === 400) {
    const issues = (body as Schemas['ValidationError'] | null)?.issues ?? [];
    const refused: Refused & { reason: 'fields' } = { ok: false, reason: 'fields' };
    for (const { path, code } of issues) {
      if (path === 'localDate') refused.date = 'invalidDate';
      if (path === 'localStart') {
        refused.start = code === 'time_does_not_exist' ? 'timeDoesNotExist' : 'invalidTime';
      }
    }
    if (refused.date || refused.start) return refused;
  }
  return { ok: false, reason: 'generic' };
}

/** What PS-01 needs to know about the workspace before it can be filled in. */
export interface PlanningContext {
  /** The workspace's IANA time zone: the form's date and start are in it. */
  timeZone: string;
  /** The workspace's default language for emails: a client without a language of their own follows it. */
  defaultLocale: Locale;
  /** The name of the location every new session takes (F016). */
  locationName: string;
  /** Every trainer of the workspace; empty for a person who plans only for themself. */
  trainers: Trainer[];
  /** The signed-in person's own team-member ID, when they train here; `null` otherwise. */
  myTrainerId: string | null;
}

export type PlanningContextResult =
  | { ok: true; context: PlanningContext }
  | { ok: false; reason: 'home' | 'failed' };

/**
 * Reads what PS-01 shows around its fields: the time zone (`GET …/workspaces/{id}`), the default
 * location (`GET …/locations`) and, for a person who plans for any trainer, the trainers
 * (`GET …/trainers`) with their own place among them. That place is found by the email address on
 * `GET …/team-members`, so the field can default to *{name} (ik)*; the API gives no "me" on a
 * trainer.
 */
export async function loadPlanningContext(
  workspaceId: string,
  { forAnyTrainer, email }: { forAnyTrainer: boolean; email: string },
  fetchFn: typeof fetch = fetch,
): Promise<PlanningContextResult> {
  const base = `/api/v1/workspaces/${workspaceId}`;
  try {
    const [workspace, locations, trainers, team] = await Promise.all([
      fetchFn(base),
      fetchFn(`${base}/locations`),
      forAnyTrainer ? fetchFn(`${base}/trainers`) : Promise.resolve(null),
      forAnyTrainer ? fetchFn(`${base}/team-members`) : Promise.resolve(null),
    ]);
    const answers = [workspace, locations, trainers].filter((answer) => answer !== null);
    if (answers.some(({ status }) => [401, 403, 404].includes(status))) {
      return { ok: false, reason: 'home' };
    }
    if (answers.some(({ status }) => status !== 200)) return { ok: false, reason: 'failed' };
    const { timeZone, defaultLocale } = (await workspace.json()) as Schemas['Workspace'];
    const places = (await locations.json()) as Schemas['Location'][];
    const location = places.find(({ isDefault }) => isDefault) ?? places[0];
    const trainerList = trainers ? ((await trainers.json()) as Trainer[]) : [];
    // The team list is a courtesy for the default; without it the field starts empty.
    const members =
      team?.status === 200
        ? ((await team.json()) as Schemas['TeamMember'][])
        : ([] as Schemas['TeamMember'][]);
    const mine = members.find((member) => member.email.toLowerCase() === email.toLowerCase());
    const myTrainerId = trainerList.find(({ id }) => id === mine?.id)?.id ?? null;
    if (!timeZone || !location) return { ok: false, reason: 'failed' };
    return {
      ok: true,
      context: {
        timeZone,
        defaultLocale,
        locationName: location.name,
        trainers: trainerList,
        myTrainerId,
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
