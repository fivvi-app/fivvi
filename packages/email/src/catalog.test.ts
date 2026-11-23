import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import {
  type CatalogEntry,
  catalog,
  checkCatalog,
  type InternalEntry,
  internalCatalog,
  templates,
} from './catalog.ts';
import { createLettermintTransport, lettermintRequestBody } from './lettermint.ts';
import { createMemoryTransport } from './memory.ts';
import { createEmailContext, type EmailTemplate, renderEmail } from './render.tsx';
import { createSendEmail } from './send.ts';
import { checkContent, checkLinks, checkRendering, checkSyntheticData } from './template-checks.ts';
import { dutch, english } from './test-languages.ts';

const templatesDirectory = fileURLToPath(new URL('./templates/', import.meta.url));

/** Every template that exists as a file under `src/templates/`, found by importing the files. */
async function templatesOnDisk(): Promise<EmailTemplate<unknown>[]> {
  const files = readdirSync(templatesDirectory).filter(
    (file) => file.endsWith('.tsx') && !file.includes('.test.'),
  );
  const found: EmailTemplate<unknown>[] = [];
  for (const file of files) {
    const module = (await import(`${templatesDirectory}${file}`)) as Record<string, unknown>;
    for (const value of Object.values(module)) {
      const candidate = value as Partial<EmailTemplate<unknown>> | null;
      if (
        candidate &&
        typeof candidate.id === 'string' &&
        typeof candidate.subject === 'function' &&
        typeof candidate.render === 'function'
      ) {
        found.push(candidate as EmailTemplate<unknown>);
      }
    }
  }
  return found;
}

const sampleTemplate = (id: string): EmailTemplate<unknown> => ({
  id,
  subject: () => '',
  preview: () => '',
  render: () => null as never,
  userContent: [],
  previewProps: {},
});

const reserved = (id: `EM-${number}`): CatalogEntry => ({
  id,
  status: 'reserved',
  audience: 'client',
  owner: ['F031'],
  subjectKeys: ['email.sample.subject'],
});

const active = (id: `EM-${number}`, template: EmailTemplate<unknown>): CatalogEntry => ({
  id,
  status: 'active',
  audience: 'client',
  owner: ['F031'],
  subjectKeys: ['email.signIn.subject'],
  template,
});

