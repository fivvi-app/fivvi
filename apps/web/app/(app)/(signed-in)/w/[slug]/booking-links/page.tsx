import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../../../server/api';
import { workspaceOf } from '../../../../../../server/workspace-of';
import { NoPermission } from '../settings/general/no-permission';
import { BookingLinksView } from './booking-links-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bookingLinks');
  return { title: t('title') };
}

/**
 * TW-07 *Boekingslinks* (`/w/{slug}/booking-links`, F037; F029's *Aanmeldlink* page, whose address
 * redirects here): every team member with `booking_link.copy` (the Owner and the Trainers) sees the
 * join link, when they have `join_link.view`, and the booking links; the Owner (`booking_link.manage`)
 * also makes and deactivates them. Anyone else on the team sees the no-permission page. The links
 * are read from `GET /v1/workspaces/{workspaceId}/booking-links` (the first read makes the standing
 * links), so the page shows what the API holds.
 */
export default async function BookingLinksPage({ params }: PageProps<'/w/[slug]/booking-links'>) {
  const { id, name, capabilities } = await workspaceOf((await params).slug);
  if (!capabilities.includes('booking_link.copy')) return <NoPermission workspace={name} />;
  const cookie = (await headers()).get('cookie');
  const init = { headers: cookie ? { cookie } : {} };
  const canManage = capabilities.includes('booking_link.manage');
  const [links, join, classes] = await Promise.all([
    apiClient.GET('/v1/workspaces/{workspaceId}/booking-links', {
      params: { path: { workspaceId: id } },
      ...init,
    }),
    capabilities.includes('join_link.view')
      ? apiClient.GET('/v1/workspaces/{workspaceId}/join-link', {
          params: { path: { workspaceId: id } },
          ...init,
        })
      : null,
    canManage
      ? apiClient.GET('/v1/workspaces/{workspaceId}/group-classes', {
          params: { path: { workspaceId: id } },
          ...init,
        })
      : null,
  ]);
  if (!links.data)
    throw new Error('GET /v1/workspaces/{workspaceId}/booking-links did not answer.');
  if (join && !join.data) {
    throw new Error('GET /v1/workspaces/{workspaceId}/join-link did not answer.');
  }
  if (classes && !classes.data) {
    throw new Error('GET /v1/workspaces/{workspaceId}/group-classes did not answer.');
  }
  return (
    <BookingLinksView
      workspaceId={id}
      join={
        join?.data
          ? { url: join.data.url, canRenew: capabilities.includes('join_link.renew') }
          : null
      }
      links={links.data.links}
      classes={classes?.data ?? []}
      canManage={canManage}
    />
  );
}
