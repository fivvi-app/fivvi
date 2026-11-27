import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { currentMe } from '../../../server/signed-in';
import { ClientHome } from './client-home';
import { ClientTitle } from './client-title';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('clientNav');
  return { title: t('home') };
}

/**
 * The client home (`/my`, F030): where a signed-in person who is only a client, or nothing
 * yet, lands (`/home` decides from `GET /v1/me`). It lists the studios the person is a client of
 * (*Mijn studio's*), and with none asks for the studio's link. Once F027 exists a person with
 * exactly one studio goes straight to its timetable.
 */
export default async function ClientHomePage() {
  const t = await getTranslations('clientNav');
  const { clientWorkspaces } = await currentMe();
  return (
    <>
      <ClientTitle title={t('home')} now={new Date()} />
      <ClientHome studios={clientWorkspaces} />
    </>
  );
}
