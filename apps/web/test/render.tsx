import type { Locale } from '@trainer-hub/i18n';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { intlConfig } from '../i18n/config';

/** Renders `page` to HTML in `locale`, with the same next-intl configuration as a request. */
export function render(locale: Locale, page: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider {...intlConfig(locale)}>{page}</NextIntlClientProvider>,
  );
}

/** The text as React renders it in HTML. */
export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll("'", '&#x27;');
}
