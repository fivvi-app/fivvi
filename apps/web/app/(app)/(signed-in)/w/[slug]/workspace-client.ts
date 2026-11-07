import { LAST_WORKSPACE_COOKIE, LAST_WORKSPACE_MAX_AGE } from '../../../last-workspace';

/**
 * Tells the API that the person switched to a workspace (F012):
 * `POST /api/v1/workspaces/{workspaceId}/switched` records the product event `workspace_switched`
 * with the workspace ID and the surface (`web`, since no bearer token goes along) and stores
 * nothing about the current workspace (AC10). Only the sign-in cookie goes with it, no body.
 * Counting is no reason to hold the person up: whatever fails is left unsaid.
 */
export async function reportSwitch(
  workspaceId: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchFn(`/api/v1/workspaces/${workspaceId}/switched`, {
      method: 'POST',
      keepalive: true,
    });
  } catch {
    // The switch itself is in the URL; the event is only a count.
  }
}

/**
 * Remembers the workspace last used in this browser (F012, AC4): its URL name in the first-party
 * cookie `fivvi_last_workspace`, which the signed-in home reads. Per browser, never per account,
 * and no personal data.
 */
export function rememberWorkspace(
  slug: string,
  target: { cookie: string } = document,
  secure: boolean = window.location.protocol === 'https:',
): void {
  target.cookie =
    `${LAST_WORKSPACE_COOKIE}=${slug}; path=/; max-age=${LAST_WORKSPACE_MAX_AGE}; samesite=lax` +
    (secure ? '; secure' : '');
}
