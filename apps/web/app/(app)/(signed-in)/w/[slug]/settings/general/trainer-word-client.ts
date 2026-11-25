import type { TrainerWord } from '@fivvi/i18n';

export type SetTrainerWordResult =
  | { ok: true }
  /** Not signed in, or no longer allowed to set it: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Sets the workspace's word for its trainers (`PATCH /api/v1/workspaces/{workspaceId}`, F068
 * AC1). The page offers only the four choices, so a `400` or `422` is not a field error a person
 * can fix: it is a generic failure.
 */
export async function setTrainerWord(
  workspaceId: string,
  trainerWord: TrainerWord,
  fetchFn: typeof fetch = fetch,
): Promise<SetTrainerWordResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trainerWord }),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 200) return { ok: true };
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  return { ok: false, reason: 'generic' };
}
