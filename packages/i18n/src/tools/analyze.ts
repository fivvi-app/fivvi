import { defaultLocale, type Locale, locales } from '../config.ts';
import {
  androidName,
  type CatalogSet,
  catalogFile,
  commentsFile,
  flattenCatalog,
} from './catalog.ts';
import { type CompiledMessage, compileMessage } from './icu.ts';

/** The catalogs, compiled and checked. Exporters only run when both problem lists are empty. */
export interface Analysis {
  /** Every key found in any locale, sorted. */
  keys: string[];
  compiled: Record<Locale, Map<string, CompiledMessage>>;
  comments: Map<string, string>;
  /** Keys and placeholders that don't match across locales, and invalid key names. */
  parity: string[];
  /** Messages that don't parse or use ICU the native exporters can't convert. */
  icu: string[];
}

export function analyze(set: CatalogSet): Analysis {
  const parity: string[] = [];
  const icu: string[] = [];
  const flat = Object.fromEntries(
    locales.map((locale) => {
      const catalog = flattenCatalog(set.messages[locale], catalogFile(locale));
      parity.push(...catalog.errors);
      return [locale, catalog.entries];
    }),
  ) as Record<Locale, Map<string, string>>;

  const keys = [...new Set(locales.flatMap((locale) => [...flat[locale].keys()]))].sort();

  for (const key of keys) {
    const present = locales.filter((locale) => flat[locale].has(key));
    for (const locale of locales) {
      if (!flat[locale].has(key)) {
        parity.push(
          `"${key}" is in ${present.map(catalogFile).join(', ')} but missing from ${catalogFile(locale)}`,
        );
      }
    }
  }

  const byAndroidName = new Map<string, string>();
  for (const key of keys) {
    const name = androidName(key);
    const other = byAndroidName.get(name);
    if (other) {
      parity.push(`"${other}" and "${key}" both become Android resource "${name}"; rename one`);
    } else {
      byAndroidName.set(name, key);
    }
  }

  const compiled = Object.fromEntries(locales.map((locale) => [locale, new Map()])) as Record<
    Locale,
    Map<string, CompiledMessage>
  >;
  for (const locale of locales) {
    for (const [key, source] of flat[locale]) {
      const result = compileMessage(source, locale);
      if (result.ok) {
        compiled[locale].set(key, result.message);
      } else {
        for (const error of result.errors) icu.push(`${catalogFile(locale)}: "${key}": ${error}`);
      }
    }
  }

  for (const key of keys) {
    const signatures = locales.map((locale) => {
      const message = compiled[locale].get(key);
      return message && signature(message);
    });
    const reference = signatures[0];
    if (signatures.some((s) => s === undefined) || signatures.every((s) => s === reference)) {
      continue; // missing or unparsable messages are already reported
    }
    const described = locales.map((locale, i) => `${locale} ${signatures[i]}`).join(', ');
    parity.push(`"${key}" has different placeholders per locale: ${described}`);
  }

  const comments = new Map<string, string>();
  if (typeof set.comments !== 'object' || set.comments === null || Array.isArray(set.comments)) {
    parity.push(`${commentsFile} must be an object of "key": "comment"`);
  } else {
    for (const [key, comment] of Object.entries(set.comments)) {
      if (typeof comment !== 'string' || comment.trim() === '') {
        parity.push(`${commentsFile}: "${key}" must be a non-empty string`);
      } else if (!flat[defaultLocale].has(key)) {
        parity.push(`${commentsFile}: "${key}" is not a key in ${catalogFile(defaultLocale)}`);
      } else {
        comments.set(key, comment);
      }
    }
  }

  return { keys, compiled, comments, parity, icu };
}

function signature(message: CompiledMessage): string {
  if (message.args.length === 0) return '(no placeholders)';
  return message.args
    .map((arg) => `{${arg.name}${arg.type === 'integer' ? ', plural' : ''}}`)
    .join(' ');
}
