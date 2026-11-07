import type { Schemas } from '@fivvi/contract';

export type ChangeTeamMemberRoleResult =
  | { ok: true }
  /** Not signed in, or no longer allowed to change roles: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  /** The change would leave the workspace without an Owner (someone else changed the team first). */
  | { ok: false; reason: 'lastOwner' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Makes a team member an Owner or a Trainer
 * (`PATCH /api/v1/workspaces/{workspaceId}/team-members/{id}`, F004 AC4). The API's rules are the
 * only ones: it answers 409 `last_owner` when no Owner would be left, which the page never
 * offers, but two Owners can race.
 */
export async function changeTeamMemberRole(
  workspaceId: string,
  teamMemberId: string,
  role: Schemas['ChangeTeamMemberRole']['role'],
  fetchFn: typeof fetch = fetch,
): Promise<ChangeTeamMemberRoleResult> {
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/team-members/${teamMemberId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 200) return { ok: true };
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    if (body?.code === 'last_owner') return { ok: false, reason: 'lastOwner' };
  }
  return { ok: false, reason: 'generic' };
}
