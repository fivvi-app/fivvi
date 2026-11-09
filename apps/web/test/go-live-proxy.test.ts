import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startGoLiveProxy, upstreamUrl } from '../e2e/go-live-proxy';

// F064 AC15: the go-live proxy forwards to the one server it is put in front of, and to no other.
describe('F064 go-live proxy upstreamUrl', () => {
  const upstream = 'http://127.0.0.1:3880';

  it('resolves a path on the upstream, with its query', () => {
    expect(upstreamUrl('/en/gyms?x=1', upstream)?.href).toBe('http://127.0.0.1:3880/en/gyms?x=1');
    expect(upstreamUrl('/', upstream)?.href).toBe('http://127.0.0.1:3880/');
  });

  it('refuses a request path that names another host', () => {
    expect(upstreamUrl('//evil.example/x', upstream)).toBeUndefined();
    expect(upstreamUrl('//127.0.0.1:9999/x', upstream)).toBeUndefined();
    expect(upstreamUrl('http://evil.example/x', upstream)).toBeUndefined();
    expect(upstreamUrl('\\\\evil.example\\x', upstream)).toBeUndefined();
  });
});

describe('F064 go-live proxy', () => {
  const servers: Server[] = [];
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          }),
      ),
    );
  });

  /** A GET with the path exactly as given: `fetch` would tidy a `//host` path before sending it. */
  function get(port: number, path: string): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
      httpRequest({ host: '127.0.0.1', port, path }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
        .on('error', reject)
        .end();
    });
  }

  it('answers 400 and sends nothing upstream for a path that names another host', async () => {
    const seen: string[] = [];
    const upstream = createServer((request, response) => {
      seen.push(request.url ?? '');
      response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    });
    servers.push(upstream);
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const proxy = await startGoLiveProxy(
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    );
    closers.push(proxy.close);
    const port = Number(new URL(proxy.origin).port);

    expect(await get(port, '//evil.example/x')).toBe(400);
    expect(seen).toEqual([]);
    expect(await get(port, '/en')).toBe(200);
    expect(seen).toEqual(['/en']);
  });
});
