import { Agent, createServer, request as httpRequest, type Server } from 'node:http';
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

/** The connections an HTTP server still has open. */
function upstreamConnections(server: Server): Promise<number> {
  return new Promise((resolve, reject) =>
    server.getConnections((error, count) => (error ? reject(error) : resolve(count))),
  );
}

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

  // The browser keeps its connections to the proxy open between pages, and the proxy keeps its own to
  // the upstream; neither may hold up the end of the run (the afterAll hook has 30 s).
  it('closes at once while a keep-alive connection is open, and the upstream one with it', async () => {
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    });
    servers.push(upstream);
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const proxy = await startGoLiveProxy(
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    );
    const agent = new Agent({ keepAlive: true });
    const status = await new Promise<number | undefined>((resolve, reject) => {
      httpRequest(
        { agent, host: '127.0.0.1', port: Number(new URL(proxy.origin).port), path: '/en' },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      )
        .on('error', reject)
        .end();
    });
    expect(status).toBe(200);

    const started = Date.now();
    await proxy.close();
    agent.destroy();

    expect(Date.now() - started).toBeLessThan(1000);
    // Nothing of the proxy is left on the upstream: its kept-alive connection is closed too.
    await expect.poll(() => upstreamConnections(upstream), { timeout: 1000 }).toBe(0);
  });

  it('closes at once while the upstream is still answering a request', async () => {
    const upstream = createServer(() => {
      // Never answers: a page that is still loading when the run ends.
    });
    servers.push(upstream);
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const proxy = await startGoLiveProxy(
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    );
    const port = Number(new URL(proxy.origin).port);
    const pending = get(port, '/slow').catch(() => undefined);
    while ((await upstreamConnections(upstream)) === 0) await new Promise((r) => setTimeout(r, 10));

    const started = Date.now();
    await proxy.close();

    expect(Date.now() - started).toBeLessThan(1000);
    await expect.poll(() => upstreamConnections(upstream), { timeout: 1000 }).toBe(0);
    await pending;
  });
});
