import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type Locale, locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../test/render';
import { subProcessors } from './sub-processors';
import { SubProcessorsPage, subProcessorsMetadata } from './sub-processors-page';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

const legalFile = path.resolve(import.meta.dirname, '../../../../docs/legal/sub-processors.md');

/**
 * The services the legal file lists as sub-processors or as processors for the provider's own
 * purposes: the bold names in the first column of the tables of its sections 1 and 2.
 */
function servicesInLegalFile(): string[] {
  const text = readFileSync(legalFile, 'utf8');
  const start = text.indexOf('## 1.');
  const end = text.indexOf('## 3.');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  // Each table is there in Dutch and in English, so a name comes twice.
  const names = [...text.slice(start, end).matchAll(/^\| \*\*([^*]+)\*\* \|/gm)].flatMap(
    ([, name]) => (name ? [name.trim()] : []),
  );
  return [...new Set(names)];
}

describe('F064 AC11 the sub-processors page stays in step with docs/legal/sub-processors.md', () => {
  const inFile = servicesInLegalFile();

  it('reads the services of the legal file', () => {
    expect(inFile.length).toBeGreaterThanOrEqual(5);
    expect(new Set(inFile).size).toBe(inFile.length);
  });

  it('lists every service of the legal file', () => {
    const onPage = subProcessors.map(({ name }) => name);

    expect(inFile.filter((name) => !onPage.includes(name))).toEqual([]);
  });

  it('lists no service the legal file does not', () => {
    const onPage = subProcessors.map(({ name }) => name);

    expect(onPage.filter((name) => !inFile.includes(name))).toEqual([]);
  });

  it('is about the email provider of ADR-028, not Brevo', () => {
    expect(subProcessors.map(({ name }) => name)).toContain('Lettermint');
    expect(subProcessors.map(({ name }) => name)).not.toContain('Brevo');
  });
});

const agreementFile = path.resolve(
  import.meta.dirname,
  '../../../../docs/legal/verwerkersovereenkomst.md',
);

/** The rows of the sub-processor tables of Annex 3, Dutch first and English second. */
function agreementRows(): string[][] {
  const text = readFileSync(agreementFile, 'utf8');
  const tables = [...text.matchAll(/^\| (?:Dienst|Service) \| .*\n\|[-| ]+\|\n((?:\|.*\n?)+)/gm)];
  return tables.map(([, body]) => (body ?? '').trim().split('\n'));
}

describe('E006 the processor agreement names the same email sub-processor as the legal file', () => {
  it('AC2: has one sub-processor table in Dutch and one in English, with the same services', () => {
    const tables = agreementRows();
    const [nl, en] = tables;

    expect(tables).toHaveLength(2);
    expect(nl?.length).toBe(en?.length);
    const names = (rows?: string[]) => rows?.map((row) => row.split('|')[1]?.trim());
    expect(names(nl)).toEqual(names(en));
  });

  it('AC1: lists Lettermint in both tables, as in the legal file', () => {
    const legal = readFileSync(legalFile, 'utf8');
    const region =
      'EU: infrastructuur in Amsterdam (UpCloud) en Duitsland (OVH, versleutelde back-ups)';
    const regionEn =
      'EU: infrastructure in Amsterdam (UpCloud) and Germany (OVH, encrypted backups)';
    expect(legal).toContain(region);
    expect(legal).toContain(regionEn);

    const [nl, en] = agreementRows();
    expect(nl).toContain(`| Lettermint B.V. | Transactionele e-mail | ${region} |`);
    expect(en).toContain(`| Lettermint B.V. | Transactional email | ${regionEn} |`);
  });

  it('AC3: no longer names Brevo or Sendinblue anywhere', () => {
    expect(readFileSync(agreementFile, 'utf8')).not.toMatch(/brevo|sendinblue/i);
  });

  it('AC3: only the dated records of the replacement still name Brevo in docs/legal', () => {
    const legalDir = path.dirname(agreementFile);
    const files = readdirSync(legalDir).filter((name) => name.endsWith('.md'));
    const naming = files.filter((name) =>
      /brevo|sendinblue/i.test(readFileSync(path.join(legalDir, name), 'utf8')),
    );
    expect(naming).toEqual(['open-questions.md', 'sub-processors.md']);
  });
});

describe.each(locales)('F064 AC11 the sub-processors page in %s', (locale) => {
  const copy = messages[locale].site;
  const t = copy.subProcessors;

  it('has one h1, the lead and the status line (AC19), all in the HTML', () => {
    const page = html(<SubProcessorsPage locale={locale} />);

    expect(page.match(/<h1[ >]/g)).toHaveLength(1);
    expect(page).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(t.headline)}</h1>`));
    expect(page).toContain(escapeHtml(t.lead));
    expect(page).toContain(escapeHtml(copy.home.status));
    expect(page).not.toContain('<script');
    expect(page).not.toContain('{{');
  });

  it('lists every service in a table with what it is for and where it stores', () => {
    const page = html(<SubProcessorsPage locale={locale} />);

    for (const heading of [t.service, t.purposeColumn, t.storage]) {
      expect(page).toMatch(new RegExp(`<th[^>]*>${escapeHtml(heading)}</th>`));
    }
    expect(page.match(/<tbody>.*<\/tbody>/s)?.[0].match(/<tr>/g)).toHaveLength(
      subProcessors.length,
    );
    for (const { name, purpose, region } of subProcessors) {
      expect(page).toContain(escapeHtml(name));
      expect(page).toContain(escapeHtml(t.purpose[purpose]));
      expect(page).toContain(escapeHtml(t.region[region]));
    }
  });

  // AC15: the table scrolls sideways on a phone, so a keyboard must be able to reach it, and a screen
  // reader must hear what it is (axe: scrollable-region-focusable).
  it('puts the table that scrolls in a labelled region a keyboard can focus', () => {
    const page = html(<SubProcessorsPage locale={locale} />);
    const region = page.match(/<section[^>]*overflow-x-auto[^>]*>/)?.[0] ?? '';

    expect(region).toContain('tabindex="0"');
    expect(region).toContain(`aria-label="${escapeHtml(t.listLabel)}"`);
  });

  it('names Mollie in a separate role, not in the table', () => {
    const page = html(<SubProcessorsPage locale={locale} />);
    const table = page.match(/<table.*<\/table>/s)?.[0] ?? '';

    expect(page).toContain(escapeHtml(t.mollieHeading));
    expect(page).toContain(escapeHtml(t.mollie));
    expect(t.mollie).toContain('Mollie');
    expect(table).not.toContain('Mollie');
  });
});

describe('F064 the sub-processors page’s metadata', () => {
  it.each(locales)(
    'has the catalog’s title and description in %s, not the other language’s',
    (locale) => {
      const other: Locale = locale === 'en' ? 'nl-NL' : 'en';
      const { title, description } = subProcessorsMetadata(locale);

      expect(title).toBe(messages[locale].site.subProcessors.metaTitle);
      expect(description).toBe(messages[locale].site.subProcessors.metaDescription);
      expect(title).not.toBe(messages[other].site.subProcessors.metaTitle);
    },
  );
});
