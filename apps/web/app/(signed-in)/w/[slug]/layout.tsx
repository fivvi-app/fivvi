import type { ReactNode } from 'react';
import { currentMe } from '../../../../server/signed-in';
import { workspaceOf } from '../../../../server/workspace-of';
import { WorkspaceFrame } from './workspace-frame';

/**
 * Every page of `/w/{slug}` is a page of a workspace the signed-in person has a team role in
 * (F002): any other slug goes to the signed-in home. The frame shows the workspace name and the
 * navigation; the rest of the navigation joins it with F013/F014.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { name, slug, role } = await workspaceOf((await params).slug);
  const me = await currentMe();
  return (
    <WorkspaceFrame name={name} slug={slug} teamRole={role} personName={me.name}>
      {children}
    </WorkspaceFrame>
  );
}
