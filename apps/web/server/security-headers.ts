type Env = Readonly<Record<string, string | undefined>>;

/**
 * The security headers of every response of the web app, pages and `/api` alike (E013, AC8), apart
 * from the Content-Security-Policy, which has its own ticket (#720). The route guard (`proxy.ts`)
 * sets them on every answer it gives: the page, the redirect to sign-in, the 404 and the API.
 *
 * - `nosniff`: a browser keeps to the type the server says.
 * - `strict-origin-when-cross-origin`: another site gets the origin of a page, never its path.
 * - `X-Frame-Options: DENY`: no page can be framed (the Content-Security-Policy adds
 *   `frame-ancestors 'none'`).
 * - Camera, microphone, geolocation and payment are off; nothing in the web app uses them.
 */
const ALWAYS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/** One year, with the subdomains. No `preload`: that is a separate decision. */
const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

/** The names of the hosts a developer's machine answers to, which never get HSTS. */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

/**
 * The name of the host a visitor asked for: the `Host` header without its port, in lower case. The
 * proxy's `request.nextUrl` can't be used for it: Next.js builds that URL from the server's own
 * `HOSTNAME` and port (`0.0.0.0` on Railway, `localhost` in the e2e server), never from the
 * visitor's `Host` header. `fallback` (the hostname of that URL) is for a request without one.
 */
export function requestHostname(host: string | null | undefined, fallback: string): string {
  const value = host?.trim().toLowerCase();
  if (!value) return fallback;
  // An IPv6 address is in brackets, its port after them: `[::1]:3000`.
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1) || fallback;
  return value.split(':')[0] || fallback;
}

/**
 * The headers of the files the proxy skips (`proxy.ts` matcher): the build's own files under
 * `/_next/` (chunks, `/_next/image`) and `/favicon.ico`. The same values as `securityHeaders`, in
 * the shape `headers()` of next.config.ts wants. No HSTS: the build can't tell the host, and every
 * page and API answer, which the browser meets first, carries it.
 */
export function staticFileHeaders(): { key: string; value: string }[] {
  return Object.entries(ALWAYS).map(([key, value]) => ({ key, value }));
}

/**
 * The security headers for a request to `hostname` (see `requestHostname`). `Strict-Transport-Security` only when
 * `NODE_ENV` is `production` and the host is not localhost, so the development server and the e2e
 * server on localhost keep working over plain HTTP. Read at run time from `env` (the whole object,
 * never `process.env.NODE_ENV`, which the build would inline).
 */
export function securityHeaders(hostname: string, env: Env = process.env): Record<string, string> {
  const headers = { ...ALWAYS };
  if (env.NODE_ENV === 'production' && !isLocalHost(hostname.toLowerCase())) {
    headers['strict-transport-security'] = STRICT_TRANSPORT_SECURITY;
  }
  return headers;
}
