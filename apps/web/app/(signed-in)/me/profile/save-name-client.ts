import { refusedFields } from '../../validation-issues';

/** The `myProfile.errors.*` catalog key that words a refused name. */
export type NameErrorKey = 'nameRequired' | 'nameTooLong';

export type SaveNameResult =
  | { ok: true }
  /** The API refused the name: the page shows the message under the field; nothing changed. */
  | { ok: false; reason: 'name'; error: NameErrorKey }
  /** The sign-in ended: the person signs in again. */
  | { ok: false; reason: 'signedOut' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Saves the person's own name (`PATCH /api/v1/me`, F005). Nothing is checked before the request:
 * the API's rules are the only ones, and its validation codes (`too_small` is an empty or blank
 * name, `too_big` a long one) word the field error.
 */
export async function saveName(
  name: string,
  fetchFn: typeof fetch = fetch,
): Promise<SaveNameResult> {
  let response: Response;
  try {
    response = await fetchFn('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 200) return { ok: true };
  if (response.status === 401) return { ok: false, reason: 'signedOut' };
  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null);
    const { name: refusal } = refusedFields(body);
    if (refusal) {
      return {
        ok: false,
        reason: 'name',
        error: refusal === 'tooLong' ? 'nameTooLong' : 'nameRequired',
      };
    }
  }
  return { ok: false, reason: 'generic' };
}
