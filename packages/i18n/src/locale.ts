import { defaultLocale, type Locale, locales } from './config.ts';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Maps a BCP 47 tag to a catalog locale by its language subtag, so `nl-BE` → `nl-NL`
 * and `en-US` → `en`. Returns undefined for languages we don't have.
 */
export function matchLocale(tag: string | null | undefined): Locale | undefined {
  if (!tag) return undefined;
  if (isLocale(tag)) return tag;
  const language = tag.trim().toLowerCase().split(/[-_]/)[0];
  return locales.find((locale) => locale.toLowerCase().split('-')[0] === language);
}

/** Language tags from an Accept-Language header, most preferred first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { tag: tag.trim(), quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter(({ tag, quality }) => tag !== '' && tag !== '*' && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag }) => tag);
}

export interface LocaleSources {
  /** A choice made in this request or session, e.g. the language switch. */
  explicit?: string | null;
  /** The user's stored preference (`preferredLocale`). */
  stored?: string | null;
  /** The workspace's default communication language. */
  workspaceDefault?: string | null;
  /** Device or browser languages, most preferred first. */
  requested?: readonly string[];
}

/**
 * Locale resolution used on every platform (ADR-008, ROADMAP.md M2): explicit user
 * choice → stored preference → workspace default → device/browser → nl-NL.
 */
export function resolveLocale(sources: LocaleSources): Locale {
  const candidates = [
    sources.explicit,
    sources.stored,
    sources.workspaceDefault,
    ...(sources.requested ?? []),
  ];
  for (const candidate of candidates) {
    const locale = matchLocale(candidate);
    if (locale) return locale;
  }
  return defaultLocale;
}
