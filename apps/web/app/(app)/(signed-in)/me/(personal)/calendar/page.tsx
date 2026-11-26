import { PERSONAL_TIME_ZONE } from '@fivvi/domain';
import { weekDates } from '@fivvi/domain/calendar-grid';
import { localDateOf } from '@fivvi/domain/zoned-time';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { currentPageApiHeaders } from '../../../../../../server/page-api-headers';
import { currentMyWorkspaces } from '../../../../../../server/signed-in';
import { type CalendarView, MyCalendarView } from './my-calendar';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('myCalendar');
  return { title: t('title') };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VIEWS: readonly CalendarView[] = ['day', 'week', 'list'];

/**
 * *Mijn agenda* (`/me/calendar?view=…&date=…`, F013): the week of `date` (today when it is none)
 * of the signed-in trainer across all their workspaces, read in one request from
 * `GET /v1/me/sessions`; the day and the list views show the same answer. The API records
 * `my_calendar_viewed` for the request (the platform and the number of workspaces, no personal
 * data). The layout keeps out anyone without a trainer profile.
 */
export default async function MyCalendarPage({ searchParams }: PageProps<'/me/calendar'>) {
  const query = await searchParams;
  const today = localDateOf(new Date(), PERSONAL_TIME_ZONE);
  const asked = typeof query.date === 'string' && DATE.test(query.date) ? query.date : undefined;
  // A date that is none (30 February) is no date either: the week of today then.
  const date =
    asked && localDateOf(new Date(`${asked}T12:00:00Z`), 'UTC') === asked ? asked : today;
  const days = weekDates(date);
  const view = VIEWS.find((option) => option === query.view);
  // The page's language goes along: the API names the classes in it for an account with no stored one (#1595).
  const authorization = await currentPageApiHeaders();
  const [{ data }, workspaces] = await Promise.all([
    apiClient.GET('/v1/me/sessions', {
      params: { query: { from: days[0] ?? date, to: days[6] ?? date } },
      headers: authorization,
    }),
    currentMyWorkspaces(),
  ]);
  if (!data) throw new Error('GET /v1/me/sessions did not answer with the sessions.');
  return (
    <MyCalendarView
      calendar={data}
      date={date}
      today={today}
      initialView={view}
      workspaces={workspaces
        .filter(({ trainsHere }) => trainsHere)
        .map(({ workspaceId, name }) => ({ id: workspaceId, name }))}
    />
  );
}
