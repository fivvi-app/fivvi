import { trainerWordForms } from '@fivvi/i18n';
import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { catalogLocale } from '../../../../../../i18n/config';
import { apiClient } from '../../../../../../server/api';
import { currentPageApiHeaders } from '../../../../../../server/page-api-headers';
import { currentTrainsAnywhere } from '../../../../../../server/signed-in';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../settings/general/no-permission';
import { toggleShown } from './dashboard-model';
import { OwnerDashboard } from './owner-dashboard';

/** The tab says which workspace this is, as the placeholder home did: the Dashboard is the same page for every workspace. */
export async function generateMetadata({ params }: PageProps<'/w/[slug]'>): Promise<Metadata> {
  const { name } = await workspaceOf((await params).slug);
  return { title: name };
}

/**
 * The Owner's *Dashboard* (`/w/{slug}`, F014 WC-01): today in the workspace, read in one request
 * from `GET /v1/workspaces/{workspaceId}/day` (the rows of the day and *Aandacht nodig*). It is
 * the Owner's (`calendar.manage`): a Trainer's home is *Mijn dag* (F013), and the signed-in home
 * sends them there, as does this address (`my-day`, which also remembers the workspace, F012 AC4);
 * a team member who does not train sees the no-permission page. The toggle
 * *Mijn dag | {workspace}* is for an Owner with a trainer profile who has a team.
 */
export default async function WorkspaceDashboardPage({ params }: PageProps<'/w/[slug]'>) {
  const workspace = await workspaceOf((await params).slug);
  if (!workspace.capabilities.includes('calendar.manage')) {
    // A Trainer's home is *Mijn dag* (F013): `my-day` remembers this workspace and opens it.
    if (await currentTrainsAnywhere()) redirect(`/w/${workspace.slug}/my-day` as Route);
    return <NoPermission workspace={workspace.name} />;
  }
  // The page's language goes along: the API names the classes in it for an account with no stored one (#1595).
  const authorization = await currentPageApiHeaders();
  const [day, trainers, trains] = await Promise.all([
    apiClient.GET('/v1/workspaces/{workspaceId}/day', {
      params: { path: { workspaceId: workspace.id } },
      headers: authorization,
    }),
    apiClient.GET('/v1/workspaces/{workspaceId}/trainers', {
      params: { path: { workspaceId: workspace.id } },
      headers: authorization,
    }),
    currentTrainsAnywhere(),
  ]);
  if (!day.data || !trainers.data) throw new Error('The workspace day did not answer.');
  return (
    <OwnerDashboard
      day={day.data}
      now={new Date().toISOString()}
      workspace={workspace.name}
      slug={workspace.slug}
      teamMemberId={workspace.teamMemberId}
      trainerWord={trainerWordForms(workspace.trainerWord, catalogLocale(await getLocale()))}
      showToggle={toggleShown({
        trains,
        trainerIds: trainers.data.map(({ id }) => id),
        ownId: workspace.teamMemberId,
      })}
    />
  );
}
