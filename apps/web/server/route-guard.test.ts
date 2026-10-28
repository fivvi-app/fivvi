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

      const response = await guard('/home', { ...SIGNED_IN, setCookies: [renewed] }).answer;

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

  it('fails closed: when the session cannot be read the page is not served', async () => {
    const request = new NextRequest(`${ORIGIN}/home`);

    await expect(
      guardRequest(request, () => Promise.reject(new Error('database down'))),
    ).rejects.toThrow('database down');
  });

  describe('public paths need no sign-in and are not even looked up', () => {
    it.each([
      '/',
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
      ['/login', true],
      ['/login/', true],
      ['/login/confirm', true],
      ['/book', true],
      ['/book/pilot-gym', true],
      ['/api', true],
      ['/api/v1/health', true],
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
