import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { currentMe } from './signed-in';

/**
 * The workspace of `/w/{slug}` for the signed-in person: one of the workspaces they have a team
 * role in. For any other slug the page is the signed-in home, which sends them where they belong
 * (their own workspace, TW-11 or the no-access page): it says nothing about whether the slug is
 * a workspace, and shows no page of someone else's. (The "no permission" page of the spec is for
 * a team member who lacks a role, F004; here there is no place at all, which the API answers
 * with a 404 and a page with a redirect.)
 */
export const workspaceOf = cache(async (slug: string) => {
  const { workspaces } = await currentMe();
  const workspace = workspaces.find((candidate) => candidate.slug === slug);
  if (!workspace) redirect(SIGNED_IN_HOME);
  return workspace;
});
