import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import {
  currentMe,
  currentTrainsAnywhere,
  homeDestination,
  redirectTo,
} from '../../../../../server/signed-in';
import { startWorkspace } from '../../../../../server/start-workspace';
import { LAST_WORKSPACE_COOKIE } from '../../../last-workspace';
import { NoAccess } from '../../home/no-access';
import { WorkspaceShell } from '../../w/[slug]/workspace-shell';

/**
 * The personal pages (`/me/day`, `/me/calendar`, F013): everything assigned to the person across
 * all their workspaces, for anyone with a trainer profile in at least one. They sit in the frame
 * of the workspace this browser opens (F012, `startWorkspace`), as the sidebar of
 * `information-architecture.md §4.1` draws them, with *Persoonlijk* above the workspace's own
 * pages. Anyone else has no personal pages: a person on a team who does not train (an Owner without
 * a trainer profile) goes where the signed-in home sends them, and an account on no team, such as
 * a client, sees the no-access state (AC12, AC13).
 */
export default async function PersonalLayout({ children }: { children: ReactNode }) {
  const me = await currentMe();
  const workspace = (await currentTrainsAnywhere())
    ? startWorkspace(me.workspaces, (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value)
    : undefined;
  if (!workspace) {
    const destination = await homeDestination(me);
    if (destination.to !== 'no-access') redirectTo(destination);
    return <NoAccess />;
  }
  return <WorkspaceShell workspace={workspace}>{children}</WorkspaceShell>;
}
