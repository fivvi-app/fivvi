import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Locale, locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import {
  checkLegalText,
  type LegalDocument,
  legalDocuments,
  legalFile,
  legalHtml,
  renderLegalText,
} from './legal-text';

const legalDir = path.resolve(import.meta.dirname, '../../../../docs/legal');
const read = (document: LegalDocument, locale: Locale) =>
  readFileSync(path.join(legalDir, legalFile(document, locale)), 'utf8');

const clean = '# Title\n\nSome text.\n\n## 1. Who?\n\nWe are Fivvi.\n';

describe('F064 AC10 an unfinished legal text fails the build', () => {
  it('accepts a text with no open value and no draft notice', () => {
    expect(() => checkLegalText(clean, 'privacy-policy.nl.md')).not.toThrow();
  });

  it('refuses an open {{…}} value, naming the file and the value', () => {
    const text = `${clean}\nOur address is {{Adres}}.\n`;

    expect(() => checkLegalText(text, 'privacy-policy.nl.md')).toThrow(
      /privacy-policy\.nl\.md.*\{\{Adres\}\}/s,
    );
  });

  it('refuses an open value that is not closed, such as {{Adres}', () => {
    const text = `${clean}\nOur address is {{Adres} and more.\n`;

    expect(() => checkLegalText(text, 'privacy-policy.en.md')).toThrow(
      /privacy-policy\.en\.md.*\{\{/s,
    );
  });

  it.each([
    ['Dutch', '> **⚠️ GEEN JURIDISCH ADVIES.** Een jurist heeft dit niet gecontroleerd.'],
    ['English', '> **⚠️ NOT LEGAL ADVICE.** No lawyer has checked this.'],
  ])('refuses a draft notice in %s', (_language, notice) => {
    expect(() => checkLegalText(`# Title\n\n${notice}\n\n${clean}`, 'terms.nl.md')).toThrow(
      /draft notice/,
    );
  });

  it('refuses a draft notice that is not at the top', () => {
    const text = `${clean}\n> **⚠️ Concept.** Not final.\n`;

    expect(() => checkLegalText(text, 'terms.en.md')).toThrow(/terms\.en\.md.*draft notice/s);
  });

  it('does not let the renderer publish such a text', () => {
    expect(() => renderLegalText(`${clean}\n{{x}}\n`, 'en', 'terms.en.md')).toThrow(/\{\{x\}\}/);
  });

  it.each(
    legalDocuments.flatMap((document) => locales.map((locale) => [document, locale] as const)),
  )('passes the real text of %s in %s', (document, locale) => {
    const text = read(document, locale);

    expect(text.length).toBeGreaterThan(5000);
    expect(() => checkLegalText(text, legalFile(document, locale))).not.toThrow();
  });
});

describe.each(
  legalDocuments.flatMap((document) => locales.map((locale) => [document, locale] as const)),
)('F064 AC10 the %s text in %s', (document, locale) => {
  const source = read(document, locale);
  const html = legalHtml(document, locale);

  it('is the file’s own text: every heading of the file is in the HTML', () => {
    const headings = [...source.matchAll(/^(#{2,3}) (.+)$/gm)].map(
      ([, level = '', heading = '']) => ({
        level: level.length,
        heading,
      }),
    );

    expect(headings.length).toBeGreaterThan(5);
    for (const { level, heading } of headings) {
      expect(html).toMatch(
        new RegExp(
          `<h${level}[^>]*>${heading.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h${level}>`,
        ),
      );
    }
  });

  it('leaves out the file’s own title, because the page head has it', () => {
    expect(html).not.toContain('<h1');
  });

  it('is plain HTML: no script, no open value, no draft notice', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('⚠️');
  });

  it('links to no Markdown file and to no relative address that is not the site’s', () => {
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map(([, href = '']) => href);

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toMatch(/\.md(#|$)/);
      expect(href).toMatch(/^(https?:\/\/|\/|mailto:)/);
    }
  });
});

describe('F064 AC10 a table of a legal text', () => {
  const table = '| A | B |\n|---|---|\n| 1 | 2 |\n';

  it('sits in a region named after the heading above it, which a keyboard can focus', () => {
    const html = renderLegalText(`${clean}\n## 2. Data\n\n${table}`, 'en', 'x.md');

    expect(html).toMatch(/<div role="region" aria-label="2\. Data" tabindex="0">\s*<table>/);
  });

  it('is refused before the first heading, as there is nothing to name it', () => {
    expect(() => renderLegalText(table, 'en', 'x.md')).toThrow(/table before its first heading/);
  });
});

describe('F064 AC10 the links of the legal texts are the site’s own pages', () => {
  it('points the translation link of the Dutch privacy policy to the English page', () => {
    const html = legalHtml('privacy', 'nl-NL');

    expect(html).toContain('href="/en/privacy"');
    expect(html).toContain('hreflang="en"');
    // The visitor reads the name of the page, not the name of a file.
    expect(html).not.toContain('privacy-policy.en.md');
    expect(html).toContain(`>${messages.en.site.privacy.headline}</a>`);
  });

  it('points the translation link of the English terms to the Dutch page', () => {
    const html = legalHtml('terms', 'en');

    expect(html).toContain('href="/voorwaarden"');
    expect(html).toContain('hreflang="nl"');
    expect(html).not.toContain('terms.nl.md');
    expect(html).toContain(`>${messages['nl-NL'].site.terms.headline}</a>`);
  });

  it('turns a link to a file of docs/legal into the page of the language it is read in', () => {
    const text = `${clean}\nSee [the sub-processors](sub-processors.md) and [the terms](terms.en.md).\n`;
    const html = renderLegalText(text, 'en', 'privacy-policy.en.md');

    expect(html).toContain('href="/en/sub-processors"');
    expect(html).toContain('href="/en/terms"');
    const dutch = renderLegalText(text, 'nl-NL', 'privacy-policy.nl.md');
    expect(dutch).toContain('href="/subverwerkers"');
  });

  it('refuses a relative link that is not a page of the site, so no link is a 404', () => {
    expect(() =>
      renderLegalText(`${clean}\nSee [the DPIA](dpia-assessment.md).\n`, 'en', 'terms.en.md'),
    ).toThrow(/dpia-assessment\.md/);
  });

  it('refuses raw HTML, which the texts do not need', () => {
    expect(() =>
      renderLegalText(`${clean}\n<script>alert(1)</script>\n`, 'en', 'terms.en.md'),
    ).toThrow(/raw HTML/);
  });

  it('keeps links to other websites as they are', () => {
    const html = renderLegalText(
      `${clean}\n[AP](https://autoriteitpersoonsgegevens.nl)\n`,
      'en',
      'x.md',
    );

    expect(html).toContain('href="https://autoriteitpersoonsgegevens.nl"');
  });
});
