import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { GeneralForm } from './general-form';
import { NoPermission } from './no-permission';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settingsGeneral');
  return { title: t('title') };
}

/**
 * TW-08, Settings → General (`/w/{slug}/settings/general`, F002): the Owner renames the
 * workspace. A Trainer sees the no-permission page naming the workspace (AC7); the API refuses
 * their rename with 403 as well. The workspace is read from `GET /v1/workspaces/{workspaceId}`,
 * so the page shows what the API holds, not what the signed-in list remembers.
 */
export default async function GeneralSettingsPage({
  params,
}: PageProps<'/w/[slug]/settings/general'>) {
  const { id, name, role } = await workspaceOf((await params).slug);
  if (role !== 'owner') return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}', {
    params: { path: { workspaceId: id } },
    headers: cookie ? { cookie } : {},
  });
  if (!data) throw new Error('GET /v1/workspaces/{workspaceId} did not answer with the workspace.');
  return (
    <GeneralForm workspaceId={data.id} name={data.name} slug={data.slug} timeZone={data.timeZone} />
  );
}
