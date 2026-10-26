import { RETURN_PATH_PARAM, safeReturnPath } from '@fivvi/auth/return-path';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { currentLocale } from '../../i18n/current-locale';
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
 */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const [query, locale] = await Promise.all([searchParams, currentLocale()]);
  const returnPath = safeReturnPath(query[RETURN_PATH_PARAM]);
  return <SignInForm locale={locale} returnPath={returnPath} />;
}