describe('F049 AC1: the email catalog', () => {
  it('AC1: every template that exists is in the catalog, and every active entry has a template', async () => {
    const onDisk = await templatesOnDisk();
    expect(onDisk.length).toBeGreaterThan(0);
    expect(checkCatalog({ catalog, internalCatalog, templatesOnDisk: onDisk })).toEqual([]);
    for (const template of onDisk) expect(templates).toContain(template);
    expect(templates).toHaveLength(onDisk.length);
  });

  it('AC1: lists every email of the spec table, EM-01 … EM-23, and EM-34 to EM-36 once', () => {
    const ids = catalog.map((entry) => entry.id);
    const expected = Array.from(
      { length: 23 },
      (_, index) => `EM-${String(index + 1).padStart(2, '0')}`,
    );
    expect(ids).toEqual([...expected, 'EM-34', 'EM-35', 'EM-36']);
  });

  it('AC1: the existing templates are registered under their IDs', () => {
    const templateOf = (id: string) => {
      const entry = catalog.find((candidate) => candidate.id === id);
      return entry?.status === 'active' ? entry.template.id : undefined;
    };
    expect(templateOf('EM-04')).toBe('private-session-moved');
    expect(templateOf('EM-08')).toBe('sign-in');
    expect(templateOf('EM-09')).toBe('trainer-invitation');
    expect(templateOf('EM-11')).toBe('private-session');
    expect(templateOf('EM-13')).toBe('trainer-change');
    expect(templateOf('EM-34')).toBe('email-change-code');
    expect(templateOf('EM-35')).toBe('email-changed-notice');
    expect(templateOf('EM-36')).toBe('email-change-taken-notice');
  });

  it('AC1: only the emails with a template today are active, EM-01 is retired, the rest reserved', () => {
    const byStatus = (status: string) =>
      catalog.filter((entry) => entry.status === status).map((entry) => entry.id);
    expect(byStatus('active')).toEqual([
      'EM-04',
      'EM-08',
      'EM-09',
      'EM-11',
      'EM-13',
      'EM-34',
      'EM-35',
      'EM-36',
    ]);
    expect(byStatus('retired')).toEqual(['EM-01']);
    expect(byStatus('reserved')).toEqual([
      'EM-02',
      'EM-03',
      'EM-05',
      'EM-06',
      'EM-07',
      'EM-10',
      'EM-12',
      'EM-14',
      'EM-15',
      'EM-16',
      'EM-17',
      'EM-18',
      'EM-19',
      'EM-20',
      'EM-21',
      'EM-22',
      'EM-23',
    ]);
  });

  it('AC1: internal emails (no client, trainer or owner) have no EM ID', () => {
    expect(internalCatalog.map((entry) => entry.key)).toEqual(['demo-request', 'hello']);
    for (const entry of internalCatalog as readonly InternalEntry[]) {
      expect(entry).not.toHaveProperty('id');
    }
  });

  it('AC1: an entry has its audience, owner feature and subject keys', () => {
    for (const entry of catalog) {
      if (entry.status === 'retired') continue;
      expect(entry.audience, entry.id).toBeTruthy();
      expect(entry.owner.length, entry.id).toBeGreaterThan(0);
      expect(entry.subjectKeys.length, entry.id).toBeGreaterThan(0);
    }
  });

  it('AC1: the subject keys of an active entry exist in both languages', () => {
    for (const entry of [...catalog, ...internalCatalog]) {
      if (entry.status !== 'active') continue;
      for (const key of entry.subjectKeys) {
        for (const locale of locales) {
          const value = key.split('.').reduce<unknown>((node, part) => {
            return node && typeof node === 'object'
              ? (node as Record<string, unknown>)[part]
              : undefined;
          }, messages[locale]);
          expect(typeof value, `${locale} ${key}`).toBe('string');
        }
      }
    }
  });

  it('AC1: a template that is not in the catalog is reported', () => {
    const stray = sampleTemplate('stray');
    const problems = checkCatalog({
      catalog: [],
      internalCatalog: [],
      templatesOnDisk: [stray],
    });
    expect(problems).toEqual([expect.stringContaining('stray')]);
  });

  it('AC1: an active entry without a template is reported', () => {
    const entry = { ...reserved('EM-02'), status: 'active' } as unknown as CatalogEntry;
    const problems = checkCatalog({ catalog: [entry], internalCatalog: [], templatesOnDisk: [] });
    expect(problems).toEqual([expect.stringContaining('EM-02')]);
  });

  it('AC1: two entries sharing an ID are reported', () => {
    const template = sampleTemplate('one');
    const other = sampleTemplate('two');
    const problems = checkCatalog({
      catalog: [active('EM-02', template), active('EM-02', other)],
      internalCatalog: [],
      templatesOnDisk: [template, other],
    });
    expect(problems).toEqual([expect.stringContaining('EM-02')]);
  });

  it('AC1: one template under two entries is reported', () => {
    const template = sampleTemplate('one');
    const problems = checkCatalog({
      catalog: [active('EM-02', template), active('EM-03', template)],
      internalCatalog: [],
      templatesOnDisk: [template],
    });
    expect(problems).toEqual([expect.stringContaining('one')]);
  });

  it('AC1: a reserved or retired entry needs no template', () => {
    const retired: CatalogEntry = { id: 'EM-01', status: 'retired', reason: 'ADR-026' };
    const problems = checkCatalog({
      catalog: [retired, reserved('EM-02')],
      internalCatalog: [],
      templatesOnDisk: [],
    });
    expect(problems).toEqual([]);
  });

  it('AC1: a reserved entry that carries a template is reported (flip it to active)', () => {
    const template = sampleTemplate('one');
    const entry = { ...reserved('EM-02'), template } as unknown as CatalogEntry;
    const problems = checkCatalog({
      catalog: [entry],
      internalCatalog: [],
      templatesOnDisk: [template],
    });
    expect(problems.length).toBeGreaterThan(0);
  });
});

// F049 (#719): one checklist for every email of the catalog. The suite walks `catalog` and
// `internalCatalog`, so a template that is registered as active is checked without a change here.
const checked = [
  ...catalog.flatMap((entry) =>
    entry.status === 'active'
      ? [{ name: `${entry.id} ${entry.template.id}`, template: entry.template, internal: false }]
      : [],
  ),
  ...internalCatalog.map((entry) => ({
    name: `${entry.key} (internal)`,
    template: entry.template,
    internal: true,
  })),
];

describe('F049 the catalog suite walks every active entry', () => {
  it('checks every template of the catalog, the internal ones included', () => {
    expect(checked.length).toBe(templates.length);
    expect(checked.map(({ template }) => template)).toEqual([...templates]);
  });
});

describe('AC2: both languages, same keys, subject length, plain text', () => {
  it.each(checked)('$name', async ({ template }) => {
    expect(await checkRendering(template)).toEqual([]);
  });
});

