/**
 * What the security headers of every web response must be (E013, AC8), in one place for the
 * Vitest tests and the Playwright specs, and for the Content-Security-Policy ticket and later routes
 * to reuse. It returns what is wrong, so the caller asserts it with its own `expect`:
 * `expect(securityHeaderProblems(response.headers)).toEqual([])`.
 *
 * The Content-Security-Policy (#720) is checked as well: a page carries one with a nonce, the API
 * and the build's own files carry none (`csp: 'none'`).
 */

/** The headers every response carries, in every environment. */
export const EXPECTED_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/** `Strict-Transport-Security`, sent only in production on a host that is not localhost. */
export const EXPECTED_HSTS = 'max-age=31536000; includeSubDomains';

/** The only third party a page's policy names for scripts and frames (Turnstile, E013). */
const TURNSTILE = 'https://challenges.cloudflare.com';

/** The sources of one directive of a policy; undefined when the policy has no such directive. */
export function policyDirective(policy: string, name: string): string[] | undefined {
  return policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([first]) => first === name)
    ?.slice(1);
}

/** The nonce in a response's Content-Security-Policy, or undefined when it has none. */
export function cspNonce(headers: Headers | Readonly<Record<string, string>>): string | undefined {
  const policy =
    headers instanceof Headers
      ? headers.get('content-security-policy')
      : headers['content-security-policy'];
  return /'nonce-([^']+)'/.exec(policy ?? '')?.[1];
}

/** What is wrong with the Content-Security-Policy of a page (AC8): an empty list when it is right. */
function pagePolicyProblems(policy: string | undefined): string[] {
  if (policy === undefined) return ['content-security-policy: expected a policy, got no header'];
  const problems: string[] = [];
  const want = (ok: boolean, what: string) => {
    if (!ok) problems.push(`content-security-policy: ${what}`);
  };
  const scripts = policyDirective(policy, 'script-src') ?? [];
  want(
    scripts.some((source) => /^'nonce-[A-Za-z0-9+/]{16,}={0,2}'$/.test(source)),
    'script-src needs a nonce of at least 128 bits',
  );
  want(scripts.includes("'self'"), "script-src needs 'self'");
  want(!policy.includes("'unsafe-eval'"), "must not allow 'unsafe-eval'");
  want(!scripts.includes("'unsafe-inline'"), "script-src must not allow 'unsafe-inline'");
  want(
    scripts.every((source) => source.startsWith("'") || source === TURNSTILE),
    `script-src may name ${TURNSTILE} and nothing else`,
  );
  want(
    JSON.stringify(policyDirective(policy, 'frame-ancestors')) === JSON.stringify(["'none'"]),
    "frame-ancestors must be 'none'",
  );
  want(
    JSON.stringify(policyDirective(policy, 'frame-src')) === JSON.stringify([TURNSTILE]),
    `frame-src may name ${TURNSTILE} only`,
  );
  // Images, fonts, styles and the fallback name no host: the app's own origin, keywords, and for
  // images `data:` and `blob:`.
  for (const name of ['default-src', 'style-src', 'font-src', 'img-src']) {
    const sources = policyDirective(policy, name) ?? [];
    want(
      sources.every(
        (source) => source.startsWith("'") || (name === 'img-src' && /^(data|blob):$/.test(source)),
      ),
      `${name} may name no host`,
    );
  }
  want(
    [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'connect-src',
      'frame-src',
    ].every((name) =>
      (policyDirective(policy, name) ?? []).every((source) => !/^\*|^https?:$|\*\./.test(source)),
    ),
    'no wildcard or scheme-wide source',
  );
  return problems;
}

/**
 * The problems with the security headers of a response; an empty list when they are right.
 * `csp` is what the answer is: a `document` (the default; pages, redirects and 404s) carries a
 * Content-Security-Policy, `none` (the API, the build's own files) carries none.
 */
export function securityHeaderProblems(
  headers: Headers | Readonly<Record<string, string>>,
  { hsts, csp }: { readonly hsts?: boolean; readonly csp?: 'document' | 'none' } = {},
): string[] {
  const read = (name: string): string | undefined =>
    headers instanceof Headers ? (headers.get(name) ?? undefined) : headers[name];
  const problems: string[] = [];
  const check = (name: string, expected: string | undefined) => {
    const actual = read(name);
    if (actual !== expected) {
      problems.push(`${name}: expected ${expected ?? 'no header'}, got ${actual ?? 'no header'}`);
    }
  };
  for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) check(name, value);
  check('strict-transport-security', hsts ? EXPECTED_HSTS : undefined);
  const policy = read('content-security-policy');
  if ((csp ?? 'document') === 'document') problems.push(...pagePolicyProblems(policy));
  else check('content-security-policy', undefined);
  return problems;
}
