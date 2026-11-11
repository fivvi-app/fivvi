import { describe, expect, it } from 'vitest';
import { platformOf } from './rate-limit.ts';

describe('platformOf: the platform label of a sign-in request refusal', () => {
  const headers = (userAgent?: string) =>
    new Headers(userAgent === undefined ? {} : { 'user-agent': userAgent });

  it('a request that came through the HTTP router is the web, whatever its user agent says', () => {
    const request = new Request('https://fivvi.example.test/api/auth/sign-in/code/request');
    expect(platformOf(request, headers('okhttp/5.0 (Android 16)'))).toBe('web');
  });

  it.each(['okhttp/5.0.0', 'FivviPro/1.0 (Linux; Android 16)'])(
    'a call without a request and with the Android HTTP stack (%s) is android',
    (userAgent) => {
      expect(platformOf(undefined, headers(userAgent))).toBe('android');
    },
  );

  it.each(['FivviPro/1.0 CFNetwork/3860 Darwin/26.0', ''])(
    'any other call without a request (%j) is ios',
    (userAgent) => {
      expect(platformOf(undefined, headers(userAgent))).toBe('ios');
    },
  );

  it('a call without headers is ios', () => {
    expect(platformOf(undefined, undefined)).toBe('ios');
  });
});
