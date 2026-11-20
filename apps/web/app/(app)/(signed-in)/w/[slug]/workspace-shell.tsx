import type { Schemas } from '@fivvi/contract';
import { trainerWordForms } from '@fivvi/i18n';
import { PortalDensity } from '@fivvi/ui/kit/portal-density';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { catalogLocale } from '../../../../../i18n/config';
import { apiClient } from '../../../../../server/api';
import {
  currentMe,
  currentMyWorkspaces,
  currentTrainsAnywhere,
} from '../../../../../server/signed-in';
import type { NewSessionProps } from './sessions/new-private-session';
import { WorkspaceFrame } from './workspace-frame';

type NewSessionFrame = Omit<NewSessionProps, 'slug'>;

/**
 * The frame of a page with the sidebar of one workspace the signed-in person has a team role in:
 * every page of `/w/{slug}` (F002), and the personal pages `/me/day` and `/me/calendar` (F013),
 * which show the sidebar of the workspace this browser opens (F012). The frame shows the workspace name, the
 * navigation and, for a person who may add clients, the top bar's + Nieuw; the group *Persoonlijk*
 * is in it for a person with a trainer profile.
 */
export async function WorkspaceShell({
  workspace: { id, name, slug, role, capabilities, trainerWord },
  onPersonalPage = false,
  children,
}: {
  workspace: Schemas['MeWorkspace'];
  /**
   * The frame of a personal page (`/me/day`, `/me/calendar`): PS-01 in the top bar plans the
   * person's own private session in a workspace of their choice (**Werkruimte**), not in this one.
   */
  onPersonalPage?: boolean;
  children: ReactNode;
}) {
  const me = await currentMe();
  // Adding a client (the top bar's + Nieuw, the list's button) names the workspace's default
  // language in its form, which only `GET /v1/workspaces/{workspaceId}` tells.
  const quickAdd = capabilities.includes('clients.manage') ? await quickAddOf(id) : undefined;
  // PS-01 (F020) in the top bar's + Nieuw, for a person who may plan private sessions.
  const locale = catalogLocale(await getLocale());
  let newSession: NewSessionFrame | undefined;
  if (onPersonalPage) {
    // The workspaces where the person trains and may plan their own sessions (F013, AC11).
    const places = (await currentMyWorkspaces()).filter(
      (place) => place.trainsHere && place.capabilities.includes('session.private.manage.own'),
    );
    const start = places.find((place) => place.workspaceId === id) ?? places[0];
    if (start) {
      newSession = {
        workspaceId: start.workspaceId,
        email: me.email,
        personName: me.name,
        forAnyTrainer: false,
        canAddClients: start.capabilities.includes('clients.manage'),
        trainerWord: trainerWordForms(start.trainerWord, locale),
        workspaces: places.map((place) => ({
          workspaceId: place.workspaceId,
          slug: place.slug,
          name: place.name,
          canAddClients: place.capabilities.includes('clients.manage'),
          trainerWord: trainerWordForms(place.trainerWord, locale),
        })),
      };
    }
  } else {
    const forAnyTrainer = capabilities.includes('session.private.manage.any');
    if (forAnyTrainer || capabilities.includes('session.private.manage.own')) {
      newSession = {
        workspaceId: id,
        email: me.email,
        personName: me.name,
        forAnyTrainer,
        canAddClients: capabilities.includes('clients.manage'),
        trainerWord: trainerWordForms(trainerWord, locale),
      };
    }
  }
  // *Lessen* and *Groepsles* in + Nieuw (F021), for a person who manages classes.
  const groupClasses = capabilities.includes('class.manage')
    ? { workspaceId: id, trainerWord: trainerWordForms(trainerWord, locale) }
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
        groupClasses={groupClasses}
        personalPages={await currentTrainsAnywhere()}
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