describe('AC5: no tracking, no redirects, no List-Unsubscribe', () => {
  it.each(checked)(
    '$name: links go to fivvi.app only, with no pixel or tracker',
    async ({ template, internal }) => {
      expect(await checkLinks(template, { allowMailto: internal })).toEqual([]);
    },
  );

  it.each(checked)(
    '$name: the message carries no List-Unsubscribe header',
    async ({ template }) => {
      const transport = createMemoryTransport();
      const send = createSendEmail({
        transport,
        sender: { email: 'noreply@fivvi.app' },
        replyTo: { email: 'support@example.com' },
      });
      for (const locale of [dutch, english]) {
        await send({
          template,
          props: template.previewProps,
          to: { email: 'anna@example.com' },
          locale,
          event: 'check',
        });
      }
      expect(transport.sent).toHaveLength(2);
      for (const email of transport.sent) {
        expect(email).not.toHaveProperty('headers');
        const request = lettermintRequestBody(email, {
          signIn: 'sign-in-route',
          mail: 'mail-route',
        });
        expect(request).not.toHaveProperty('headers');
        expect(JSON.stringify(request)).not.toMatch(/list-unsubscribe/i);
        expect(email.html + email.text).not.toMatch(/list-unsubscribe/i);
      }
    },
  );
});

describe("AC6: user content escaped and in the recipient's language, never translated", () => {
  it.each(checked)('$name', async ({ template }) => {
    expect(await checkContent(template)).toEqual([]);
  });
});

describe('AC7: the preview data is synthetic', () => {
  it.each(checked)('$name: only example.com addresses', async ({ template }) => {
    expect(await checkSyntheticData(template)).toEqual([]);
  });
});

// #1514: Outlook.com put a Fivvi email in Junk. Two of the likely causes were in our code: the hidden
// padding of invisible characters React Email's `<Preview>` adds, and a `noreply@` sender with no Reply-To.
describe('#1514: no hidden padding in the preview line', () => {
  const invisible = ['\u200B', '\u200C', '\u200D', '\u200E', '\u200F', '\uFEFF'];

  it.each(checked)(
    '$name: the HTML has its preview line and none of the invisible characters',
    async ({ template }) => {
      for (const locale of locales) {
        const ctx = createEmailContext({ locale });
        const preview = template.preview(ctx, template.previewProps);
        const { html } = await renderEmail(template, template.previewProps, { locale });
        expect(preview.trim()).not.toBe('');
        expect(html).toContain(preview.replaceAll('&', '&amp;').replaceAll("'", '&#x27;'));
        for (const character of invisible) {
          expect(html, `${locale}: U+${character.codePointAt(0)?.toString(16)}`).not.toContain(
            character,
          );
        }
        // The filler of `<Preview>` is `&nbsp;` too: the hidden block holds the preview line and nothing else.
        const hidden = /<div [^>]*display:none[^>]*>(.*?)<\/div>/s.exec(html);
        expect(hidden?.[1]).toBeDefined();
        expect(hidden?.[1]).not.toContain('\u00A0');
        expect(hidden?.[1]).not.toContain('&nbsp;');
        expect(hidden?.[1]?.length).toBeLessThanOrEqual(preview.length * 2);
      }
    },
  );
});

describe('#1514: every email carries a Reply-To', () => {
  const replyTo = { email: 'support@example.com' };

  it.each(checked)(
    '$name: the Lettermint request has reply_to, the capture transport records it',
    async ({ template }) => {
      const requests: Record<string, unknown>[] = [];
      const fetch = (_url: string | URL | Request, init: RequestInit = {}) => {
        requests.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Promise.resolve(
          new Response(JSON.stringify({ message_id: 'msg-1', status: 'pending' }), {
            status: 202,
          }),
        );
      };
      const lettermint = createSendEmail({
        transport: createLettermintTransport({
          apiToken: 'lm-test-not-a-real-token',
          routes: { signIn: 'sign-in-route', mail: 'mail-route' },
          fetch: fetch as typeof globalThis.fetch,
        }),
        sender: { email: 'noreply@fivvi.app', name: 'Fivvi' },
        replyTo,
      });
      const capture = createMemoryTransport();
      const captured = createSendEmail({
        transport: capture,
        sender: { email: 'noreply@fivvi.app' },
        replyTo,
      });
      for (const [send, locale] of [
        [lettermint, dutch],
        [captured, english],
      ] as const) {
        await send({
          template,
          props: template.previewProps,
          to: { email: 'anna@example.com' },
          locale,
          event: 'reply-to',
        });
      }
      expect(requests).toHaveLength(1);
      expect(requests[0]?.reply_to).toEqual(['support@example.com']);
      expect(capture.sent.map((email) => email.replyTo)).toEqual([replyTo]);
    },
  );
});
