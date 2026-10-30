import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../server/api';
import { MyProfile } from './my-profile';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('myProfile');
  return { title: t('title') };
}

/**
 * TW-09 My profile (`/me/profile`, F003), reached from the user menu. The workspaces are read
 * from `GET /v1/me/workspaces`, so the page shows what the API holds. The route guard
 * (`proxy.ts`) keeps anonymous visitors out.
 */
export default async function MyProfilePage() {
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/me/workspaces', {
    headers: cookie ? { cookie } : {},
  });
  if (!data) throw new Error('GET /v1/me/workspaces did not answer with the workspaces.');
  return <MyProfile workspaces={data} />;
}
