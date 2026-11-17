import { defaultTimeZone, isLocale, locales } from '@fivvi/i18n';
import { type AnyEmailTemplate, catalog, internalCatalog } from './catalog.ts';
import { renderEmail } from './render.tsx';

/**
 * The local preview of every email of the catalog (F049, AC7), behind `pnpm email:preview`. It
 * reads the catalog and each template's synthetic `previewProps`, and nothing else: no database,
 * no API, no environment variables. `scripts/preview.ts` only puts a web server in front of it.
 * It is a developer tool, so its page chrome is not translated.
 */

export interface PreviewEntry {
  /** `EM-02`, or the key of an internal email. */
  label: string;
  status: 'active' | 'reserved' | 'retired';
  /** Who gets it, `internal` for the emails that go to Fivvi itself. */
  audience?: string;
  /** The feature that builds it. */
  owner?: string;
  /** Only an active entry has a template to show. */
  template?: AnyEmailTemplate;
  note?: string;
}

/** Every entry of the catalog, then the internal emails, in catalog order. */
export function previewEntries(): PreviewEntry[] {
  return [
    ...catalog.map((entry): PreviewEntry => {
      if (entry.status === 'retired') {
        return { label: entry.id, status: 'retired', note: entry.reason };
      }
      return {
        label: entry.id,
        status: entry.status,
        audience: entry.audience,
        owner: entry.owner.join(', '),
        template: entry.status === 'active' ? entry.template : undefined,
        note: entry.note,
      };
    }),
    ...internalCatalog.map(
      (entry): PreviewEntry => ({
        label: entry.key,
        status: 'active',
        audience: entry.audience,
        owner: entry.owner.join(', '),
        template: entry.template,
        note: entry.note,
      }),
    ),
  ];
}

export interface PreviewOptions {
  /** The time zone dates are shown in. Default: Europe/Amsterdam. */
  timeZone?: string;
}

export interface PreviewResponse {
  status: 200 | 404;
  contentType: string;
  body: string;
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

async function indexPage(timeZone: string): Promise<string> {
  const rows: string[] = [];
  for (const entry of previewEntries()) {
    const { template } = entry;
    const meta =
      `<td>${escapeHtml(entry.label)}</td><td>${escapeHtml(entry.status)}</td>` +
      `<td>${escapeHtml(entry.audience ?? '')}</td><td>${escapeHtml(entry.owner ?? '')}</td>`;
    if (!template) {
      rows.push(`<tr>${meta}<td></td><td></td><td>${escapeHtml(entry.note ?? '')}</td></tr>`);
      continue;
    }
    for (const locale of locales) {
      const { subject } = await renderEmail(template, template.previewProps, { locale, timeZone });
      const base = `/${template.id}/${locale}`;
      rows.push(
        `<tr>${meta}<td>${locale}</td><td>${escapeHtml(subject)}</td>` +
          `<td><a href="${base}">HTML</a> · <a href="${base}.txt">text</a></td></tr>`,
      );
    }
  }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Email preview</title>
<style>body{font:14px system-ui;margin:2rem}td,th{padding:.4rem .8rem;text-align:left;border-bottom:1px solid #ddd}</style>
<h1>Email preview</h1><p>Every email of the catalog, in both languages, with synthetic data. Time zone: ${escapeHtml(timeZone)}</p>
<table><tr><th>ID</th><th>Status</th><th>Audience</th><th>Owner</th><th>Locale</th><th>Subject</th><th></th></tr>${rows.join('')}</table>`;
}

/** The answer to `GET <pathname>`: the index, `/<template id>/<locale>` (HTML) or `….txt` (text). */
export async function previewResponse(
  pathname: string,
  { timeZone = defaultTimeZone }: PreviewOptions,
): Promise<PreviewResponse> {
  if (pathname === '/') {
    return {
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: await indexPage(timeZone),
    };
  }
  const [, id, file = ''] = pathname.split('/');
  const text = file.endsWith('.txt');
  const locale = text ? file.slice(0, -'.txt'.length) : file;
  const template = previewEntries().find((entry) => entry.template?.id === id)?.template;
  if (!template || !isLocale(locale)) {
    return { status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found' };
  }
  const email = await renderEmail(template, template.previewProps, { locale, timeZone });
  return text
    ? {
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: `Subject: ${email.subject}\n\n${email.text}`,
      }
    : { status: 200, contentType: 'text/html; charset=utf-8', body: email.html };
}
