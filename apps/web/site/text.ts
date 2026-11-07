import {
  defaultTimeZone,
  formattingLocales,
  type Locale,
  type MessageKey,
  messages,
} from '@fivvi/i18n';
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

/**
 * Whether `key` is a message of the catalog: a dot path that ends at a text. For keys built at run
 * time (a page and a moment of its day), where the compiler cannot tell the valid ones; a key that
 * is not one fails the page at build time, not in front of a visitor.
 */
export function isMessageKey(key: string): key is MessageKey {
  let node: unknown = messages['nl-NL'];
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) return false;
    node = Object.getOwnPropertyDescriptor(node, part)?.value;
  }
  return typeof node === 'string';
}
