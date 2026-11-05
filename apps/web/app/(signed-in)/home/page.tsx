import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { currentMe, homeDestination, redirectTo } from '../../../server/signed-in';
import { NoAccess } from './no-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('noAccess');
  return { title: t('title') };
}

/**
 * The signed-in home (`/home`, F002): the page sign-in ends at when none was asked for. It sends
 * each person to the right place from `GET /v1/me`: the workspace's home they used last in this
 * browser, else the first by name (F012), TW-11 when they may set a workspace up, otherwise the
 * no-access page, which it shows itself. The route guard (`proxy.ts`) keeps anonymous visitors
 * out, and the layout of this group adds sign out.
 */
export default async function HomePage() {
  const destination = await homeDestination(await currentMe());
  if (destination.to !== 'no-access') redirectTo(destination);
  return <NoAccess />;
}
