import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import type { MetadataRoute } from 'next';
import { robotsTxt } from '../site/indexing';

/**
 * The site as production serves it (F064, AC15), for the budget check (`site-budgets.spec.ts`).
 *
 * Since go-live (#648) `siteIndexable` is `true`, so the markup of the site carries no `robots` tag
 * in any environment. What still differs from production is the environment: every server that is
 * not the `production` environment, the e2e servers and every preview included, sends `noindex` as
 * the `X-Robots-Tag` header and a `robots.txt` that disallows everything. Lighthouse marks that
 * down in SEO. This proxy sits between Lighthouse and such a server and shows what production
 * sends, and nothing else changes:
 *
 * - the `X-Robots-Tag` header is removed;
 * - `robots.txt` is the one `robotsTxt` gives production: the site allowed, the sitemap named;
 * - `https://fivvi.app`, in the canonical URL, the alternates and the sitemap, becomes the
 *   proxy's own address, so a canonical URL that points at the page itself is judged as one.
 *
 * Nothing here changes the site, only what one test run reads from it. The spec checks first, with
 * `robotsHeader`, that production would index each page it measures.
 */
export interface GoLiveProxy {
  /** The proxy's address, `http://localhost:<port>`. */
  origin: string;
  close: () => Promise<void>;
}

/** The environment of production, for `robotsHeader` and `robotsTxt`. */
export const PRODUCTION = { RAILWAY_ENVIRONMENT_NAME: 'production' } as const;
const SITE_ORIGIN = 'https://fivvi.app';
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

/**
 * What Next.js writes for the rules of a `robots.ts` route (one rule, one sitemap, as `robotsTxt`
 * gives). The route itself cannot give the production file: it reads the environment of the server,
 * which says "not production" here. The spec checks that this writes the same as
 * the server for the rules the server does give.
 */
export function robotsFile(robots: MetadataRoute.Robots): string {
  const { rules, sitemap } = robots;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const lines = [`User-Agent: ${rule?.userAgent}`];
  if (rule?.allow) lines.push(`Allow: ${rule.allow}`);
  if (rule?.disallow) lines.push(`Disallow: ${rule.disallow}`);
  // A rule ends with a blank line, the sitemap comes after it.
  return `${lines.join('\n')}\n\n${sitemap ? `Sitemap: ${String(sitemap)}\n` : ''}`;
}

/** `robots.txt` as production serves it with the switch on, the sitemap at the proxy's address. */
export function goLiveRobotsTxt(origin: string): string {
  return robotsFile(robotsTxt(PRODUCTION, true)).replaceAll(SITE_ORIGIN, origin);
}

/**
 * The address on the upstream a request path asks for, or `undefined` when it would leave the
 * upstream: a path that starts with `//host/` (or `\\host`) or is a full URL resolves to another
 * origin with `new URL(path, upstream)`, and the proxy must not fetch for whoever can reach its port.
 */
export function upstreamUrl(path: string, upstream: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(path, upstream);
  } catch {
    return undefined;
  }
  return url.origin === new URL(upstream).origin ? url : undefined;
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
      const target = upstreamUrl(path, upstream);
      if (!target) {
        response.writeHead(400, { 'content-type': 'text/plain' }).end('Not a path on the upstream');
        return;
      }
      const answer = await fetch(target, {
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
        body = body.toString().replaceAll(SITE_ORIGIN, origin);
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
