import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../general/no-permission';
import { LocationForm } from './location-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settingsLocation');
  return { title: t('title') };
}

/**
 * TW-08, Settings → Location (`/w/{slug}/settings/locations`, F015): the Owner names the
 * workspace's one location and gives it an address. A Trainer sees the no-permission page naming
 * the workspace (AC6); the API refuses their change with 403 as well. The location is read from
 * `GET /v1/workspaces/{workspaceId}/locations`, so the page shows what the API holds. At go-live
 * the list holds exactly one location, the default, which comes first.
 */
export default async function LocationSettingsPage({
  params,
}: PageProps<'/w/[slug]/settings/locations'>) {
  const { id, name, capabilities } = await workspaceOf((await params).slug);
  if (!capabilities.includes('settings.manage')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}/locations', {
    params: { path: { workspaceId: id } },
    headers: cookie ? { cookie } : {},
  });
  const location = data?.[0];
  if (!location) {
    throw new Error('GET /v1/workspaces/{workspaceId}/locations did not answer with a location.');
  }
  return (
    <LocationForm
      workspaceId={id}
      locationId={location.id}
      name={location.name}
      type={location.type}
      address={location.address}
    />
  );
}
