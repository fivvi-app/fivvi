export type RenewJoinLinkResult =
  | { ok: true; url: string }
  /** Not signed in, or no longer allowed to renew: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Renews the join link of the workspace
 * (`POST /api/v1/workspaces/{workspaceId}/join-link/renew`, F029 AC6) and returns the new URL. The
 * API's rules are the only ones: only the Owner may, and the old link stops working at once. The
 * web sends no body (the API records the renewal with surface `web`).
 */
export async function renewJoinLink(
  workspaceId: string,
  fetchFn: typeof fetch = fetch,
): Promise<RenewJoinLinkResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/join-link/renew`, {
      method: 'POST',
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status !== 200) return { ok: false, reason: 'generic' };
  const body = (await response.json().catch(() => null)) as { url?: unknown } | null;
  return typeof body?.url === 'string'
    ? { ok: true, url: body.url }
    : { ok: false, reason: 'generic' };
}
