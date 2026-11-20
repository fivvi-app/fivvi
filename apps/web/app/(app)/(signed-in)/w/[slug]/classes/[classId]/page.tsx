import { trainerWordForms } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { catalogLocale } from '../../../../../../../i18n/config';
import { apiClient } from '../../../../../../../server/api';
import { workspaceOf } from '../../../../../../../server/workspace-of';
import { NoPermission } from '../../settings/general/no-permission';
import { ClassView } from '../class-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('classes');
  return { title: t('title') };
}

/**
 * The page of a class (`/w/{slug}/classes/{classId}`, F021): a person with `class.manage` sees it
 * and puts the class on a date from it. Anyone else on the team sees the no-permission page. A
 * class the workspace doesn't have (the API answers 404 for another workspace's too, 400 for an id
 * that is no UUID) is a 404.
 */
export default async function ClassPage({ params }: PageProps<'/w/[slug]/classes/[classId]'>) {
  const { slug: slugParam, classId } = await params;
  const { id, name, slug, capabilities, trainerWord } = await workspaceOf(slugParam);
  if (!capabilities.includes('class.manage')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data: groupClass, response } = await apiClient.GET(
    '/v1/workspaces/{workspaceId}/group-classes/{classId}',
    { params: { path: { workspaceId: id, classId } }, headers: cookie ? { cookie } : {} },
  );
  if (response.status === 404 || response.status === 400) notFound();
  if (!groupClass) {
    throw new Error('GET /v1/workspaces/{workspaceId}/group-classes/{classId} did not answer.');
  }
  return (
    <ClassView
      slug={slug}
      groupClass={groupClass}
      canManage
      trainerWord={trainerWordForms(trainerWord, catalogLocale(await getLocale()))}
    />
  );
}
