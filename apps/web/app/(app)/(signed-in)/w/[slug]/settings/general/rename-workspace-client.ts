import { refusedFields } from '../../../../validation-issues';

/** The `settingsGeneral.errors.*` catalog key that words a refused name. */
export type NameErrorKey = 'nameRequired' | 'nameTooLong';

export type RenameWorkspaceResult =
  | { ok: true }
  /** The API refused the name: the page shows the message under the field; nothing changed. */
  | { ok: false; reason: 'name'; error: NameErrorKey }
  /** Not signed in, or no longer allowed to rename it: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Renames the workspace (`PATCH /api/v1/workspaces/{workspaceId}`, AC6). Like the first-run
 * screen, it checks nothing before it asks: the API's rules are the only ones, and its validation
 * codes (`too_small` is an empty or blank name, `too_big` a long one) word the field error.
 */
export async function renameWorkspace(
  workspaceId: string,
  name: string,
  fetchFn: typeof fetch = fetch,
): Promise<RenameWorkspaceResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 200) return { ok: true };
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
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
