import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RETURN_PATH_PARAM, SIGNED_IN_HOME, safeReturnPath } from '../../../lib/return-path';
import { ConfirmForm } from './confirm-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  // The address carries the link token: it never goes to another site in a Referer header.
  return { title: t('title'), referrer: 'no-referrer', robots: { index: false } };
}

/**
 * TW-10 confirm step (`/login/confirm?token=…`): where the link in EM-08 lands (F001). Opening
 * it uses nothing up; only the button does, so an email scanner that opens the link can't use it
 * before the person does. A `returnTo` on the link is kept as on `/login`: only a path of this
 * site, anything else ends at the signed-in home (AC13).
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; [RETURN_PATH_PARAM]?: string | string[] }>;
}) {
  const query = await searchParams;
  const { token } = query;
  const returnPath = safeReturnPath(query[RETURN_PATH_PARAM]) ?? SIGNED_IN_HOME;
  return <ConfirmForm token={typeof token === 'string' ? token : ''} returnPath={returnPath} />;
}
