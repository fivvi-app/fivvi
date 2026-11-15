import { trainerWordForms } from '@fivvi/i18n';
import { PortalDensity } from '@fivvi/ui/kit/portal-density';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { catalogLocale } from '../../../../../i18n/config';
import { apiClient } from '../../../../../server/api';
import { currentMe } from '../../../../../server/signed-in';
import { workspaceOf } from '../../../../../server/workspace-of';
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
  const { id, name, slug, role, capabilities, trainerWord } = await workspaceOf(
    (await params).slug,
  );
  const me = await currentMe();
  // Adding a client (the top bar's + Nieuw, the list's button) names the workspace's default
  // language in its form, which only `GET /v1/workspaces/{workspaceId}` tells.
  const quickAdd = capabilities.includes('clients.manage') ? await quickAddOf(id) : undefined;
  // PS-01 (F020) in the top bar's + Nieuw, for a person who may plan private sessions.
  const forAnyTrainer = capabilities.includes('session.private.manage.any');
  const newSession =
    forAnyTrainer || capabilities.includes('session.private.manage.own')
      ? {
          workspaceId: id,
          email: me.email,
          personName: me.name,
          forAnyTrainer,
          canAddClients: capabilities.includes('clients.manage'),
          trainerWord: trainerWordForms(trainerWord, catalogLocale(await getLocale())),
        }
      : undefined;
  return (
    // The frame is compact; the dialogs and menus opened in it render in a portal, which would be
    // `<body>` at the touch density, so the portal host sits next to the frame at the same one (E020).
    <PortalDensity density="compact">
      <WorkspaceFrame
        name={name}
        slug={slug}
        teamRole={role}
        workspaces={me.workspaces}
        canCreateWorkspace={me.canCreateWorkspace}
        capabilities={capabilities}
        personName={me.name}
        quickAdd={quickAdd}
        newSession={newSession}
      >
        {children}
      </WorkspaceFrame>
    </PortalDensity>
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
