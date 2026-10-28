import type { ReactNode } from 'react';
import { workspaceOf } from '../../../../server/workspace-of';

/**
 * Every page of `/w/{slug}` is a page of a workspace the signed-in person has a team role in
 * (F002): any other slug goes to the signed-in home. The navigation with the workspace name and
 * the person's role (`information-architecture.md §4.1`) joins here with F013/F014.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  await workspaceOf((await params).slug);
  return children;
}
