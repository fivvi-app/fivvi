import { trainerWordForms } from '@fivvi/i18n';
import type { Metadata, Route } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
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
 * and one that is neither a private session nor a class date are a 404; a class date goes to CO-01.
 * `?move=1` (the calendar's *Verplaatsen*) opens PS-05 at once; `?edit=1` (*Wijzigen*) opens CO-04;
 * `?cancel=1` (the quick view's *Annuleren*, F026) opens PS-06 for a person who may cancel the session;
 * `?assign=1` (the quick view's and *Aandacht nodig*'s *Trainer toewijzen*, F023) opens the trainer dialog for the Owner. The session is read from
 * `GET /v1/workspaces/{workspaceId}/sessions/{sessionId}`, so the page shows what the API holds.
 */
export default async function SessionPage({
  params,
  searchParams,
}: PageProps<'/w/[slug]/sessions/[id]'>) {
  const { slug: slugParam, id: sessionId } = await params;
  const { move, edit, assign, cancel } = await searchParams;
  const { id, name, slug, capabilities, trainerWord, teamMemberId } = await workspaceOf(slugParam);
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
  // The calendar (F014) links every block to `/sessions/{id}`: a class date is CO-01's page.
  if (session.type === 'group' && session.groupClass) {
    // `?edit=1` (the calendar's *Wijzigen*) goes on to CO-04.
    const date = `/w/${slugParam}/classes/${session.groupClass.id}/${sessionId}`;
    // `?assign=1` (the calendar's *Trainer toewijzen*, *Aandacht nodig*'s *Toewijzen*) opens CO-02,
    // `?cancel=1` (the calendar's *Les annuleren*) opens CO-03.
    redirect(
      (edit === '1'
        ? `${date}?edit=1`
        : assign === '1'
          ? `${date}?assign=1`
          : cancel === '1'
            ? `${date}?cancel=1`
            : date) as Route,
    );
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
      teamMemberId={teamMemberId}
      canCancel={
        capabilities.includes('session.private.cancel.any') ||
        (capabilities.includes('session.private.cancel.own') &&
          session.trainer?.id === teamMemberId)
      }
      startMoving={move === '1'}
      startCancelling={cancel === '1'}
      {...(capabilities.includes('session.assign')
        ? { assign: { workspaceName: name, startOpen: assign === '1' } }
        : {})}
      trainerWord={trainerWordForms(trainerWord, catalogLocale(await getLocale()))}
    />
  );
}
