import { readFileSync } from 'node:fs';
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

/**
 * ADR-028 decided that Lettermint replaces Brevo; the cutover is #398, so the code may still use
 * Brevo for now. The legal file is updated by #642 (owner-only) and still says Brevo here, so it
 * stands for Lettermint, the provider the page names. Once #642 has landed the file says Lettermint,
 * this rename does nothing, and this test can drop it.
 */
const renamedSince: Record<string, string> = { Brevo: 'Lettermint' };

describe('F064 AC11 the sub-processors page stays in step with docs/legal/sub-processors.md', () => {
  const inFile = servicesInLegalFile().map((name) => renamedSince[name] ?? name);

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
