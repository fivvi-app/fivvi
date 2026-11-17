import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../settings/general/no-permission';
import { JoinLinkCard } from './join-link-card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('joinLink');
  return { title: t('title') };
}

/**
 * The Aanmeldlink page (`/w/{slug}/join-link`, F029): a person with `join_link.view` sees the
 * workspace's join link and copies it, and with `join_link.renew` renews it. A person without
 * `join_link.view` sees the no-permission page naming the workspace; the API answers their read
 * with 403 as well. The link is read from `GET /v1/workspaces/{workspaceId}/join-link`, so the
 * page shows what the API holds.
 */
export default async function JoinLinkPage({ params }: PageProps<'/w/[slug]/join-link'>) {
  const { id, name, capabilities } = await workspaceOf((await params).slug);
  if (!capabilities.includes('join_link.view')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}/join-link', {
    params: { path: { workspaceId: id } },
    headers: cookie ? { cookie } : {},
  });
  if (!data) throw new Error('GET /v1/workspaces/{workspaceId}/join-link did not answer.');
  return (
    <JoinLinkCard
      workspaceId={id}
      url={data.url}
      canRenew={capabilities.includes('join_link.renew')}
    />
  );
}
