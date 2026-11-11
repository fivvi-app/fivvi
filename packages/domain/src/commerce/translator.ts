// The translator of the commerce rules: the wording is in the catalogs, never in the rules.

import { formattingLocales, type Locale, messages } from '@fivvi/i18n';
import { createTranslator } from 'use-intl/core';

export type Translator = (key: string, values?: Record<string, string | number>) => string;

const translators = new Map<Locale, Translator>();

// The wording is in the catalogs (`offers.*`), never here. A missing key or placeholder throws, so
// a broken message fails the tests instead of reaching a client.
export function translatorFor(locale: Locale): Translator {
  let translator = translators.get(locale);
  if (!translator) {
    const created = createTranslator({
      locale: formattingLocales[locale],
      messages: messages[locale],
      onError: (error) => {
        throw error;
      },
    });
    translator = (key, values) => created(key as never, values as never);
    translators.set(locale, translator);
  }
  return translator;
}
