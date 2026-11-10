import type { SessionRead } from '@fivvi/auth';
import { loginPath, SIGN_IN_PAGE, SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { isLocale } from '@fivvi/i18n';
import { type NextRequest, NextResponse } from 'next/server';
import { localeCookie, localeCookieMaxAge } from '../i18n/config';
import { ICON_FILES } from '../site/icons';
import { robotsHeader } from '../site/indexing';
import { isSitePath, siteHomePath } from '../site/routes';
import { requestHostname, securityHeaders } from './security-headers';

/** The public website's miniatures and screens (`public/site-images`, F064): images, no data. */
const SITE_IMAGES = '/site-images';

/** The site's Open Graph images, generated at build time (`app/site-og`, F064 AC12). */
const SITE_SHARE_IMAGES = '/site-og';

/**
 * Pages and routes that need no sign-in (AC13): the public website's pages (`site/routes.ts`, in
 * both languages), the sign-in page with its confirm step, the API (every route there decides for
 * itself: the health check and the hello route are open, `/api/v1/me` answers 401 and Better
 * Auth's own endpoints are how people sign in) and the public booking pages. Everything else is a
 * trainer-web page that needs sign-in, so a new page is guarded until it is listed here. Keep this
 * list in step with the `(signed-in)` route group (`app/(app)/(signed-in)/layout.tsx`), which holds
 * the pages that need sign-in and show *Sign out*.
 */
const PUBLIC_PREFIXES = [SIGN_IN_PAGE, '/book', '/api', SITE_IMAGES, SITE_SHARE_IMAGES];

/**
 * Files fetched without a session: the app-link association files (E017 AC5), which the phone's
 * operating system fetches and follows no redirect for, and `robots.txt` and `sitemap.xml` for the
 * search engines (F064 AC13). Exactly these, not the whole `/.well-known/` folder.
 */
const PUBLIC_FILES: readonly string[] = [
  '/.well-known/apple-app-site-association',
  '/.well-known/assetlinks.json',
  // What a search engine fetches (F064 AC13).
  '/robots.txt',
  '/sitemap.xml',
  // The favicon files of `app/` (#669), which a browser fetches for any page, signed in or not.
  ...ICON_FILES,
];

/** Whether `pathname` is open to anyone. Whole path segments only: `/booking` is not `/book`. */
export function isPublicPath(pathname: string): boolean {
  return (
    isSitePath(pathname) ||
    PUBLIC_FILES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

/**
 * The site's Dutch home page (`/`) for a visitor who might be signed in (F064 AC18): a browser
 * with a sign-in session goes on to its home in the app (`/home`, which decides where), the page
 * itself is never rendered for it. A visitor without any cookie is anonymous: nothing is looked up
 * and nothing is set, so the page stays static and cookie-free (AC16). When the session can't be
 * read (the database is down) the page is served anyway. The other pages of the site are left alone.
 */
async function siteHome(
  request: NextRequest,
  readSession: (headers: Headers) => Promise<SessionRead>,
): Promise<NextResponse> {
  if (!request.headers.get('cookie')) return NextResponse.next();
  let session: SessionRead;
  try {
    session = await readSession(request.headers);
  } catch (error) {
    // The public home page does not depend on the database: when the session can't be read, the
    // visitor gets the static page. Only the error's name is logged; it can quote what was asked.
    console.error(
      `Reading the session for the home page failed: ${error instanceof Error ? error.name : 'Error'}`,
    );
    return NextResponse.next();
  }
  const response = session.account
    ? NextResponse.redirect(new URL(SIGNED_IN_HOME, request.nextUrl))
    : NextResponse.next();
  // The renewed session cookie, or the one that clears a session that is gone.
  for (const cookie of session.setCookies) response.headers.append('set-cookie', cookie);
  return response;
}

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
 * The route guard (`proxy.ts`), the search header and the security headers: the answer of
 * `answerRequest` with the `X-Robots-Tag` header of the path (`robotsHeader`, F064 AC13) and the
 * security headers (`securityHeaders`, E013 AC8). They are set here, per request, on every answer
 * (page, redirect, 404, API), because the site's pages are static and one build serves every
 * environment; whether this is production is read from `env` at run time, and HSTS depends on the
 * host in the `Host` header (`requestHostname`). The build's own files and the favicon, which the
 * matcher in `proxy.ts` skips, get the same headers from `headers()` in next.config.ts.
 */
export async function guardRequest(
  request: NextRequest,
  readSession: (headers: Headers) => Promise<SessionRead>,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<NextResponse> {
  const response = await answerRequest(request, readSession);
  const robots = robotsHeader(request.nextUrl.pathname, env);
  if (robots) response.headers.set('x-robots-tag', robots);
  // The host is the visitor's Host header: `request.nextUrl` carries the server's own HOSTNAME
  // (0.0.0.0 on Railway, localhost in e2e), not the host asked for.
  const hostname = requestHostname(request.headers.get('host'), request.nextUrl.hostname);
  for (const [name, value] of Object.entries(securityHeaders(hostname, env))) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * The route guard: a visitor without a valid sign-in session who asks for a page
 * that needs sign-in goes to `/login` with that page as the return path (AC13). Using a session
 * renews it, so the cookie the browser needs for that (AC12) goes out with the answer. A signed-in
 * browser also gets the language stored on the account as its `NEXT_LOCALE` cookie (F010).
 * Public paths are not looked at, except the site's home page, which sends a signed-in browser on to
 * the app (F064). When the session can't be read the request fails; no page is served.
 */
async function answerRequest(
  request: NextRequest,
  readSession: (headers: Headers) => Promise<SessionRead>,
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return pathname === siteHomePath('nl-NL')
      ? await siteHome(request, readSession)
      : NextResponse.next();
  }
  const { account, setCookies } = await readSession(request.headers);
  const language = account ? withStoredLocale(request, account.preferredLocale) : undefined;
  const response = account
    ? NextResponse.next(language ? { request: { headers: language.headers } } : undefined)
    : NextResponse.redirect(new URL(loginPath(pathname, search), request.nextUrl));
  if (language) {
    response.cookies.set(localeCookie, language.locale, {
      path: '/',
      maxAge: localeCookieMaxAge,
      sameSite: 'lax',
    });
  }
  for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
  return response;
}
