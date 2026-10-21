import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type CaptureTransport, createCaptureTransport } from '@fivvi/observability';

export interface FakeSentry {
  /** A DSN that points at this server, for `SENTRY_DSN`. */
  dsn: string;
  /** Events the server received, after the reporter's scrubbing. */
  events: CaptureTransport['events'];
  close(): Promise<void>;
}

/**
 * A stand-in for Sentry's ingest endpoint on the loopback interface, so a test can watch what
 * a separate process sends, without any real network.
 */
export async function startFakeSentry(): Promise<FakeSentry> {
  const capture = createCaptureTransport();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      void capture
        .send({ url: request.url ?? '', body: Buffer.concat(chunks) })
        .then(() => response.writeHead(200).end('{}'));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    dsn: `http://public@127.0.0.1:${port}/1`,
    events: capture.events,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
