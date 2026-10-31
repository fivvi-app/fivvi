import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../general/no-permission';
import { LanguageForm } from './language-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settingsLanguage');
  return { title: t('title') };
}

/**
 * TW-08, Settings → Language (`/w/{slug}/settings/language`, F010): the Owner sets the
 * workspace's default communication language. A Trainer sees the no-permission page naming the
 * workspace (AC8); the API refuses their change with 403 as well. The language is read from
 * `GET /v1/workspaces/{workspaceId}`, so the page shows what the API holds.
 */
export default async function LanguageSettingsPage({
  params,
}: PageProps<'/w/[slug]/settings/language'>) {
  const { id, name, capabilities } = await workspaceOf((await params).slug);
  if (!capabilities.includes('workspace.manage')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}', {
    params: { path: { workspaceId: id } },
    headers: cookie ? { cookie } : {},
  });
  if (!data) throw new Error('GET /v1/workspaces/{workspaceId} did not answer with the workspace.');
  return <LanguageForm workspaceId={data.id} defaultLocale={data.defaultLocale} />;
}
