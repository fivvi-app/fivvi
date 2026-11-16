export type InvitationAnswer = 'accept' | 'decline';

export type AnswerResult =
  /** Accepted: the workspace to open (its URL name). */
  | { ok: true; answer: 'accept'; slug: string }
  | { ok: true; answer: 'decline' }
  /** The signed-in account's address is not the one the invitation is for (403). */
  | { ok: false; reason: 'wrongAccount' }
  /** Expired, withdrawn, used or unknown: one neutral answer (404). */
  | { ok: false; reason: 'noLongerValid' }
  /** The sign-in session ended (401). */
  | { ok: false; reason: 'signIn' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Accepts or declines the invitation with `token`
 * (`POST /api/v1/invitations/{token}/accept` and `…/decline`, F011 AC3, AC5, AC6). The API decides
 * who may answer and whether the invitation is still open; accepting answers with the workspace
 * the person is now on the team of.
 */
export async function answerInvitation(
  token: string,
  answer: InvitationAnswer,
  fetchFn: typeof fetch = fetch,
): Promise<AnswerResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/invitations/${encodeURIComponent(token)}/${answer}`, {
      method: 'POST',
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 403) return { ok: false, reason: 'wrongAccount' };
  if (response.status === 404) return { ok: false, reason: 'noLongerValid' };
  if (response.status === 401) return { ok: false, reason: 'signIn' };
  if (answer === 'decline') {
    return response.status === 204 ? { ok: true, answer } : { ok: false, reason: 'generic' };
  }
  if (response.status !== 200) return { ok: false, reason: 'generic' };
  const workspace = (await response.json().catch(() => null)) as { slug?: unknown } | null;
  return typeof workspace?.slug === 'string' && workspace.slug !== ''
    ? { ok: true, answer, slug: workspace.slug }
    : { ok: false, reason: 'generic' };
}
