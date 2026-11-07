import { defaultTimeZone, formattingLocales, type Locale, messages } from '@fivvi/i18n';
import { createTranslator } from 'next-intl';

/**
 * The translator of a site page. The language is the page's own, from its path, so this takes no
 * request (no cookie, no header) and the pages stay static, unlike `useTranslations`, which asks
 * the request for the language (ADR-030). Keys are the catalog's (`site.home.headline`).
 */
export function siteText(locale: Locale) {
  return createTranslator({
    locale: formattingLocales[locale],
    messages: messages[locale],
    timeZone: defaultTimeZone,
  });
}

export type SiteText = ReturnType<typeof siteText>;
