// Local preview of every template in every locale, rendered with its `previewProps`.
// Usage: pnpm email:preview [--port 3100] [--time-zone Europe/Amsterdam]
// `tsx watch` restarts the server when a template or the catalogs change; reload the page.
//
// We don't use React Email's own `email dev`: it installs `@react-email/ui` and a separate
// Next.js app with npm at run time, outside our lockfile and pnpm's release-age check.
// This is a developer tool, so its page chrome is not translated.
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { defaultTimeZone, isLocale, locales } from '@trainer-hub/i18n';
import { type EmailTemplate, renderEmail, templates } from '../src/index.ts';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '3100' },
    'time-zone': { type: 'string', default: defaultTimeZone },
  },
});
const port = Number(values.port);
const timeZone = values['time-zone'];

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

async function indexPage(): Promise<string> {
  const rows: string[] = [];
  for (const template of templates as readonly EmailTemplate<unknown>[]) {
    for (const locale of locales) {
      const { subject } = await renderEmail(template, template.previewProps, { locale, timeZone });
      const base = `/${template.id}/${locale}`;
      rows.push(
        `<tr><td>${template.id}</td><td>${locale}</td><td>${escapeHtml(subject)}</td>` +
          `<td><a href="${base}">HTML</a> · <a href="${base}.txt">text</a></td></tr>`,
      );
    }
  }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Email preview</title>
<style>body{font:14px system-ui;margin:2rem}td,th{padding:.4rem .8rem;text-align:left;border-bottom:1px solid #ddd}</style>
<h1>Email preview</h1><p>Time zone: ${escapeHtml(timeZone)}</p>
<table><tr><th>Template</th><th>Locale</th><th>Subject</th><th></th></tr>${rows.join('')}</table>`;
}

const server = createServer((request, response) => {
  const handle = async () => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(await indexPage());
      return;
    }
    const [, id, file = ''] = url.pathname.split('/');
    const text = file.endsWith('.txt');
    const locale = text ? file.slice(0, -'.txt'.length) : file;
    const template = (templates as readonly EmailTemplate<unknown>[]).find((t) => t.id === id);
    if (!template || !isLocale(locale)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const email = await renderEmail(template, template.previewProps, { locale, timeZone });
    response.writeHead(200, {
      'content-type': text ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
    });
    response.end(text ? `Subject: ${email.subject}\n\n${email.text}` : email.html);
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
