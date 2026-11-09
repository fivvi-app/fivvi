export type RemoveTeamMemberResult =
  | { ok: true }
  /** Not signed in, or no longer allowed to remove anyone: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Removes a person from the team (`DELETE /api/v1/workspaces/{workspaceId}/team-members/{id}`,
 * F003 AC4). The API's rules are the only ones: it answers 409 for the last Owner, which the page
 * never offers, so it is worded like any other failure.
 */
export async function removeTeamMember(
  workspaceId: string,
  teamMemberId: string,
  fetchFn: typeof fetch = fetch,
): Promise<RemoveTeamMemberResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/team-members/${teamMemberId}`, {
      method: 'DELETE',
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 204) return { ok: true };
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  return { ok: false, reason: 'generic' };
}
