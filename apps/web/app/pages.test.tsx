import { type Locale, locales, messages } from '@trainer-hub/i18n';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { intlConfig } from '../i18n/config';
import NotFound from './not-found';
import HomePage from './page';

function render(locale: Locale, page: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider {...intlConfig(locale)}>{page}</NextIntlClientProvider>,
  );
}

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('E005 web pages in %s', (locale) => {
  it('renders the translated hello title on the home page', () => {
    expect(render(locale, <HomePage />)).toBe(
      `<main><h1>${messages[locale].hello.title}</h1></main>`,
    );
  });

  it('renders the translated not-found page', () => {
    const { title, body } = messages[locale].notFound;
    expect(render(locale, <NotFound />)).toBe(
      `<main><h1>${title}</h1><p>${escapeHtml(body)}</p></main>`,
    );
  });
});

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll("'", '&#x27;');
}
