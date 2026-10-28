import { cache } from 'react';
import { destinationOf } from './destination';
import { currentMe, redirectTo } from './signed-in';

/**
 * The workspace of `/w/{slug}` for the signed-in person: one of the workspaces they have a team
 * role in. For any other slug the person goes, in one redirect, to the page they belong at (their
 * own workspace, TW-11 or the no-access page, as the signed-in home decides): the page says
 * nothing about whether the slug is a workspace, and shows no page of someone else's. (The "no
 * permission" page of the spec is for a team member who lacks a role, F004; here there is no
 * place at all, which the API answers with a 404 and a page with a redirect.)
 */
export const workspaceOf = cache(async (slug: string) => {
  const me = await currentMe();
  const workspace = me.workspaces.find((candidate) => candidate.slug === slug);
  if (!workspace) redirectTo(destinationOf(me));
  return workspace;
});
