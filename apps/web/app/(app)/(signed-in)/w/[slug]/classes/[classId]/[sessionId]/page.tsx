import { trainerWordForms } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { catalogLocale } from '../../../../../../../../i18n/config';
import { apiClient } from '../../../../../../../../server/api';
import { currentTeamMemberId } from '../../../../../../../../server/my-team-member';
import { workspaceOf } from '../../../../../../../../server/workspace-of';
import { NoPermission } from '../../../settings/general/no-permission';
import { ClassDateView } from '../../class-date-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('classes');
  return { title: t('title') };
}

/**
 * CO-01 *Les op datum* (`/w/{slug}/classes/{classId}/{sessionId}`, F021): every team member with
 * `class.read` (the Owner and the Trainers) reads a class date of the workspace; the Owner, with
 * `class.manage`, also has **Wijzigen**. The date is read from
 * `GET /v1/workspaces/{workspaceId}/sessions/{sessionId}`. A session the workspace doesn't have, one
 * that is no class date and one of another class are a 404.
 */
export default async function ClassDatePage({
  params,
}: PageProps<'/w/[slug]/classes/[classId]/[sessionId]'>) {
  const { slug: slugParam, classId, sessionId } = await params;
  const { id, name, slug, capabilities, trainerWord } = await workspaceOf(slugParam);
  if (!capabilities.includes('class.read')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data: session, response } = await apiClient.GET(
    '/v1/workspaces/{workspaceId}/sessions/{sessionId}',
    { params: { path: { workspaceId: id, sessionId } }, headers: cookie ? { cookie } : {} },
  );
  if (response.status === 404 || response.status === 400) notFound();
  if (!session) {
    throw new Error('GET /v1/workspaces/{workspaceId}/sessions/{sessionId} did not answer.');
  }
  if (session.type !== 'group' || session.groupClass?.id !== classId) notFound();
  const canManage = capabilities.includes('class.manage');
  // PS-07 on CO-04 (only the Owner changes a date): the date of the person's own, as a trainer, is "Je hebt dan al iets".
  const ownDate =
    canManage &&
    session.trainer !== undefined &&
    (await currentTeamMemberId(id)) === session.trainer.id;
  return (
    <ClassDateView
      workspaceId={id}
      slug={slug}
      session={session}
      canManage={canManage}
      ownDate={ownDate}
      trainerWord={trainerWordForms(trainerWord, catalogLocale(await getLocale()))}
    />
  );
}
