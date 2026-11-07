import type { SessionRead } from '@fivvi/auth';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { guardRequest, isPublicPath } from './route-guard';

const ORIGIN = 'https://fivvi.app';
const account = { id: '5a0d3d1e-0000-4000-8000-000000000001', email: 'owner@example.com' };
const SIGNED_IN: SessionRead = {
  account: { ...account, name: '', preferredLocale: 'nl-NL' },
  setCookies: [],
};
const ANONYMOUS: SessionRead = { account: undefined, setCookies: [] };

function guard(
  path: string,
  session: SessionRead,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
) {
  const readSession = vi.fn(async () => session);
  const request = new NextRequest(`${ORIGIN}${path}`, init);
  return { readSession, answer: guardRequest(request, readSession) };
}

describe('F001 AC13 route guard', () => {
  describe('an anonymous visitor to a trainer-web page goes to /login, and back after sign-in', () => {
    it.each([
      ['/home', '/login?returnTo=%2Fhome'],
      [
        '/w/pilot-gym/calendar?view=week',
        '/login?returnTo=%2Fw%2Fpilot-gym%2Fcalendar%3Fview%3Dweek',
      ],
      ['/me/day', '/login?returnTo=%2Fme%2Fday'],
      // F002 AC9: the first-run screen and the workspace home are guarded too.
      ['/welcome', '/login?returnTo=%2Fwelcome'],
      ['/w/johns-gym', '/login?returnTo=%2Fw%2Fjohns-gym'],
    ])('%s', async (path, login) => {
      const { answer } = guard(path, ANONYMOUS);

      const response = await answer;

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${ORIGIN}${login}`);
    });

    it('also for a page that does not exist (every path is guarded unless it is public)', async () => {
      const response = await guard('/no-such-page', ANONYMOUS).answer;

      expect(response.headers.get('location')).toBe(`${ORIGIN}/login?returnTo=%2Fno-such-page`);
    });

    it('also for a form submission', async () => {
      const response = await guard('/home', ANONYMOUS, { method: 'POST' }).answer;

      expect(response.headers.get('location')).toBe(`${ORIGIN}/login?returnTo=%2Fhome`);
    });

    it('passes the cookie header that clears an expired sign-in session on to the browser', async () => {
      const clearing = 'better-auth.session_token=; Max-Age=0; Path=/';

      const response = await guard('/home', { account: undefined, setCookies: [clearing] }).answer;

      expect(response.headers.getSetCookie()).toEqual([clearing]);
    });
  });

  describe('a signed-in browser gets the page', () => {
    it('without being redirected', async () => {
      const response = await guard('/home', SIGNED_IN).answer;

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
    });

    it('with the renewed sign-in session cookie (AC12)', async () => {
      const renewed = 'better-auth.session_token=abc.def; Max-Age=2592000; Path=/; HttpOnly';

      // The cookie of the stored language already matches, so only the session cookie goes out.
      const response = await guard(
        '/home',
        { ...SIGNED_IN, setCookies: [renewed] },
        { headers: { cookie: 'NEXT_LOCALE=nl-NL' } },
      ).answer;

      expect(response.headers.getSetCookie()).toEqual([renewed]);
    });

    it('asks about the cookies of the request', async () => {
      const { readSession, answer } = guard('/home', SIGNED_IN, {
        headers: { cookie: 'better-auth.session_token=abc.def' },
      });
      await answer;

      const headers = readSession.mock.calls[0] as unknown as [Headers];
      expect(headers[0].get('cookie')).toBe('better-auth.session_token=abc.def');
    });
  });

  // F010 AC2: the stored preference decides on every load, over whatever cookie this browser has.
  describe('a signed-in browser follows the language stored on the account', () => {
    const stored = (preferredLocale: 'nl-NL' | 'en' | null): SessionRead => ({
      account: { ...account, name: '', preferredLocale },
      setCookies: [],
    });
    const localeCookieOf = (response: Response) =>
      response.headers.getSetCookie().find((cookie) => cookie.startsWith('NEXT_LOCALE='));

    it('rewrites an older NEXT_LOCALE cookie, for the page and for the browser', async () => {
      const response = await guard('/home', stored('en'), {
        headers: { cookie: 'better-auth.session_token=abc.def; NEXT_LOCALE=nl-NL' },
      }).answer;

      expect(localeCookieOf(response)).toMatch(
        /^NEXT_LOCALE=en; Path=\/;.* Max-Age=31536000; SameSite=lax/i,
      );
      // The page of this very request is rendered with it, not with the older cookie.
      expect(response.headers.get('x-middleware-request-cookie')).toBe(
        'better-auth.session_token=abc.def; NEXT_LOCALE=en',
      );
    });

    it('adds the cookie to a browser that has none', async () => {
      const response = await guard('/home', stored('nl-NL'), {
        headers: { cookie: 'better-auth.session_token=abc.def' },
      }).answer;

      expect(localeCookieOf(response)).toContain('NEXT_LOCALE=nl-NL');
      expect(response.headers.get('x-middleware-request-cookie')).toBe(
        'better-auth.session_token=abc.def; NEXT_LOCALE=nl-NL',
      );
    });

    it('leaves a cookie that already matches alone', async () => {
      const response = await guard('/home', stored('en'), {
        headers: { cookie: 'better-auth.session_token=abc.def; NEXT_LOCALE=en' },
      }).answer;

      expect(localeCookieOf(response)).toBeUndefined();
      expect(response.headers.get('x-middleware-request-cookie')).toBeNull();
    });

    it('leaves the cookie alone while no language is stored', async () => {
      const response = await guard('/home', stored(null), {
        headers: { cookie: 'better-auth.session_token=abc.def; NEXT_LOCALE=en' },
      }).answer;

      expect(localeCookieOf(response)).toBeUndefined();
      expect(response.headers.get('x-middleware-request-cookie')).toBeNull();
    });

    it('keeps the renewed sign-in session cookie as well', async () => {
      const renewed = 'better-auth.session_token=abc.def; Max-Age=2592000; Path=/; HttpOnly';

      const response = await guard('/home', { ...stored('en'), setCookies: [renewed] }).answer;

      expect(response.headers.getSetCookie()).toContain(renewed);
      expect(localeCookieOf(response)).toContain('NEXT_LOCALE=en');
    });
  });

  // F064 AC18: the home page is the site's, and a signed-in browser goes on to the app.
  describe('a signed-in browser that opens the site’s home page goes to its home in the app', () => {
    const withSession = { headers: { cookie: 'better-auth.session_token=abc.def' } };

    it('is redirected to /home, with the renewed sign-in session cookie', async () => {
      const renewed = 'better-auth.session_token=abc.def; Max-Age=2592000; Path=/; HttpOnly';

      const response = await guard('/', { ...SIGNED_IN, setCookies: [renewed] }, withSession)
        .answer;

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${ORIGIN}/home`);
      expect(response.headers.getSetCookie()).toEqual([renewed]);
    });

    it('sets no language cookie itself: /home, where it goes, does', async () => {
      const response = await guard('/', SIGNED_IN, withSession).answer;

      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('shows the page to a browser whose sign-in session is gone, and clears its cookie', async () => {
      const clearing = 'better-auth.session_token=; Max-Age=0; Path=/';

      const response = await guard('/', { account: undefined, setCookies: [clearing] }, withSession)
        .answer;

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([clearing]);
    });

    it('still shows the page when the session cannot be read: the public home page does not depend on the database', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await guardRequest(new NextRequest(`${ORIGIN}/`, withSession), () =>
        Promise.reject(new Error('database down')),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
      // Logged by name only: an error from the database can quote what was asked.
      expect(error).toHaveBeenCalledOnce();
      expect(JSON.stringify(error.mock.calls)).not.toContain('database down');
      error.mockRestore();
    });

    it('AC16: an anonymous visitor, with no cookie at all, is not looked up and gets no cookie', async () => {
      const { readSession, answer } = guard('/', ANONYMOUS);

      const response = await answer;

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(readSession).not.toHaveBeenCalled();
    });

    it.each(['/en', '/prijzen', '/en/pricing'])(
      'does not touch another page of the site, %s, whatever cookies come with it',
      async (path) => {
        const { readSession, answer } = guard(path, SIGNED_IN, withSession);

        const response = await answer;

        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('location')).toBeNull();
        expect(readSession).not.toHaveBeenCalled();
      },
    );
  });

  it('fails closed: when the session cannot be read the page is not served', async () => {
    const request = new NextRequest(`${ORIGIN}/home`);

    await expect(
      guardRequest(request, () => Promise.reject(new Error('database down'))),
    ).rejects.toThrow('database down');
  });

  describe('public paths need no sign-in and are not even looked up', () => {
    it.each([
      '/',
      '/en',
      '/prijzen',
      '/en/pricing',
      '/sportscholen',
      '/en/sub-processors',
      '/login',
      '/login/confirm?token=abc',
      '/api/v1/health',
      '/api/v1/hello',
      '/api/v1/me',
      '/api/auth/sign-in/code/request',
      '/book/pilot-gym',
      '/book/pilot-gym/classes/42',
    ])('%s', async (path) => {
      const { readSession, answer } = guard(path, ANONYMOUS);

      const response = await answer;

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
      expect(readSession).not.toHaveBeenCalled();
    });
  });

  describe('isPublicPath matches whole path segments only', () => {
    it.each([
      ['/', true],
      // F064: the public website's pages, in both languages, whole paths only.
      ['/en', true],
      ['/sportscholen', true],
      ['/en/gyms', true],
      ['/prijzen', true],
      ['/en/sub-processors', true],
      // F064: the website's images, in whole folders; the app's own paths stay guarded.
      ['/site-images/scenes/gym-400.webp', true],
      ['/site-images/shots/app-home-nl-light-320.webp', true],
      ['/site-images', true],
      ['/site-imagesx/a.webp', false],
      ['/en/', false],
      ['/en/gyms/x', false],
      ['/english', false],
      ['/EN', false],
      ['/prijzen/', false],
      ['/login', true],
      ['/login/', true],
      ['/login/confirm', true],
      ['/book', true],
      ['/book/pilot-gym', true],
      ['/api', true],
      ['/api/v1/health', true],
      ['/.well-known/apple-app-site-association', true],
      ['/.well-known/assetlinks.json', true],
      ['/.well-known', false],
      ['/.well-known/other.json', false],
      ['/.well-known/assetlinks.json/x', false],
      ['/loginfo', false],
      ['/login-help', false],
      ['/booking', false],
      ['/bookmarks', false],
      ['/apiary', false],
      ['/home', false],
      ['/home/login', false],
      ['/welcome', false],
      ['/w/johns-gym', false],
      ['/w/book/x', false],
      ['//home', false],
      ['/%6Cogin', false],
    ])('%s -> %s', (path, expected) => {
      expect(isPublicPath(path)).toBe(expected);
    });
  });
});
