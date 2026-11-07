import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { currentMe, homeDestination, redirectTo } from '../../../../server/signed-in';
import { WelcomeForm } from './welcome-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('welcome');
  return { title: t('title') };
}

/**
 * TW-11 (`/welcome`, F002): the form that sets up a workspace, for a person on the sign-up
 * allowlist: the first-run screen of one who has no workspace yet, and, from the scope switcher's
 * *Nieuwe werkruimte*, the way to another (F012). The signed-in home sends only an account
 * without a workspace here. Anyone not on the allowlist goes where the signed-in home sends them:
 * to their workspace's home (AC4) or the no-access page (AC5), so it never sees this screen. The
 * route guard (`proxy.ts`) is the first gate.
 */
export default async function WelcomePage() {
  const me = await currentMe();
  if (!me.canCreateWorkspace) redirectTo(await homeDestination(me));
  // TW-11 asks for the person's name only when the account has none.
  return <WelcomeForm askName={me.name === null} />;
}
