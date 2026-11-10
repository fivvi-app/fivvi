import type { SessionRead } from '@fivvi/auth';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import { guardRequest } from '../server/route-guard';
import { requestHostname, securityHeaders, staticFileHeaders } from '../server/security-headers';
import { EXPECTED_HSTS, securityHeaderProblems } from './security-headers';

const ANONYMOUS: SessionRead = { account: undefined, setCookies: [] };
const SIGNED_IN: SessionRead = {
  account: {
    id: '5a0d3d1e-0000-4000-8000-000000000001',
    email: 'owner@example.com',
    name: '',
    preferredLocale: 'nl-NL',
  },
  setCookies: [],
};

function answer(url: string, env: Record<string, string | undefined>, session = ANONYMOUS) {
  return guardRequest(new NextRequest(url), () => Promise.resolve(session), env);
}

// E013 AC8 (all but the Content-Security-Policy), the first part: the headers of every response.
describe('E013 AC8 the helper', () => {
  it('names what is wrong', () => {
    expect(securityHeaderProblems(new Headers())).toHaveLength(4);
    expect(securityHeaderProblems(new Headers(), { hsts: true })).toHaveLength(5);
  });

  it('wants no HSTS where it is not meant to be', () => {
    const headers = new Headers(securityHeaders('fivvi.app', { NODE_ENV: 'production' }));

    expect(securityHeaderProblems(headers, { hsts: true })).toEqual([]);
    expect(securityHeaderProblems(headers)).toEqual([
      `strict-transport-security: expected no header, got ${EXPECTED_HSTS}`,
    ]);
  });
});

// The proxy's `request.nextUrl` is built from the server's own HOSTNAME and port (0.0.0.0 on
// Railway, localhost in e2e), never from the visitor's Host header (confirmed on the wire), so the
// host the visitor asked for is read from the Host header.
describe('E013 AC8 the host of a request', () => {
  it.each([
    ['fivvi.app', 'fivvi.app'],
    ['fivvi.app:443', 'fivvi.app'],
    ['LocalHost:3677', 'localhost'],
    ['[::1]:3000', '[::1]'],
    ['[::1]', '[::1]'],
    ['127.0.0.1:3000', '127.0.0.1'],
  ])('%s is %s', (host, expected) => {
    expect(requestHostname(host, 'fallback.example')).toBe(expected);
  });

  it.each([null, undefined, ''])('falls back to the URL when the Host header is %j', (host) => {
    expect(requestHostname(host, '0.0.0.0')).toBe('0.0.0.0');
  });
});

describe('E013 AC8 static files', () => {
  it('carry the headers that hold in every environment, from the same values', () => {
    const pairs = Object.fromEntries(staticFileHeaders().map(({ key, value }) => [key, value]));

    expect(securityHeaderProblems(pairs)).toEqual([]);
  });

  it('are declared in next.config.ts for the build files and the favicon, which the proxy skips', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];

    expect(rules.map((rule) => rule.source).sort()).toEqual(['/_next/:path*', '/favicon.ico']);
    for (const rule of rules) expect(rule.headers).toEqual(staticFileHeaders());
  });
});

