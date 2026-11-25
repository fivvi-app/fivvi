import { PERSONAL_TIME_ZONE } from '@fivvi/domain';
import { localDateOf } from '@fivvi/domain/zoned-time';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { currentPageApiHeaders } from '../../../../../../server/page-api-headers';
import { currentMe } from '../../../../../../server/signed-in';
import { startWorkspace } from '../../../../../../server/start-workspace';
import { LAST_WORKSPACE_COOKIE } from '../../../../last-workspace';
import { toggleShown } from '../../../w/[slug]/(dashboard)/dashboard-model';
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
 * trainer profile. An Owner who has a team in the workspace of the frame gets the toggle
 * *Mijn dag | {workspace}* back to their Dashboard (F014, `toggleShown`).
 */
export default async function MyDayPage() {
  const now = new Date();
  // The page's language goes along: the API names the classes in it for an account with no stored one (#1595).
  const authorization = await currentPageApiHeaders();
  // The frame is the one of the workspace this browser opens (`PersonalLayout`).
  const frame = startWorkspace(
    (await currentMe()).workspaces,
    (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value,
  );
  const owns = frame?.capabilities.includes('calendar.manage') ? frame : undefined;
  const [{ data }, trainers] = await Promise.all([
    apiClient.GET('/v1/me/day', {
      params: { query: { date: localDateOf(now, PERSONAL_TIME_ZONE) } },
      headers: authorization,
    }),
    owns
      ? apiClient.GET('/v1/workspaces/{workspaceId}/trainers', {
          params: { path: { workspaceId: owns.id } },
          headers: authorization,
        })
      : undefined,
  ]);
  if (!data) throw new Error('GET /v1/me/day did not answer with the day.');
  // This page is for people who train, so the Owner trains: the toggle is for a team.
  const toggle =
    owns &&
    trainers?.data &&
    toggleShown({
      trains: true,
      trainerIds: trainers.data.map(({ id }) => id),
      ownId: owns.teamMemberId,
    })
      ? { slug: owns.slug, name: owns.name }
      : undefined;
  return <MyDayView day={data} now={now} workspace={toggle} />;
}
