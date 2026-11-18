import { trainerWordForms } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { catalogLocale } from '../../../../../../../i18n/config';
import { apiClient } from '../../../../../../../server/api';
import { workspaceOf } from '../../../../../../../server/workspace-of';
import { NoPermission } from '../../settings/general/no-permission';
import { SessionView } from '../session-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sessions');
  return { title: t('title') };
}

/**
 * The page of a private session (`/w/{slug}/sessions/{id}`, F020): the one the snackbar of PS-01
 * opens. A person without `clients.view` sees the no-permission page; a session the workspace
 * doesn't have (the API answers 404 for another workspace's too, 400 for an id that is no UUID)
 * and one that is no private session are a 404. The session is read from
 * `GET /v1/workspaces/{workspaceId}/sessions/{sessionId}`, so the page shows what the API holds.
 */
export default async function SessionPage({ params }: PageProps<'/w/[slug]/sessions/[id]'>) {
  const { slug: slugParam, id: sessionId } = await params;
  const { id, name, slug, capabilities, trainerWord } = await workspaceOf(slugParam);
  if (!capabilities.includes('clients.view')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const authorization = cookie ? { cookie } : {};
  const { data: session, response } = await apiClient.GET(
    '/v1/workspaces/{workspaceId}/sessions/{sessionId}',
    { params: { path: { workspaceId: id, sessionId } }, headers: authorization },
  );
  if (response.status === 404 || response.status === 400) notFound();
  if (!session) {
    throw new Error('GET /v1/workspaces/{workspaceId}/sessions/{sessionId} did not answer.');
  }
  const participant = session.participants[0];
  if (session.type !== 'private' || !participant) notFound();
  const { data: client } = await apiClient.GET('/v1/workspaces/{workspaceId}/clients/{clientId}', {
    params: { path: { workspaceId: id, clientId: participant.clientId } },
    headers: authorization,
  });
  if (!client)
    throw new Error('GET /v1/workspaces/{workspaceId}/clients/{clientId} did not answer.');
  const { data: workspace } = await apiClient.GET('/v1/workspaces/{workspaceId}', {
    params: { path: { workspaceId: id } },
    headers: authorization,
  });
  if (!workspace) throw new Error('GET /v1/workspaces/{workspaceId} did not answer.');
  return (
    <SessionView
      workspaceId={id}
      slug={slug}
      session={session}
      client={client}
      defaultLocale={workspace.defaultLocale}
      canMove={
        capabilities.includes('session.private.manage.own') ||
        capabilities.includes('session.private.manage.any')
      }
      trainerWord={trainerWordForms(trainerWord, catalogLocale(await getLocale()))}
    />
  );
}
