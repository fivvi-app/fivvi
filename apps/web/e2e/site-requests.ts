import type { Request } from '@playwright/test';

/**
 * The requests of a site page that are not the page sending anything: images that come near as the
 * page scrolls, Next.js's prefetch of the links to other pages of the site (it carries
 * `next-router-prefetch`), and the script chunks of the pages it prefetched (code, not data: the
 * Studios page has a client component of its own). Anything else after a page has loaded would be
 * a switch or a booking sending something, a `router.refresh()` (`/?_rsc=…` without that header)
 * included.
 */
export function isImageOrPrefetch(request: Request) {
  return (
    request.resourceType() === 'image' ||
    (request.resourceType() === 'script' &&
      new URL(request.url()).pathname.startsWith('/_next/static/')) ||
    request.headers()['next-router-prefetch'] !== undefined
  );
}
