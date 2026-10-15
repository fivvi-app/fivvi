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

  it('renders the translated not-found page', () => {
    const { title, body } = messages[locale].notFound;
    expect(render(locale, <NotFound />)).toBe(
      `<main><h1>${title}</h1><p>${escapeHtml(body)}</p></main>`,
    );
  });
});

describe.each(locales)('E007 hello page in %s', (locale) => {
  it('labels the first-name form with catalog copy', () => {
    const { description, firstNameLabel, continue: submit } = messages[locale].hello;
    const html = render(locale, <Hello firstName="" />);
    expect(html).toContain(`>${escapeHtml(description)}</div>`);
    expect(html).toMatch(
      new RegExp(`<label[^>]*for="first-name"[^>]*>${htmlPattern(firstNameLabel)}</label>`),
    );
    expect(html).toMatch(
      new RegExp(`<button[^>]*type="submit"[^>]*>${htmlPattern(submit)}</button>`),
    );
    expect(html).not.toContain('role="status"');
  });

  it('greets the first name sent by the form', () => {
    const greeting = messages[locale].hello.formGreeting.replace('{name}', 'Sam');
    expect(render(locale, <Hello firstName="Sam" />)).toContain(
      `<p role="status">${escapeHtml(greeting)}</p>`,
    );
  });
});

/** A regular expression source that matches the text as React renders it in HTML. */
function htmlPattern(text: string): string {
  return escapeHtml(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll("'", '&#x27;');
}