describe('E013 AC8 security headers', () => {
  it('turn off camera, microphone, geolocation and payment', () => {
    const policy = securityHeaders('fivvi.app', {})['permissions-policy'];

    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  describe('HSTS', () => {
    it('is sent in production on a real host', () => {
      expect(securityHeaders('fivvi.app', { NODE_ENV: 'production' })).toMatchObject({
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
      });
      expect(
        securityHeaders('web-fivvi-pr-1.up.railway.app', { NODE_ENV: 'production' }),
      ).toHaveProperty('strict-transport-security');
    });

    it.each(['localhost', 'LOCALHOST', 'app.localhost', '127.0.0.1', '[::1]'])(
      'is not sent on %s, even in production',
      (host) => {
        expect(securityHeaders(host, { NODE_ENV: 'production' })).not.toHaveProperty(
          'strict-transport-security',
        );
      },
    );

    it.each([undefined, 'development', 'test'])('is not sent when NODE_ENV is %s', (env) => {
      expect(securityHeaders('fivvi.app', { NODE_ENV: env })).not.toHaveProperty(
        'strict-transport-security',
      );
    });
  });
});

// AC8 through the route guard, which answers every path but the build's own files: the pages of
// the app and the site, the redirect to sign-in, the 404 and the API.
describe('E013 AC8 every answer of the route guard carries the headers', () => {
  const PRODUCTION = { NODE_ENV: 'production' };

  it.each([
    ['a public website page', 'https://fivvi.app/en'],
    ['the Dutch home page of the website', 'https://fivvi.app/'],
    ['the sign-in page', 'https://fivvi.app/login'],
    ['a public booking page', 'https://fivvi.app/book/johns-gym'],
    ['an API response', 'https://fivvi.app/api/v1/me'],
    ['the health check', 'https://fivvi.app/api/v1/health'],
    ['Better Auth', 'https://fivvi.app/api/auth/get-session'],
  ])('%s', async (_name, url) => {
    const response = await answer(url, PRODUCTION);

    expect(securityHeaderProblems(response.headers, { hsts: true })).toEqual([]);
  });

  it('a signed-out visit to a page that needs sign-in (the redirect)', async () => {
    const response = await answer('https://fivvi.app/home', PRODUCTION);

    expect(response.status).toBe(307);
    expect(securityHeaderProblems(response.headers, { hsts: true })).toEqual([]);
  });

  it('a signed-in visit', async () => {
    const response = await answer('https://fivvi.app/home', PRODUCTION, SIGNED_IN);

    expect(securityHeaderProblems(response.headers, { hsts: true })).toEqual([]);
  });

  it('a page that does not exist (the 404 is rendered after the guard)', async () => {
    const response = await answer('https://fivvi.app/no-such-page', PRODUCTION);

    expect(securityHeaderProblems(response.headers, { hsts: true })).toEqual([]);
  });

  it('the site home page of a signed-in browser (the redirect to the app)', async () => {
    const response = await guardRequest(
      new NextRequest('https://fivvi.app/', { headers: { cookie: 'a=b' } }),
      () => Promise.resolve(SIGNED_IN),
      PRODUCTION,
    );

    expect(response.status).toBe(307);
    expect(securityHeaderProblems(response.headers, { hsts: true })).toEqual([]);
  });

  // `request.nextUrl` carries the server's own host, so the Host header decides.
  it('no HSTS when the Host header is localhost, whatever the URL says', async () => {
    const response = await guardRequest(
      new NextRequest('https://0.0.0.0:8080/login', { headers: { host: 'localhost:3000' } }),
      () => Promise.resolve(ANONYMOUS),
      PRODUCTION,
    );

    expect(securityHeaderProblems(response.headers)).toEqual([]);
  });

  it('HSTS when the Host header is a real host, whatever the URL says', async () => {
    for (const url of ['http://localhost:3000/login', 'http://0.0.0.0:8080/login']) {
      const response = await guardRequest(
        new NextRequest(url, { headers: { host: 'fivvi.app' } }),
        () => Promise.resolve(ANONYMOUS),
        PRODUCTION,
      );

      expect(securityHeaderProblems(response.headers, { hsts: true })).toEqual([]);
    }
  });

  it('no HSTS on localhost, in production or not', async () => {
    for (const env of [PRODUCTION, {}]) {
      const response = await answer('http://localhost:3000/login', env);

      expect(securityHeaderProblems(response.headers)).toEqual([]);
    }
  });

  it('no HSTS outside production', async () => {
    const response = await answer('https://fivvi.app/login', { NODE_ENV: 'development' });

    expect(securityHeaderProblems(response.headers)).toEqual([]);
  });
});
