import { type Locale, locales, messages } from '@trainer-hub/i18n';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { intlConfig } from '../i18n/config';
import { Hello } from './hello';
import NotFound from './not-found';

function render(locale: Locale, page: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider {...intlConfig(locale)}>{page}</NextIntlClientProvider>,
  );
}

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('E005 web pages in %s', (locale) => {
  it('renders the translated hello title on the home page', () => {
    expect(render(locale, <Hello firstName="" />)).toContain(
      `<h1>${messages[locale].hello.title}</h1>`,
    );
  });

  it('labels the hello form with translated copy', () => {
    const { description, firstNameLabel, greet } = messages[locale].hello;
    const html = render(locale, <Hello firstName="" />);
    expect(html).toContain(`>${escapeHtml(description)}</div>`);
    expect(html).toMatch(new RegExp(`<label[^>]*for="first-name"[^>]*>${firstNameLabel}</label>`));
    expect(html).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*>${greet}</button>`));
    expect(html).not.toContain('role="status"');
  });

  it('greets the first name sent by the hello form', () => {
    const greeting = messages[locale].hello.greeting.replace('{name}', 'Sam');
    expect(render(locale, <Hello firstName="Sam" />)).toContain(`<p role="status">${greeting}</p>`);
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
