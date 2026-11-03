import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../server/api';
import { workspaceOf } from '../../../../../server/workspace-of';
import { NoPermission } from '../settings/general/no-permission';
import { ClientList } from './client-list';
import { PAGE_SIZE } from './clients-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('clients');
  return { title: t('title') };
}

/**
 * TW-01 Klanten (`/w/{slug}/clients`, F006): a person with `clients.view` (the Owner and every
 * Trainer) sees the whole client list of the workspace, sorted by name, and searches it. A person
 * without `clients.view` sees the no-permission page naming the workspace; the API answers their
 * list request with 403 or 404 as well. The first page is read from
 * `GET /v1/workspaces/{workspaceId}/clients`, so the page shows what the API holds; adding a
 * client needs `clients.manage`, which the frame turns into the add dialog.
 */
export default async function ClientsPage({ params }: PageProps<'/w/[slug]/clients'>) {
  const { id, name, slug, capabilities } = await workspaceOf((await params).slug);
  if (!capabilities.includes('clients.view')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}/clients', {
    params: { path: { workspaceId: id }, query: { pageSize: PAGE_SIZE } },
    headers: cookie ? { cookie } : {},
  });
  if (!data) throw new Error('GET /v1/workspaces/{workspaceId}/clients did not answer.');
  return <ClientList workspaceId={id} slug={slug} initial={data} />;
}
