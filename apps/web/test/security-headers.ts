/**
 * What the security headers of every web response must be (E013, AC8), in one place for the
 * Vitest tests and the Playwright specs, and for the Content-Security-Policy ticket and later routes
 * to reuse. It returns what is wrong, so the caller asserts it with its own `expect`:
 * `expect(securityHeaderProblems(response.headers)).toEqual([])`.
 *
 * The Content-Security-Policy is not checked here: it has its own ticket (#720).
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

/** The problems with the security headers of a response; an empty list when they are right. */
export function securityHeaderProblems(
  headers: Headers | Readonly<Record<string, string>>,
  { hsts }: { readonly hsts: boolean } = { hsts: false },
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
  return problems;
}
