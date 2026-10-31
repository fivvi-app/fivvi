import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../server/api';
import { workspaceOf } from '../../../../../server/workspace-of';
import { NoPermission } from '../settings/general/no-permission';
import { TeamList } from './team-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('team');
  return { title: t('title') };
}

/**
 * TW-06 Trainers (`/w/{slug}/trainers`, F003): the Owner sees the team and removes a trainer. A
 * Trainer sees the no-permission page naming the workspace (AC3); the API answers their team-list
 * request with 403 as well. The team is read from `GET /v1/workspaces/{workspaceId}/team-members`,
 * so the page shows what the API holds.
 */
export default async function TrainersPage({ params }: PageProps<'/w/[slug]/trainers'>) {
  const { id, name, role } = await workspaceOf((await params).slug);
  if (role !== 'owner') return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}/team-members', {
    params: { path: { workspaceId: id } },
    headers: cookie ? { cookie } : {},
  });
  if (!data) throw new Error('GET /v1/workspaces/{workspaceId}/team-members did not answer.');
  return <TeamList workspaceId={id} workspaceName={name} members={data} />;
}
