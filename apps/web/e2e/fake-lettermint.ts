import { createServer } from 'node:http';
import type { ReceivedEmail } from './lettermint';

// The fake Lettermint server (F001, E006), a Playwright web server (playwright.config.ts). The app
// posts its emails here like it would to Lettermint's `POST /v1/send`; the specs read them back with
// `GET /emails?to=<address>` (e2e/lettermint.ts). Emails are kept in memory until the server stops,
// so every spec uses an address of its own.

const port = Number(process.env.PORT);
if (!port) throw new Error('Set PORT to the port of the fake Lettermint server.');

const received: ReceivedEmail[] = [];

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  const json = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  if (request.method === 'POST' && url.pathname === '/v1/send') {
    if (!request.headers['x-lettermint-token']) {
      return json(401, { message: 'Missing x-lettermint-token.' });
    }
    const body = JSON.parse(await readBody(request)) as {
      to: string[];
      subject: string;
      text: string;
      html: string;
    };
    received.push({
      to: addressOf(body.to[0] ?? ''),
      subject: body.subject,
      text: body.text,
      html: body.html,
    });
    return json(202, { message_id: `fake-${received.length}`, status: 'pending' });
  }
  if (request.method === 'GET' && url.pathname === '/emails') {
    const to = url.searchParams.get('to')?.toLowerCase();
    return json(
      200,
      received.filter((email) => !to || email.to.toLowerCase() === to),
    );
  }
  // Playwright waits for this to answer before it starts the specs.
  if (request.method === 'GET' && url.pathname === '/') return json(200, { status: 'ok' });
  return json(404, { message: 'not found' });
}).listen(port, 'localhost');

/** The address of `Name <address>` or of a bare address, as the transport formats them. */
function addressOf(recipient: string): string {
  return /<([^>]+)>\s*$/.exec(recipient)?.[1] ?? recipient;
}

async function readBody(request: AsyncIterable<Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
