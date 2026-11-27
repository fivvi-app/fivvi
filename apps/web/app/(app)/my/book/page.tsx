import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientTitle } from '../client-title';
import { NoWorkspace } from '../no-workspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('clientNav');
  return { title: t('book') };
}

/**
 * *Boeken* (`/my/book`, F030): until F027 builds the timetable it shows the same no-studio text
 * as *Home*. #792 puts the studio switcher in its header.
 */
export default async function ClientBookPage() {
  const t = await getTranslations('clientNav');
  return (
    <>
      <ClientTitle title={t('book')} />
      <NoWorkspace />
    </>
  );
}
