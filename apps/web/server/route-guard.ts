import type { SessionRead } from '@fivvi/auth';
import { loginPath, SIGN_IN_PAGE } from '@fivvi/auth/return-path';
import { isLocale } from '@fivvi/i18n';
import { type NextRequest, NextResponse } from 'next/server';
import { localeCookie } from '../i18n/config';

/**
 * Pages and routes that need no sign-in (AC13): the sign-in page with its confirm step, the hello
 * page, the API (every route there decides for itself: the health check and the hello route are
 * open, `/api/v1/me` answers 401 and Better Auth's own endpoints are how people sign in) and the
 * public booking pages. Everything else is a trainer-web page that needs sign-in, so a new page
 * is guarded until it is listed here. Keep this list in step with the `(signed-in)` route group
 * (`app/(signed-in)/layout.tsx`), which holds the pages that need sign-in and show *Sign out*.
 */
const PUBLIC_PREFIXES = [SIGN_IN_PAGE, '/book', '/api'];

/** Whether `pathname` is open to anyone. Whole path segments only: `/booking` is not `/book`. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

/** How long the browser keeps the language cookie: a year, renewed whenever it is rewritten. */
const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/**
 * The request with the language stored on the account written into its `NEXT_LOCALE` cookie, so
 * the page of this request is rendered in it (ADR-017: the account's choice beats an older cookie
 * of another browser). `undefined` when the account stores none or the cookie already matches.
 */
function withStoredLocale(request: NextRequest, stored: string | null) {
  if (!isLocale(stored) || request.cookies.get(localeCookie)?.value === stored) return undefined;
  const cookies = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie !== '' && !cookie.startsWith(`${localeCookie}=`));
  const headers = new Headers(request.headers);
  headers.set('cookie', [...cookies, `${localeCookie}=${stored}`].join('; '));
  return { locale: stored, headers };
}

/**
 * The route guard (`proxy.ts`): a visitor without a valid sign-in session who asks for a page
 * that needs sign-in goes to `/login` with that page as the return path (AC13). Using a session
 * renews it, so the cookie the browser needs for that (AC12) goes out with the answer. A signed-in
 * browser also gets the language stored on the account as its `NEXT_LOCALE` cookie (F010).
 * Public paths are not looked at. When the session can't be read the request fails; no page is served.
 */
export async function guardRequest(
  request: NextRequest,
  readSession: (headers: Headers) => Promise<SessionRead>,
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const { account, setCookies } = await readSession(request.headers);
  const language = account ? withStoredLocale(request, account.preferredLocale) : undefined;
  const response = account
    ? NextResponse.next(language ? { request: { headers: language.headers } } : undefined)
    : NextResponse.redirect(new URL(loginPath(pathname, search), request.nextUrl));
  if (language) {
    response.cookies.set(localeCookie, language.locale, {
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: 'lax',
    });
  }
  for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
  return response;
}
