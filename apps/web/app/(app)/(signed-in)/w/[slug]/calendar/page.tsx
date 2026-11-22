import { weekDates } from '@fivvi/domain/calendar-grid';
import { localDateOf } from '@fivvi/domain/zoned-time';
import { trainerWordForms } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { catalogLocale } from '../../../../../../i18n/config';
import { apiClient } from '../../../../../../server/api';
import { currentMe } from '../../../../../../server/signed-in';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../settings/general/no-permission';
import { type CalendarView, WorkspaceCalendarView } from './workspace-calendar';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workspaceCalendar');
  return { title: t('title') };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VIEWS: readonly CalendarView[] = ['day', 'week', 'list'];

/**
 * *Agenda* (`/w/{slug}/calendar?view=…&date=…`, F014): the week of `date` (today when it is none)
 * of the workspace, read in one request from `GET /v1/workspaces/{workspaceId}/calendar`; the
 * day and the list views show the same answer. Every team member with `calendar.read` sees it,
 * the Owner with the actions of `calendar.manage`. The API records `workspace_calendar_viewed`
 * (the workspace and the platform, no personal data).
 */
export default async function WorkspaceCalendarPage({
  params,
  searchParams,
}: PageProps<'/w/[slug]/calendar'>) {
  const { slug } = await params;
  const query = await searchParams;
  const workspace = await workspaceOf(slug);
  if (!workspace.capabilities.includes('calendar.read')) {
    return <NoPermission workspace={workspace.name} />;
  }
  const cookie = (await headers()).get('cookie');
  const authorization = cookie ? { cookie } : {};
  const asked = typeof query.date === 'string' && DATE.test(query.date) ? query.date : undefined;
  const me = await currentMe();
  // The week is read on the workspace's wall clock, so "today" is its day too (ADR-012).
  const zone = await timeZoneOf(workspace.id, authorization);
  const today = localDateOf(new Date(), zone);
  // A date that is none (30 February) is no date either: the week of today then.
  const date =
    asked && localDateOf(new Date(`${asked}T12:00:00Z`), 'UTC') === asked ? asked : today;
  const days = weekDates(date);
  const [calendar, trainers] = await Promise.all([
    apiClient.GET('/v1/workspaces/{workspaceId}/calendar', {
      params: {
        path: { workspaceId: workspace.id },
        query: { from: days[0] ?? date, to: days[6] ?? date },
      },
      headers: authorization,
    }),
    apiClient.GET('/v1/workspaces/{workspaceId}/trainers', {
      params: { path: { workspaceId: workspace.id } },
      headers: authorization,
    }),
  ]);
  if (!calendar.data || !trainers.data) throw new Error('The workspace calendar did not answer.');
  const can = (capability: (typeof workspace.capabilities)[number]) =>
    workspace.capabilities.includes(capability);
  return (
    <WorkspaceCalendarView
      calendar={calendar.data}
      date={date}
      today={today}
      initialView={VIEWS.find((option) => option === query.view)}
      trainers={trainers.data}
      trainerWord={trainerWordForms(workspace.trainerWord, catalogLocale(await getLocale()))}
      slug={workspace.slug}
      workspaceId={workspace.id}
      accountId={me.id}
      access={{
        canMoveAny: can('session.private.manage.any'),
        canMoveOwn: can('session.private.manage.own'),
        canChangeClasses: can('class.manage'),
        canSeeClients: can('clients.view'),
        teamMemberId: workspace.teamMemberId,
      }}
    />
  );
}

/** The workspace's time zone (`GET /v1/workspaces/{workspaceId}`). */
async function timeZoneOf(workspaceId: string, authorization: { cookie?: string }) {
  const { data } = await apiClient.GET('/v1/workspaces/{workspaceId}', {
    params: { path: { workspaceId } },
    headers: authorization,
  });
  if (!data) throw new Error('GET /v1/workspaces/{workspaceId} did not answer.');
  return data.timeZone;
}
