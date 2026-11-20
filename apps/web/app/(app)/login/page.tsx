import { RETURN_PATH_PARAM, safeReturnPath } from '@fivvi/auth/return-path';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { currentLocale } from '../../../i18n/current-locale';
import { apiClient } from '../../../server/api';
import { invitedAddress } from '../../../server/invited-address';
import { SignInForm } from './sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('title') };
}

/**
 * TW-10 Sign in (`/login`): the email step, then the code step (F001). The route guard sends a
 * visitor here with the page they asked for in `returnTo`; sign-in ends there. Only a path of
 * this site is kept, anything else is ignored and sign-in ends at the signed-in home (AC13). The
 * kept page also goes to the server with the email request, which puts it on the emailed link.
 * On the way to an invitation (`/invitations/{token}`) the email field opens with the invited
 * address (F011, #1413): read on the server from the token, which the link carries, and never put
 * in the address of this page.
 */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const [query, locale] = await Promise.all([searchParams, currentLocale()]);
  const returnPath = safeReturnPath(query[RETURN_PATH_PARAM]);
  const defaultEmail = await invitedAddress(apiClient, returnPath);
  return <SignInForm locale={locale} returnPath={returnPath} defaultEmail={defaultEmail} />;
}
