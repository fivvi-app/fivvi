import type { SessionRead } from '@fivvi/auth';
import { type NextRequest, NextResponse } from 'next/server';
import { loginPath } from '../app/login/return-path';

/**
 * Pages and routes that need no sign-in (AC13): the sign-in page with its confirm step, the hello
 * page, the API (every route there decides for itself: the health check and the hello route are
 * open, `/api/v1/me` answers 401 and Better Auth's own endpoints are how people sign in) and the
 * public booking pages. Everything else is a trainer-web page that needs sign-in, so a new page
 * is guarded until it is listed here.
 */
const PUBLIC_PREFIXES = ['/login', '/book', '/api'];

/** Whether `pathname` is open to anyone. Whole path segments only: `/booking` is not `/book`. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

/**
 * The route guard (`proxy.ts`): a visitor without a valid sign-in session who asks for a page
 * that needs sign-in goes to `/login` with that page as the return path (AC13). Using a session
 * renews it, so the cookie the browser needs for that (AC12) goes out with the answer. Public
 * paths are not looked at. When the session can't be read the request fails; no page is served.
 */
export async function guardRequest(
  request: NextRequest,
  readSession: (headers: Headers) => Promise<SessionRead>,
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const { account, setCookies } = await readSession(request.headers);
  const response = account
    ? NextResponse.next()
    : NextResponse.redirect(new URL(loginPath(pathname, search), request.nextUrl));
  for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
  return response;
}
