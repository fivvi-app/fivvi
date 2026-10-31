import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../../settings/general/no-permission';
import { ClientProfile } from '../client-profile';
import { PAGE_SIZE } from '../clients-client';
import { findClient } from '../find-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('clients.profile');
  return { title: t('title') };
}

/**
 * TW-02 Klantprofiel (`/w/{slug}/clients/{id}`, F006): the plain profile a quick add opens. A
 * person without `clients.view` sees the no-permission page; a client the workspace doesn't have is
 * a 404. The client is read from the workspace's client list (`findClient`) until the read API for
 * one client is in the contract, so the page shows what the API holds.
 */
export default async function ClientProfilePage({
  params,
  searchParams,
}: PageProps<'/w/[slug]/clients/[id]'>) {
  const { slug: slugParam, id: clientId } = await params;
  const { id, name, slug, capabilities } = await workspaceOf(slugParam);
  if (!capabilities.includes('clients.view')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const authorization = cookie ? { cookie } : {};
  const client = await findClient(clientId, async (page) => {
    const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}/clients', {
      params: { path: { workspaceId: id }, query: { pageSize: PAGE_SIZE, page } },
      headers: authorization,
    });
    if (!data) throw new Error('GET /v1/workspaces/{workspaceId}/clients did not answer.');
    return data;
  });
  if (!client) notFound();
  const workspace = await apiClient.GET('/v1/workspaces/{workspaceId}', {
    params: { path: { workspaceId: id } },
    headers: authorization,
  });
  if (!workspace.data) throw new Error('GET /v1/workspaces/{workspaceId} did not answer.');
  const { added } = await searchParams;
  return (
    <ClientProfile
      client={client}
      slug={slug}
      defaultLocale={workspace.data.defaultLocale}
      added={added === '1'}
    />
  );
}
