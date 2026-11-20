import { headers } from 'next/headers';
import { myTeamMemberId } from '../app/(app)/(signed-in)/w/[slug]/sessions/my-team-member';
import { apiClient } from './api';
import { currentMe } from './signed-in';

/**
 * The signed-in person's own team-member ID in a workspace, for the pages that word PS-07 (a
 * session or class date that is the person's own: "Je hebt dan al iets"); `null` when they are not
 * on the team or the list can't be read, which words the warning with the trainer's name.
 */
export async function currentTeamMemberId(workspaceId: string): Promise<string | null> {
  const cookie = (await headers()).get('cookie');
  const { data: team } = await apiClient.GET('/v1/workspaces/{workspaceId}/team-members', {
    params: { path: { workspaceId } },
    headers: cookie ? { cookie } : {},
  });
  if (!team) return null;
  return myTeamMemberId(team, (await currentMe()).email);
}
