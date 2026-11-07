import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { noindexValue, robotsTxt } from '../site/indexing';

/**
 * The site as it will be at go-live (F064, AC15), for the budget check (`site-budgets.spec.ts`).
 *
 * Until the go-live ticket (#648) flips `siteIndexable`, the site says `noindex` in the markup and
 * in the `X-Robots-Tag` header, and `robots.txt` disallows everything; so does every server that is
 * not the `production` environment, the e2e servers included. Lighthouse marks that down in SEO. This
 * proxy sits between Lighthouse and an e2e server and shows what production will send with the
 * switch on, and nothing else changes:
 *
 * - the `X-Robots-Tag` header is removed, and `noindex, nofollow` in the markup becomes
 *   `index, follow` (the page may be indexed). It is changed in the whole document, not only in the
 *   `robots` meta tag: React builds the head again from the data the page carries for it;
 * - `robots.txt` is the one `robotsTxt` gives production with the switch on;
 * - `https://fivvi.app`, in the canonical URL, the alternates and the sitemap, becomes the
 *   proxy's own address, so a canonical URL that points at the page itself is judged as one.
 *
 * The switch stays off in the code, and so does the server: nothing here changes the site, only
 * what one test run reads from it. The spec checks first, with `robotsHeader`, that production
 * would index each page it measures.
 */
export interface GoLiveProxy {
  /** The proxy's address, `http://localhost:<port>`. */
  origin: string;
  close: () => Promise<void>;
}

const PRODUCTION = { RAILWAY_ENVIRONMENT_NAME: 'production' } as const;
const SITE_ORIGIN = 'https://fivvi.app';
/** The value `rootMetadata` gives the `robots` meta tag while the switch is off (`noindexValue`). */
const NOINDEX = noindexValue;
/** What the standalone server compresses (Next.js `compress`). */
const COMPRESSIBLE = /^text\/|javascript|json|xml|svg/;
const DROPPED_HEADERS = new Set([
  'x-robots-tag',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
  'keep-alive',
]);

/** `robots.txt` as production serves it with the switch on. */
export function goLiveRobotsTxt(origin: string): string {
  const { rules, sitemap } = robotsTxt(PRODUCTION, true);
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const lines = [`User-Agent: ${rule?.userAgent}`, `Allow: ${rule?.allow}`];
  if (sitemap) lines.push('', `Sitemap: ${String(sitemap).replace(SITE_ORIGIN, origin)}`);
  return `${lines.join('\n')}\n`;
}

/** Starts the proxy in front of `upstream` (an e2e server's address). */
export async function startGoLiveProxy(upstream: string): Promise<GoLiveProxy> {
  const server: Server = createServer(async (request, response) => {
    try {
      const origin = `http://${request.headers.host}`;
      const path = request.url ?? '/';
      if (path === '/robots.txt') {
        response.writeHead(200, { 'content-type': 'text/plain' }).end(goLiveRobotsTxt(origin));
        return;
      }
      const answer = await fetch(new URL(path, upstream), {
        headers: { 'accept-encoding': 'gzip' },
        redirect: 'manual',
      });
      const headers: Record<string, string> = {};
      for (const [name, value] of answer.headers) {
        if (!DROPPED_HEADERS.has(name)) headers[name] = value;
      }
      const type = answer.headers.get('content-type') ?? '';
      let body: Buffer | string = Buffer.from(await answer.arrayBuffer());
      if (/^text\/html|^application\/xml|^text\/xml/.test(type)) {
        body = body.toString().replaceAll(NOINDEX, 'index, follow').replaceAll(SITE_ORIGIN, origin);
      }
      // As the standalone server serves it, which compresses text, script and style with gzip.
      if (COMPRESSIBLE.test(type)) {
        body = gzipSync(body);
        headers['content-encoding'] = 'gzip';
      }
      response.writeHead(answer.status, headers).end(body);
    } catch (error) {
      response.writeHead(502).end(String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
