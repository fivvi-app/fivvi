import type { Schemas } from '@fivvi/contract';
import { refusedFields } from '../../../validation-issues';

export type TrainerInvitation = Schemas['TrainerInvitation'];

/** What the invite dialog holds: an empty language follows the account's, then the workspace's. */
export interface InviteInput {
  name: string;
  email: string;
  emailLocale: 'nl-NL' | 'en' | '';
}

/** The `team.invite.errors.*` catalog keys that word a refused field. */
export type InviteNameErrorKey = 'nameRequired' | 'nameTooLong';
export type InviteEmailErrorKey = 'emailRequired' | 'emailInvalid';

export type InviteResult =
  | { ok: true; invitation: TrainerInvitation }
  /** A field was refused: the dialog words it under the field and keeps what was typed. */
  | { ok: false; reason: 'fields'; name?: InviteNameErrorKey; email?: InviteEmailErrorKey }
  /** The address has a team role in the workspace (F011 AC8): nothing was sent. */
  | { ok: false; reason: 'alreadyOnTeam' }
  /** The address has a pending invitation (F011 AC8): the dialog offers to send that one again. */
  | { ok: false; reason: 'alreadyInvited'; invitationId: string }
  /** The workspace made its 20 invitations of the last 24 hours (F011 AC10). */
  | { ok: false; reason: 'tooMany' }
  /** Not signed in, or no longer allowed to invite: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Invites a trainer (`POST /api/v1/workspaces/{workspaceId}/trainer-invitations`, F011 AC1, AC2,
 * AC8). A blank name or address is refused here with no request, so the dialog shows its message
 * at once; the rest is the API's call. A 409 says why nothing was sent (`already_on_team`, or
 * `invitation_pending` with the invitation to send again) and a 429 that the day is full.
 */
export async function inviteTrainer(
  workspaceId: string,
  { name, email, emailLocale }: InviteInput,
  fetchFn: typeof fetch = fetch,
): Promise<InviteResult> {
  const blank: InviteResult & { reason: 'fields' } = { ok: false, reason: 'fields' };
  if (!name.trim()) blank.name = 'nameRequired';
  if (!email.trim()) blank.email = 'emailRequired';
  if (blank.name || blank.email) return blank;
  const body: Schemas['CreateTrainerInvitationRequest'] = {
    name: name.trim(),
    email: email.trim(),
  };
  if (emailLocale) body.emailLocale = emailLocale;
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/trainer-invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 201) {
    const invitation = (await response.json().catch(() => null)) as TrainerInvitation | null;
    return invitation ? { ok: true, invitation } : { ok: false, reason: 'generic' };
  }
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status === 429) return { ok: false, reason: 'tooMany' };
  const problem = (await response.json().catch(() => null)) as {
    code?: string;
    invitationId?: string;
    issues?: { path?: unknown; code?: unknown }[];
  } | null;
  if (response.status === 409) {
    if (problem?.code === 'already_on_team') return { ok: false, reason: 'alreadyOnTeam' };
    if (problem?.code === 'invitation_pending' && problem.invitationId) {
      return { ok: false, reason: 'alreadyInvited', invitationId: problem.invitationId };
    }
  }
  if (response.status === 400) {
    const refused = refusedFields(problem);
    const failure: InviteResult & { reason: 'fields' } = { ok: false, reason: 'fields' };
    if (refused.name) failure.name = refused.name === 'tooLong' ? 'nameTooLong' : 'nameRequired';
    const refusedEmail = problem?.issues?.filter(({ path }) => path === 'email');
    if (refusedEmail?.length) {
      failure.email = refusedEmail.some(({ code }) => code === 'invalid_type')
        ? 'emailRequired'
        : 'emailInvalid';
    }
    if (failure.name || failure.email) return failure;
  }
  return { ok: false, reason: 'generic' };
}

export type ChangeInvitationResult =
  | { ok: true }
  /** Not signed in, or no longer allowed to manage invitations: the page asks again. */
  | { ok: false; reason: 'home' }
  /** The invitation is not pending any more (answered, withdrawn or sent again elsewhere). */
  | { ok: false; reason: 'gone' }
  | { ok: false; reason: 'noConnection' | 'generic' };

async function change(
  url: string,
  method: 'POST' | 'DELETE',
  successStatus: 200 | 204,
  fetchFn: typeof fetch,
): Promise<ChangeInvitationResult> {
  let response: Response;
  try {
    response = await fetchFn(url, { method });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === successStatus) return { ok: true };
  if (response.status === 404) return { ok: false, reason: 'gone' };
  if ([401, 403].includes(response.status)) return { ok: false, reason: 'home' };
  return { ok: false, reason: 'generic' };
}

/**
 * Sends a pending invitation again
 * (`POST /api/v1/workspaces/{workspaceId}/trainer-invitations/{id}/resend`, F011 AC7): a new link
 * and a new expiry, and the old link stops working.
 */
export function resendInvitation(
  workspaceId: string,
  invitationId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ChangeInvitationResult> {
  return change(
    `/api/v1/workspaces/${workspaceId}/trainer-invitations/${invitationId}/resend`,
    'POST',
    200,
    fetchFn,
  );
}

/**
 * Withdraws a pending invitation
 * (`DELETE /api/v1/workspaces/{workspaceId}/trainer-invitations/{id}`, F011 AC7): its link stops
 * working and it leaves the list.
 */
export function withdrawInvitation(
  workspaceId: string,
  invitationId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ChangeInvitationResult> {
  return change(
    `/api/v1/workspaces/${workspaceId}/trainer-invitations/${invitationId}`,
    'DELETE',
    204,
    fetchFn,
  );
}
