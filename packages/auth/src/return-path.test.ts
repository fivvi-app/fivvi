import { describe, expect, it } from 'vitest';
import { loginPath, returnPathFrom, SIGNED_IN_HOME, safeReturnPath } from './return-path';

describe('F001 AC13 return path', () => {
  describe('keeps a path of this site', () => {
    it.each([
      ['/home', '/home'],
      ['/w/pilot-gym/calendar?view=week', '/w/pilot-gym/calendar?view=week'],
      ['/w/pilot-gym/clients/42/notes', '/w/pilot-gym/clients/42/notes'],
      ['/home?a=1&b=2', '/home?a=1&b=2'],
      ['/', '/'],
    ])('%s', (value, expected) => {
      expect(safeReturnPath(value)).toBe(expected);
    });
  });

  describe('ignores anything that could leave this site', () => {
    it.each([
      ['an address on another site', 'https://evil.example/home'],
      ['an address with another scheme', 'javascript:alert(1)'],
      ['a data address', 'data:text/html,<script>alert(1)</script>'],
      ['a protocol-relative address', '//evil.example/home'],
      ['a protocol-relative address with a backslash', '/\\evil.example/home'],
      ['a backslash address', '\\\\evil.example'],
      ['a path with a backslash', '/home\\..\\..\\evil'],
      ['a tab inside the slashes, which browsers drop', '/\t/evil.example'],
      ['a newline inside the slashes', '/\n/evil.example'],
      ['a carriage return', '/\r/evil.example'],
      ['dot segments that normalise to a protocol-relative address', '/.//evil.example'],
      ['dot segments that climb to one', '/a/..//evil.example'],
      ['a path that does not start with a slash', 'home'],
      ['an address with user info', 'https://user\u0040evil.example/home'],
      ['an empty value', ''],
      ['a path past the length limit', `/${'a'.repeat(3000)}`],
    ])('%s', (_, value) => {
      expect(safeReturnPath(value)).toBeUndefined();
    });

    it('a missing value', () => {
      expect(safeReturnPath(undefined)).toBeUndefined();
      expect(safeReturnPath(null)).toBeUndefined();
    });

    it('a value that is not text (a repeated query parameter)', () => {
      expect(safeReturnPath(['/home', '/other'])).toBeUndefined();
    });
  });

  describe('ignores encoded forms of an address on another site (the emailed link, #207)', () => {
    it.each([
      ['an encoded absolute address', 'https%3A%2F%2Fevil.example%2Fhome'],
      ['an encoded protocol-relative address', '%2F%2Fevil.example%2Fhome'],
      ['an encoded first slash', '%2Fhome'],
      ['an encoded backslash address', '%5C%5Cevil.example'],
      ['a double-encoded address', '%252F%252Fevil.example'],
      ['a scheme in capitals', 'HTTPS://evil.example/home'],
      ['a scheme with leading space', ' https://evil.example/home'],
      ['a leading space before a protocol-relative address', ' //evil.example/home'],
      ['a null byte before the host', '/\u0000/evil.example'],
      ['a mixed slash and backslash', '/\\/evil.example'],
    ])('%s', (_, value) => {
      expect(safeReturnPath(value)).toBeUndefined();
    });

    // Percent-encoded slashes and backslashes after the first `/` stay encoded inside one path
    // segment of this site: a browser never decodes them into another host.
    it.each([
      '/%2F/evil.example',
      '/%5Cevil.example',
      '/%2Fevil.example',
      '/home?next=https://evil.example',
    ])('keeps %s as a path of this site, never another host', (value) => {
      const kept = safeReturnPath(value);
      expect(kept).toBe(value);
      expect(new URL(kept ?? '', 'https://fivvi.example').origin).toBe('https://fivvi.example');
    });
  });

  describe('does not return to the sign-in page itself', () => {
    it.each(['/login', '/login/confirm?token=abc', '/login?returnTo=%2Fhome'])('%s', (value) => {
      expect(safeReturnPath(value)).toBeUndefined();
    });

    it('but keeps a path that only starts with the same letters', () => {
      expect(safeReturnPath('/loginfo')).toBe('/loginfo');
    });
  });

  describe('the sign-in address of a page that needs sign-in', () => {
    it('carries the page and its query string', () => {
      expect(loginPath('/w/pilot-gym/calendar', '?view=week')).toBe(
        '/login?returnTo=%2Fw%2Fpilot-gym%2Fcalendar%3Fview%3Dweek',
      );
    });

    it('is the plain sign-in page when there is nothing worth returning to', () => {
      expect(loginPath('/login', '')).toBe('/login');
      expect(loginPath('//evil.example', '')).toBe('/login');
    });

    it('drops the parameter Next.js adds to its own page requests', () => {
      expect(loginPath('/home', '?_rsc=abc123')).toBe('/login?returnTo=%2Fhome');
      expect(loginPath('/home', '?x=1&_rsc=abc123')).toBe('/login?returnTo=%2Fhome%3Fx%3D1');
    });

    it('round-trips through safeReturnPath', () => {
      const href = loginPath('/w/a b/c', '?q=ä&r=1');
      const value = new URL(href, 'https://fivvi.app').searchParams.get('returnTo');
      expect(safeReturnPath(value)).toBe('/w/a%20b/c?q=%C3%A4&r=1');
    });
  });

  it('the signed-in home is a path of this site', () => {
    expect(safeReturnPath(SIGNED_IN_HOME)).toBe(SIGNED_IN_HOME);
  });

  describe('the return path of a sign-in page query', () => {
    it.each([
      [{ returnTo: '/w/pilot-gym/calendar?view=week' }, '/w/pilot-gym/calendar?view=week'],
      [{ returnTo: 'https://evil.example/home' }, SIGNED_IN_HOME],
      [{ returnTo: ['/home', '/other'] }, SIGNED_IN_HOME],
      [{ returnTo: '/login' }, SIGNED_IN_HOME],
      [{ token: 'abc' }, SIGNED_IN_HOME],
      [{}, SIGNED_IN_HOME],
    ])('%j goes to %s', (query, expected) => {
      expect(returnPathFrom(query)).toBe(expected);
    });
  });
});
