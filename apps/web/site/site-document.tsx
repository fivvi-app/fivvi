import { formattingLocales, type Locale } from '@fivvi/i18n';
import type { ReactNode } from 'react';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * The document of a site page, for the root layout of a language (F064). The language is the
 * path's, so the layouts never ask the request for it: every visitor gets the same page.
 * `data-theme="client"` and the touch density are the public look (`@fivvi/ui`'s README, Themes);
 * the body's canvas is the base style's.
 */
export function SiteDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={formattingLocales[locale]}>
      <body
        data-theme="client"
        data-density="touch"
        className="min-h-dvh overflow-x-hidden antialiased"
      >
        <SiteHeader locale={locale} />
        <main id="main">{children}</main>
        <SiteFooter locale={locale} />
      </body>
    </html>
  );
}
