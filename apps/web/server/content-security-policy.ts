import { browserConnectOrigins } from '@fivvi/observability/connect-origins';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Cloudflare Turnstile (E013): its script, its widget frame and the calls the widget makes. The
 * only third party the policy names for itself; error reporting and analytics come from the
 * environment (`browserConnectOrigins`).
 */
const TURNSTILE = 'https://challenges.cloudflare.com';

/** A fresh nonce for one request: 128 random bits in base64, unguessable and never reused. */
export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}

/**
 * Whether the answer to `pathname` carries the document policy (E013 AC8). The API under `/api`
 * answers JSON, never a page, so it sends none; its other security headers stay
 * (`securityHeaders`). Whole path segments only: `/apiary` is a page.
 */
export function carriesDocumentPolicy(pathname: string): boolean {
  return pathname !== '/api' && !pathname.startsWith('/api/');
}

/**
 * The Content-Security-Policy of a page (E013 AC8, AC9): scripts only from the app's own origin,
 * Turnstile, and inline scripts that carry this request's `nonce` (Next.js puts it on its own
 * script tags when the request carries the policy), and no `eval`. Error reporting and analytics
 * are named by the host they send to (`connect-src`, from `env`), never by a wildcard. Nothing may
 * frame a page (`frame-ancestors 'none'`).
 *
 * Styles allow the style attributes the components set (`style-src` has `'unsafe-inline'`): a
 * nonce can't cover an attribute, and a style can't run code. `unsafe-eval` is only for
 * `next dev`, where React builds debugging stacks with it. No `upgrade-insecure-requests`: the
 * e2e and development servers answer over plain HTTP, and HSTS covers the real hosts.
 */
export function contentSecurityPolicy(nonce: string, env: Env): string {
  const development = env.NODE_ENV === 'development';
  const directives: Record<string, readonly string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      TURNSTILE,
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", TURNSTILE, ...browserConnectOrigins(env)],
    'frame-src': [TURNSTILE],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}
