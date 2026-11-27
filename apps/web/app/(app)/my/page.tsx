import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientTitle } from './client-title';
import { NoWorkspace } from './no-workspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('clientNav');
  return { title: t('home') };
}

/**
 * The client home (`/my`, F030): where a signed-in person who is only a client, or nothing
 * yet, lands (`/home` decides from `GET /v1/me`). With no studio it asks for the studio's link;
 * #792 lists the studios of a client here.
 */
export default async function ClientHomePage() {
  const t = await getTranslations('clientNav');
  return (
    <>
      <ClientTitle title={t('home')} />
      <NoWorkspace />
    </>
  );
}
