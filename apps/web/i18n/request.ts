import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { intlConfig, localeCookie, requestLocale } from './config';

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = requestLocale(
    cookieStore.get(localeCookie)?.value,
    headerStore.get('accept-language'),
  );
  return intlConfig(locale);
});
