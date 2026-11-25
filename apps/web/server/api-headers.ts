import type { Locale } from '@fivvi/i18n';

/**
 * The headers a server component sends with a request to this app's own API (#1595): the
 * sign-in cookie of the page request, never an `Authorization` header, and the page's
 * language as `Accept-Language`. The API picks the language of what it names for the viewer
 * (a class's name, an offer's summary) from the account's stored language, else `Accept-Language`
 * (ADR-017), so an account with no stored language gets the language the page is in, which may come
 * from the language cookie and not from the browser's own header.
 */
export function pageApiHeaders(
  requestHeaders: Headers,
  locale: Locale,
): { cookie?: string; 'accept-language': string } {
  const cookie = requestHeaders.get('cookie');
  return { ...(cookie ? { cookie } : {}), 'accept-language': locale };
}
