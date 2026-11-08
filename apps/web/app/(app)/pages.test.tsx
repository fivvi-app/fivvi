import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { escapeHtml, render } from '../../test/render';
import NotFound from './not-found';

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('E005 web pages in %s', (locale) => {
  it('renders the translated not-found page', () => {
    const { title, body } = messages[locale].notFound;
    expect(render(locale, <NotFound />)).toBe(
      `<main><h1>${title}</h1><p>${escapeHtml(body)}</p></main>`,
    );
  });
});
