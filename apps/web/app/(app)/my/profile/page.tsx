import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientTitle } from '../client-title';
import { ClientSignOut } from './client-sign-out';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('clientNav');
  return { title: t('profile') };
}

/**
 * *Profiel* (`/my/profile`, F030): the large title and *Uitloggen* / *Sign out*, which the
 * tabs leave no account menu for. F033 fills in the rest.
 */
export default async function ClientProfilePage() {
  const t = await getTranslations('clientNav');
  return (
    <>
      <ClientTitle title={t('profile')} />
      <ClientSignOut />
    </>
  );
}
