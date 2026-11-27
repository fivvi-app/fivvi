import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { currentMe } from '../../../../server/signed-in';
import { ClientTitle } from '../client-title';
import { NoWorkspace } from '../no-workspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('clientNav');
  return { title: t('book') };
}

/**
 * *Boeken* (`/my/book`, F030): the studio switcher is in the header (the layout). With no studio
 * it keeps the no-studio text of *Home*; with one, the studio's timetable is F027's, so until
 * then the page has its large title and the switcher.
 */
export default async function ClientBookPage() {
  const t = await getTranslations('clientNav');
  const { clientWorkspaces } = await currentMe();
  return (
    <>
      <ClientTitle title={t('book')} now={new Date()} />
      {clientWorkspaces.length === 0 ? <NoWorkspace /> : null}
    </>
  );
}
