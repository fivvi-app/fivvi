import { trainerWordForms } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { catalogLocale } from '../../../../../../i18n/config';
import { apiClient } from '../../../../../../server/api';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../settings/general/no-permission';
import { ClassList } from './class-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('classes');
  return { title: t('title') };
}

/**
 * TW-03 *Lessen* (`/w/{slug}/classes`, F021): a person with `class.manage` (the Owner) sees the
 * workspace's classes, read from `GET /v1/workspaces/{workspaceId}/group-classes`. Anyone else on
 * the team sees the no-permission page naming the workspace (AC7); the API answers their create,
 * change and schedule requests with 403.
 */
export default async function ClassesPage({ params }: PageProps<'/w/[slug]/classes'>) {
  const { id, name, slug, capabilities, trainerWord } = await workspaceOf((await params).slug);
  if (!capabilities.includes('class.manage')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}/group-classes', {
    params: { path: { workspaceId: id } },
    headers: cookie ? { cookie } : {},
  });
  if (!data) throw new Error('GET /v1/workspaces/{workspaceId}/group-classes did not answer.');
  return (
    <ClassList
      slug={slug}
      classes={data}
      trainerWord={trainerWordForms(trainerWord, catalogLocale(await getLocale()))}
    />
  );
}
