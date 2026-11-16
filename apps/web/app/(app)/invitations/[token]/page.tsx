import { loginPath } from '@fivvi/auth/return-path';
import type { Metadata, Route } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiClient } from '../../../../server/api';
import { loadMe } from '../../../../server/me';
import { InvitationCard, type InvitationView } from './invitation-card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invitation');
  return { title: t('title') };
}

/**
 * The invitation page (`/invitations/{token}`, F011): the link of EM-09. Open to anyone, because
 * an invitation that is no longer valid says so to whoever holds the link. A valid one needs
 * sign-in: a visitor who is not signed in goes to TW-10 and comes back here (`returnTo`). Signed in
 * with the address the invitation is for, the person answers it; with another address they read the
 * masked address and can sign out. What is read of the invitation (`GET /v1/invitations/{token}`)
 * is the workspace's name, the inviter's name, the masked address and whether it is for the signed-in
 * account (`forYou`), and nothing else.
 */
export default async function InvitationPage({ params }: PageProps<'/invitations/[token]'>) {
  const { token } = await params;
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const { data: preview, response } = await apiClient.GET('/v1/invitations/{token}', {
    params: { path: { token } },
    headers: cookie ? { cookie } : {},
  });
  if (response.status === 404 || response.status === 400) {
    return <InvitationCard token={token} initial={{ kind: 'noLongerValid' }} />;
  }
  if (!preview) throw new Error(`GET /v1/invitations/{token} answered ${response.status}.`);
  const me = await loadMe(apiClient, requestHeaders);
  if (!me) redirect(loginPath(`/invitations/${encodeURIComponent(token)}`, '') as Route);
  // The API says whether the invitation is for this account (`forYou`) and refuses any other
  // account when it answers; this only decides what to show first.
  const view: InvitationView = preview.forYou
    ? {
        kind: 'question',
        workspaceName: preview.workspaceName,
        inviterName: preview.inviterName,
        maskedEmail: preview.maskedEmail,
      }
    : { kind: 'wrongAccount', maskedEmail: preview.maskedEmail };
  return <InvitationCard token={token} initial={view} />;
}
