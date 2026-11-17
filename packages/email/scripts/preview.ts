// Local preview of every email of the catalog in both languages, rendered with its `previewProps`.
// Usage: pnpm email:preview [--port 3100] [--time-zone Europe/Amsterdam]
// `tsx watch` restarts the server when a template or the catalogs change; reload the page.
// The pages come from `src/preview.ts`; this file only puts a server in front of it. Synthetic
// data only, and it never reads the database.
//
// We don't use React Email's own `email dev`: it installs `@react-email/ui` and a separate
// Next.js app with npm at run time, outside our lockfile and pnpm's release-age check.
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { defaultTimeZone } from '@fivvi/i18n';
import { previewResponse } from '../src/preview.ts';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '3100' },
    'time-zone': { type: 'string', default: defaultTimeZone },
  },
});
const port = Number(values.port);
const timeZone = values['time-zone'];

const server = createServer((request, response) => {
  const handle = async () => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const answer = await previewResponse(url.pathname, { timeZone });
    response.writeHead(answer.status, { 'content-type': answer.contentType });
    response.end(answer.body);
  };
  handle().catch((error: unknown) => {
    console.error(error);
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? (error.stack ?? error.message) : String(error));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Email preview: http://localhost:${port}`);
});
