import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RootLayout from './layout';
import NotFound from './not-found';
import HomePage from './page';

function renderInLayout(page: ReactNode): string {
  return renderToStaticMarkup(<RootLayout>{page}</RootLayout>);
}

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

describe('E001 web skeleton', () => {
  it('renders the home page inside the root layout', () => {
    expect(renderInLayout(<HomePage />)).toMatch(
      /^<html lang="nl-NL">.*<body><main><\/main><\/body><\/html>$/,
    );
  });

  // No user-facing copy until the i18n package exists (E005).
  it.each([
    ['home page', <HomePage key="home" />],
    ['not-found page', <NotFound key="not-found" />],
  ])('renders no user-facing copy on the %s', (_name, page) => {
    expect(visibleText(renderInLayout(page))).toBe('');
  });
});
