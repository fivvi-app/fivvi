import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { destinationOf } from '../../../server/destination';
import { currentMe, redirectTo } from '../../../server/signed-in';
import { WelcomeForm } from './welcome-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('welcome');
  return { title: t('title') };
}

/**
 * TW-11 (`/welcome`, F002): the first-run screen of a person on the sign-up allowlist who has no
 * workspace yet. Anyone else goes where the signed-in home sends them: an account with a
 * workspace to its home (AC4), one that may not create a workspace to the no-access page (AC5),
 * so it never sees this screen. The route guard (`proxy.ts`) is the first gate.
 */
export default async function WelcomePage() {
  const me = await currentMe();
  const destination = destinationOf(me);
  if (destination.to !== 'welcome') redirectTo(destination);
  // TW-11 asks for the person's name only when the account has none.
  return <WelcomeForm askName={me.name === null} />;
}
