/**
 * The icon files of `app/` (#669): the favicon in each format a browser, an iPhone's home screen or
 * a search engine asks for (`scripts/brand-icons.ts` makes them). They are fetched without a session
 * and say nothing about a page, so the route guard leaves them open and the `noindex` header skips
 * them.
 */
export const ICON_FILES: readonly string[] = [
  '/favicon.ico',
  '/icon.svg',
  '/icon.png',
  '/apple-icon.png',
];
