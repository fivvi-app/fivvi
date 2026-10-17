import type { Locale } from '@trainer-hub/i18n';
import { cookies, headers } from 'next/headers';
import { localeCookie, requestLocale } from './config';

/** The current request's interface language (ADR-017), as a catalog locale. */
export async function currentLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return requestLocale(cookieStore.get(localeCookie)?.value, headerStore.get('accept-language'));
}
