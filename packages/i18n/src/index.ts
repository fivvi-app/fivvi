import en from '../en.json' with { type: 'json' };
import nlNL from '../nl-NL.json' with { type: 'json' };
import type { Locale } from './config.ts';

export {
  type DateTimeFormatName,
  dateTimeFormats,
  defaultLocale,
  defaultTimeZone,
  type FormattingLocale,
  formattingLocales,
  type Locale,
  locales,
} from './config.ts';
export {
  isLocale,
  type LocaleSources,
  matchLocale,
  parseAcceptLanguage,
  resolveLocale,
} from './locale.ts';

/** Message tree of the source catalog. `en.json` must have the same shape. */
export type Messages = typeof nlNL;

export const messages: Record<Locale, Messages> = { 'nl-NL': nlNL, en };

type LeafKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : LeafKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every message key as a dot path, e.g. `'hello.title'`. */
export type MessageKey = LeafKeys<Messages>;
