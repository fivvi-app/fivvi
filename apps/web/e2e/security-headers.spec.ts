import { securityHeaderProblems } from '../test/security-headers';
import { expect, test } from './fixtures';

// E013 AC8, on the wire (csp.spec.ts goes further into the pages' Content-Security-Policy and its
// nonce): the production build answers every kind of request with the security headers. The e2e server is on localhost, so no HSTS (the unit
// tests in test/security-headers.test.ts cover production on a real host). The same set must hold
// for the browser's own requests, so the existing suite loading its pages is the check that nothing
// the site needs (fonts, images, scripts) broke.
const PATHS = [
  ['the Dutch home page of the public website', '/'],
  ['an English page of the public website', '/en'],
  ['the sign-in page', '/login'],
  ['a public booking page', '/book/no-such-gym'],
  ['a page that does not exist', '/no-such-page'],
] as const;

// The API answers JSON: the other headers, no document policy.
const API_PATHS = [
  ['the API health check', '/api/v1/health'],
  ['an API route that answers 401', '/api/v1/me'],
] as const;

test.describe('E013 AC8 security headers', () => {
  for (const [name, path] of PATHS) {
    test(`${name} carries them, with a Content-Security-Policy`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(securityHeaderProblems(response.headers())).toEqual([]);
    });
  }

  for (const [name, path] of API_PATHS) {
    test(`${name} carries them, without a Content-Security-Policy`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(securityHeaderProblems(response.headers(), { csp: 'none' })).toEqual([]);
    });
  }

  // The proxy skips the build's own files and the favicon (proxy.ts matcher); next.config.ts
  // gives them the same headers.
  // The server answers to the address it is started on (localhost here, 0.0.0.0 on Railway), not
  // to the Host header, so only the Host header can tell the host the visitor asked for.
  test('HSTS follows the Host header: sent for a real host, never for localhost', async ({
    request,
  }) => {
    const real = await request.get('/login', { headers: { host: 'fivvi.app' }, maxRedirects: 0 });
    const local = await request.get('/login', { maxRedirects: 0 });

    expect(securityHeaderProblems(real.headers(), { hsts: true })).toEqual([]);
    expect(securityHeaderProblems(local.headers())).toEqual([]);
  });

  test('a script of the build carries them', async ({ request }) => {
    const page = await (await request.get('/login')).text();
    const script = /\/_next\/static\/[^"' ]+\.js/.exec(page)?.[0];
    expect(script).toBeDefined();

    const response = await request.get(script ?? '', { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(securityHeaderProblems(response.headers(), { csp: 'none' })).toEqual([]);
  });

  test('the image optimiser carries them, and its own sandbox policy instead of a page policy', async ({
    request,
  }) => {
    const response = await request.get('/_next/image?url=%2Ficon.png&w=64&q=75', {
      maxRedirects: 0,
    });
    // Next.js sends its own policy for the images it serves: no scripts, no frames, sandboxed.
    const { 'content-security-policy': own, ...headers } = response.headers();

    expect(own).toContain('sandbox');
    expect(own).toContain("script-src 'none'");
    expect(securityHeaderProblems(headers, { csp: 'none' })).toEqual([]);
  });

  test('the favicon carries them', async ({ request }) => {
    const response = await request.get('/favicon.ico', { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(securityHeaderProblems(response.headers(), { csp: 'none' })).toEqual([]);
  });

  test('a signed-out visit to a page that needs sign-in carries them on the redirect', async ({
    request,
  }) => {
    const response = await request.get('/home', { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(securityHeaderProblems(response.headers())).toEqual([]);
  });
});
