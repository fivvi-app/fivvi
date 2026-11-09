import { type Locale, locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../test/render';
import { LegalPage, legalMetadata } from './legal-page';
import { legalDocuments, legalHtml } from './legal-text';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe.each(
  legalDocuments.flatMap((document) => locales.map((locale) => [document, locale] as const)),
)('F064 AC10 the %s page in %s', (document, locale) => {
  const copy = messages[locale].site;

  it('has one h1, the page’s own name, and the status line (AC19), all in the HTML', () => {
    const page = html(<LegalPage document={document} locale={locale} />);

    expect(page.match(/<h1[ >]/g)).toHaveLength(1);
    expect(page).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy[document].headline)}</h1>`));
    expect(page).toContain(escapeHtml(copy.home.status));
    expect(page).not.toContain('<script');
  });

  it('shows the text of docs/legal for the language, whole', () => {
    const page = html(<LegalPage document={document} locale={locale} />);

    expect(page).toContain(legalHtml(document, locale));
  });

  it('shows no open value and no draft notice', () => {
    const page = html(<LegalPage document={document} locale={locale} />);

    expect(page).not.toContain('{{');
    expect(page).not.toContain('⚠️');
  });
});

describe('F064 AC10 the pages are in their own language, not the other’s', () => {
  it.each(legalDocuments)('the %s texts differ between the languages', (document) => {
    expect(legalHtml(document, 'nl-NL')).not.toBe(legalHtml(document, 'en'));
  });
});

describe('F064 the legal pages’ metadata', () => {
  it.each(
    legalDocuments.flatMap((document) => locales.map((locale) => [document, locale] as const)),
  )(
    'has the catalog’s title and description of %s in %s, not the other language’s',
    (document, locale) => {
      const other: Locale = locale === 'en' ? 'nl-NL' : 'en';
      const { title, description } = legalMetadata(document, locale);

      expect(title).toBe(messages[locale].site[document].metaTitle);
      expect(description).toBe(messages[locale].site[document].metaDescription);
      expect(title).not.toBe(messages[other].site[document].metaTitle);
    },
  );
});
