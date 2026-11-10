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
import type { EmailTemplate } from './render.tsx';

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

  it('AC1: lists every email of the spec table, EM-01 … EM-23, and EM-34 once', () => {
    const ids = catalog.map((entry) => entry.id);
    const expected = Array.from(
      { length: 23 },
      (_, index) => `EM-${String(index + 1).padStart(2, '0')}`,
    );
    expect(ids).toEqual([...expected, 'EM-34']);
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
    expect(templateOf('EM-34')).toBe('email-change-code');
  });

  it('AC1: only the emails with a template today are active, EM-01 is retired, the rest reserved', () => {
    const byStatus = (status: string) =>
      catalog.filter((entry) => entry.status === status).map((entry) => entry.id);
    expect(byStatus('active')).toEqual(['EM-04', 'EM-08', 'EM-09', 'EM-11', 'EM-34']);
    expect(byStatus('retired')).toEqual(['EM-01']);
    expect(byStatus('reserved')).toEqual([
      'EM-02',
      'EM-03',
      'EM-05',
      'EM-06',
      'EM-07',
      'EM-10',
      'EM-12',
      'EM-13',
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
