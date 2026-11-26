import { describe, expect, it } from 'vitest';
import { pageApiHeaders } from './api-headers';

describe('F014 the headers of a page’s own API requests (#1595)', () => {
  it('carry the request’s sign-in cookie and the page’s language as Accept-Language', () => {
    const headers = pageApiHeaders(
      new Headers({
        cookie: 'session=abc; NEXT_LOCALE=nl-NL',
        'accept-language': 'en-GB,en;q=0.9',
        authorization: 'Bearer x',
      }),
      'nl-NL',
    );

    // The page’s language, not the browser’s: the page may take it from the language cookie.
    expect(headers).toEqual({
      cookie: 'session=abc; NEXT_LOCALE=nl-NL',
      'accept-language': 'nl-NL',
    });
  });

  it('send no cookie for a request that has none', () => {
    expect(pageApiHeaders(new Headers(), 'en')).toEqual({ 'accept-language': 'en' });
  });
});
