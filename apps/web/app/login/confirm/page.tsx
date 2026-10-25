import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ConfirmForm } from './confirm-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  // The address carries the link token: it never goes to another site in a Referer header.
  return { title: t('title'), referrer: 'no-referrer', robots: { index: false } };
}

/**
 * TW-10 confirm step (`/login/confirm?token=…`): where the link in EM-08 lands (F001). Opening
 * it uses nothing up; only the button does, so an email scanner that opens the link can't use it
 * before the person does.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <ConfirmForm token={typeof token === 'string' ? token : ''} />;
}
