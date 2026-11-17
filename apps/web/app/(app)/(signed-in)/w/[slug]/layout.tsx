import type { ReactNode } from 'react';
import { workspaceOf } from '../../../../../server/workspace-of';
import { WorkspaceShell } from './workspace-shell';

/**
 * Every page of `/w/{slug}` is a page of a workspace the signed-in person has a team role in
 * (F002): any other slug goes to the signed-in home. The frame is `WorkspaceShell`.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  return (
    <WorkspaceShell workspace={await workspaceOf((await params).slug)}>{children}</WorkspaceShell>
  );
}
