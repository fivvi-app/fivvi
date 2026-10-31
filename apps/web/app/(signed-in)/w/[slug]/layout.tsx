import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { apiClient } from '../../../../server/api';
import { currentMe } from '../../../../server/signed-in';
import { workspaceOf } from '../../../../server/workspace-of';
import { WorkspaceFrame } from './workspace-frame';

/**
 * Every page of `/w/{slug}` is a page of a workspace the signed-in person has a team role in
 * (F002): any other slug goes to the signed-in home. The frame shows the workspace name, the
 * navigation and, for a person who may add clients, the top bar's + Nieuw; the rest of the navigation joins it with F013/F014.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { id, name, slug, role, capabilities } = await workspaceOf((await params).slug);
  const me = await currentMe();
  // Adding a client (the top bar's + Nieuw, the list's button) names the workspace's default
  // language in its form, which only `GET /v1/workspaces/{workspaceId}` tells.
  const quickAdd = capabilities.includes('clients.manage') ? await quickAddOf(id) : undefined;
  return (
    <WorkspaceFrame
      name={name}
      slug={slug}
      teamRole={role}
      capabilities={capabilities}
      personName={me.name}
      quickAdd={quickAdd}
    >
      {children}
    </WorkspaceFrame>
  );
}

/** The workspace's default language for the quick-add form; none when the API doesn't answer. */
async function quickAddOf(workspaceId: string) {
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}', {
    params: { path: { workspaceId } },
    headers: cookie ? { cookie } : {},
  });
  return data ? { workspaceId, defaultLocale: data.defaultLocale } : undefined;
}
