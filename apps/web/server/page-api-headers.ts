import { headers } from 'next/headers';
import { currentLocale } from '../i18n/current-locale';
import { pageApiHeaders } from './api-headers';

/**
 * The headers of this page request's calls to the API (#1595): its sign-in cookie and the page's
 * language. A page whose API answer names things in the viewer's language (a class's name) sends these.
 */
export async function currentPageApiHeaders() {
  const [requestHeaders, locale] = await Promise.all([headers(), currentLocale()]);
  return pageApiHeaders(requestHeaders, locale);
}
