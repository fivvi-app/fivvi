import { securityHeaderProblems } from '../test/security-headers';
import { expect, test } from './fixtures';

// E013 AC8 (all but the Content-Security-Policy), on the wire: the production build answers every
// kind of request with the security headers. The e2e server is on localhost, so no HSTS (the unit
// tests in test/security-headers.test.ts cover production on a real host). The same set must hold
// for the browser's own requests, so the existing suite loading its pages is the check that nothing
// the site needs (fonts, images, scripts) broke.
const PATHS = [
  ['the Dutch home page of the public website', '/'],
  ['an English page of the public website', '/en'],
  ['the sign-in page', '/login'],
  ['a public booking page', '/book/no-such-gym'],
  ['a page that does not exist', '/no-such-page'],
  ['the API health check', '/api/v1/health'],
  ['an API route that answers 401', '/api/v1/me'],
] as const;

test.describe('E013 AC8 security headers', () => {
  for (const [name, path] of PATHS) {
    test(`${name} carries them`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(securityHeaderProblems(response.headers())).toEqual([]);
    });
  }

  test('a signed-out visit to a page that needs sign-in carries them on the redirect', async ({
    request,
  }) => {
    const response = await request.get('/home', { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(securityHeaderProblems(response.headers())).toEqual([]);
  });
});
