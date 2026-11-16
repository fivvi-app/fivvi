import { PERSONAL_TIME_ZONE } from '@fivvi/domain';
import { localDateOf } from '@fivvi/domain/zoned-time';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { MyDayView } from './my-day';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('myDay');
  return { title: t('title') };
}

/**
 * *Mijn dag* (`/me/day`, F013): today's sessions of the signed-in trainer across all their
 * workspaces, read from `GET /v1/me/day` (the API reads each workspace on its own and merges the
 * answers), so the page shows what the API holds and nothing else. Today is the day in Dutch time,
 * the only zone of the personal scope. The API records `my_day_viewed` for this request (the
 * platform and the number of workspaces, no personal data). The layout keeps out anyone without a
 * trainer profile.
 */
export default async function MyDayPage() {
  const now = new Date();
  const cookie = (await headers()).get('cookie');
  const { data } = await apiClient.GET('/v1/me/day', {
    params: { query: { date: localDateOf(now, PERSONAL_TIME_ZONE) } },
    headers: cookie ? { cookie } : {},
  });
  if (!data) throw new Error('GET /v1/me/day did not answer with the day.');
  return <MyDayView day={data} now={now} />;
}
