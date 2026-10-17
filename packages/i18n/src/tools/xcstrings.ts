import { defaultLocale, type Locale, locales } from '../config.ts';
import type { Analysis } from './analyze.ts';
import { argIndex, type CompiledMessage, hasArgs, type Part } from './icu.ts';

/** Language codes in the String Catalog. iOS matches `nl-BE` etc. to `nl`. */
export const appleLanguage: Record<Locale, string> = { 'nl-NL': 'nl', en: 'en' };

/**
 * Renders an iOS String Catalog (`Localizable.xcstrings`). Keys stay dot paths.
 *
 * - `{name}` → `%1$@`; arguments are numbered in the message's sorted order.
 * - A plural becomes a substitution `%1$#@count@` with one variation per plural
 *   category; `#` → `%arg`.
 * - Literal `%` is doubled only in strings with arguments, because only those go
 *   through `String(format:)`.
 */
export function renderXcstrings(analysis: Analysis): string {
  return renderCatalog(analysis, new Map(analysis.keys.map((key) => [key, key])));
}

/**
 * Info.plist keys localized by `InfoPlist.xcstrings`, and the catalog key each comes from.
 * Xcode's string catalog sync adds every localizable key of the app's Info.plist that the
 * catalog lacks (`CFBundleName` from `PRODUCT_NAME`), so each one is here: then a build leaves
 * the generated file unchanged (`pnpm test:ios` checks this).
 */
export const infoPlistKeys = { CFBundleDisplayName: 'app.name', CFBundleName: 'app.name' } as const;

/**
 * Renders the iOS `InfoPlist.xcstrings`: the localized Info.plist values, so the name under
 * the app icon comes from the catalog in nl and en.
 */
export function renderInfoPlistXcstrings(analysis: Analysis): string {
  return renderCatalog(analysis, new Map(Object.entries(infoPlistKeys)));
}

/** A String Catalog with one entry per `[entry name, catalog key]`. */
function renderCatalog(analysis: Analysis, entries: Map<string, string>): string {
  const strings: Record<string, unknown> = {};
  for (const [name, key] of entries) {
    const localizations: Record<string, unknown> = {};
    for (const locale of locales) {
      const message = analysis.compiled[locale].get(key);
      if (!message) throw new Error(`"${key}" is missing in ${locale}; run the checks first`);
      localizations[appleLanguage[locale]] = localization(message);
    }
    const comment = analysis.comments.get(key);
    strings[name] = {
      ...(comment ? { comment } : {}),
      extractionState: 'manual',
      localizations,
    };
  }
  const catalog = { sourceLanguage: appleLanguage[defaultLocale], strings, version: '1.0' };
  return `${toXcodeJson(catalog)}\n`;
}

function localization(message: CompiledMessage): unknown {
  const formatted = hasArgs(message);
  const render = (parts: Part[], pluralArg?: string): string =>
    parts
      .map((part) => {
        if (part.type === 'text') return formatted ? part.value.replaceAll('%', '%%') : part.value;
        if (part.type === 'count' || part.name === pluralArg) return '%arg';
        return specifier(message, part.name);
      })
      .join('');

  const { body } = message;
  if (body.kind === 'simple') return { stringUnit: unit(render(body.parts)) };

  const variations: Record<string, unknown> = {};
  for (const [category, parts] of Object.entries(body.branches)) {
    variations[category] = { stringUnit: unit(render(parts, body.arg)) };
  }
  const plural = `%${argIndex(message, body.arg)}$#@${body.arg}@`;
  return {
    stringUnit: unit(render(body.before) + plural + render(body.after)),
    substitutions: {
      [body.arg]: {
        argNum: argIndex(message, body.arg),
        formatSpecifier: 'lld',
        variations: { plural: variations },
      },
    },
  };
}

function specifier(message: CompiledMessage, name: string): string {
  const arg = message.args.find((a) => a.name === name);
  return `%${argIndex(message, name)}$${arg?.type === 'integer' ? 'lld' : '@'}`;
}

function unit(value: string) {
  return { state: 'translated', value };
}

/** JSON in Xcode's own layout (`"key" : value`, sorted keys), so Xcode doesn't reformat it. */
function toXcodeJson(value: unknown, indent = ''): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const inner = `${indent}  `;
  const entries = Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${inner}${JSON.stringify(key)} : ${toXcodeJson((value as Record<string, unknown>)[key], inner)}`,
    );
  return `{\n${entries.join(',\n')}\n${indent}}`;
}
