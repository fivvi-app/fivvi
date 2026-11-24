import { trainerWordForms } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { catalogLocale } from '../../../../../../i18n/config';
import { apiClient } from '../../../../../../server/api';
import { currentMe } from '../../../../../../server/signed-in';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../settings/general/no-permission';
import { TeamList } from './team-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('team');
  return { title: t('title') };
}

/**
 * TW-06 Trainers (`/w/{slug}/trainers`, F003, F004): a person with `team.view` sees the team, and
 * with `team.manage` changes roles and removes a trainer. A person without `team.view` sees the
 * no-permission page naming the workspace (AC3); the API answers their team-list request with 403
 * as well. The team is read from `GET /v1/workspaces/{workspaceId}/team-members` and who trains from
 * `GET /v1/workspaces/{workspaceId}/trainers` (F005, the trainer badge), so the page shows what
 * the API holds. With `team.invite` (the Owner, F011) it also reads the pending invitations from
 * `GET /v1/workspaces/{workspaceId}/trainer-invitations`; a Trainer's page asks for none.
 */
export default async function TrainersPage({ params }: PageProps<'/w/[slug]/trainers'>) {
  const { id, name, capabilities, trainerWord } = await workspaceOf((await params).slug);
  if (!capabilities.includes('team.view')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const authorization = cookie ? { cookie } : {};
  const path = { params: { path: { workspaceId: id } }, headers: authorization };
  const canInvite = capabilities.includes('team.invite');
  const [{ data }, { data: trainers }, { email }, invitations, workspace] = await Promise.all([
    apiClient.GET('/v1/workspaces/{workspaceId}/team-members', path),
    apiClient.GET('/v1/workspaces/{workspaceId}/trainers', path),
    currentMe(),
    canInvite ? apiClient.GET('/v1/workspaces/{workspaceId}/trainer-invitations', path) : undefined,
    canInvite ? apiClient.GET('/v1/workspaces/{workspaceId}', path) : undefined,
  ]);
  if (!data) throw new Error('GET /v1/workspaces/{workspaceId}/team-members did not answer.');
  if (!trainers) throw new Error('GET /v1/workspaces/{workspaceId}/trainers did not answer.');
  if (canInvite && !invitations?.data) {
    throw new Error('GET /v1/workspaces/{workspaceId}/trainer-invitations did not answer.');
  }
  if (canInvite && !workspace?.data) {
    throw new Error('GET /v1/workspaces/{workspaceId} did not answer.');
  }
  return (
    <TeamList
      workspaceId={id}
      workspaceName={name}
      members={data}
      canManage={capabilities.includes('team.manage')}
      trainerIds={trainers.map(({ id: teamMemberId }) => teamMemberId)}
      currentEmail={email}
      trainerWord={trainerWordForms(trainerWord, catalogLocale(await getLocale()))}
      canInvite={canInvite}
      invitations={invitations?.data ?? []}
      {...(workspace?.data
        ? { defaultLocale: workspace.data.defaultLocale, timeZone: workspace.data.timeZone }
        : {})}
    />
  );
}
