export type SetTrainsHereResult =
  | { ok: true }
  /** The sign-in ended: the person signs in again. */
  | { ok: false; reason: 'signedOut' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Switches whether the signed-in Owner trains in a workspace (F005): `PUT` gives them their own
 * trainer profile, `DELETE` takes it away (`/api/v1/workspaces/{workspaceId}/trainer-profile`).
 * The routes act on the caller alone, so no team member is named. The API's rules are the only
 * ones: it answers 403 for a Trainer and 404 for a person with no place on the team.
 */
export async function setTrainsHere(
  workspaceId: string,
  trains: boolean,
  fetchFn: typeof fetch = fetch,
): Promise<SetTrainsHereResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/trainer-profile`, {
      method: trains ? 'PUT' : 'DELETE',
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 200 || response.status === 204) return { ok: true };
  if (response.status === 401) return { ok: false, reason: 'signedOut' };
  return { ok: false, reason: 'generic' };
}
