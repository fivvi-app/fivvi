import type { Locale } from '@fivvi/i18n';

export type SetDefaultLocaleResult =
  | { ok: true }
  /** Not signed in, or no longer allowed to set it: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Sets the workspace's default communication language
 * (`PATCH /api/v1/workspaces/{workspaceId}`, F010 AC7). The page offers only the two catalog
 * languages, so a `400` is not a field error a person can fix: it is a generic failure.
 */
export async function setDefaultLocale(
  workspaceId: string,
  defaultLocale: Locale,
  fetchFn: typeof fetch = fetch,
): Promise<SetDefaultLocaleResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultLocale }),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 200) return { ok: true };
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  return { ok: false, reason: 'generic' };
}
