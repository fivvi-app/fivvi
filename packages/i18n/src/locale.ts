import { type Locale, locales } from './config.ts';

/** The interface language when nothing supported is chosen, stored or requested (ADR-017). */
const interfaceFallback: Locale = 'en';

/**
 * Cookie the language switch of the sign-in page sets next to `NEXT_LOCALE`, holding the chosen
 * language. Only an explicit choice on that page puts it there, so signing in saves it as the
 * account's language and then removes it (F010); the language the route guard writes into
 * `NEXT_LOCALE` for a signed-in browser never counts as a choice.
 */
export const SIGN_IN_LANGUAGE_COOKIE = 'FIVVI_SIGN_IN_LANGUAGE';

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

/** What is known about the person in front of the screen, for their interface language. */
export interface InterfaceLanguageSources {
  /** A choice made in this request or session, e.g. the language switch. */
  explicit?: string | null;
  /** The user's stored preference (`preferredLocale`). */
  stored?: string | null;
  /** A booking link's fixed language, on public booking pages only. */
  bookingLink?: string | null;
  /** Device or browser languages, most preferred first. */
  requested?: readonly string[];
}

/**
 * The language a screen shows and the `locale` it sends to the API (ADR-017): explicit
 * choice → stored preference → a booking link's fixed language → the first supported
 * device/browser language → `en`. Unsupported values are skipped. The workspace's default
 * communication language never decides it.
 */
export function resolveInterfaceLanguage(sources: InterfaceLanguageSources): Locale {
  const candidates = [
    sources.explicit,
    sources.stored,
    sources.bookingLink,
    ...(sources.requested ?? []),
  ];
  for (const candidate of candidates) {
    const locale = matchLocale(candidate);
    if (locale) return locale;
  }
  return interfaceFallback;
}

/** What is known about the recipient of an email or other message. */
export interface CommunicationLanguageSources {
  /** The recipient's stored preference, including the language a client chose while booking. */
  recipientPreference?: string | null;
  /** The workspace's default communication language. Every workspace has one. */
  workspaceDefault: Locale;
}

/**
 * The language of an email or other message to a recipient (ADR-017): their stored
 * preference → the workspace's default communication language.
 */
export function resolveCommunicationLanguage(sources: CommunicationLanguageSources): Locale {
  return matchLocale(sources.recipientPreference) ?? sources.workspaceDefault;
}

/** What is known about the recipient of a sign-in email and the screen that asked for it. */
export interface SignInCommunicationLanguageSources {
  /** The account's stored personal preference (`preferredLocale`); none for a new account. */
  recipientPreference?: string | null;
  /** The interface language of the sign-in page that asked for the email (ADR-017). */
  page: InterfaceLanguageSources;
}

/**
 * The language of an email sent outside a workspace, today the sign-in email (ADR-019, which
 * amends ADR-017's order): the recipient's stored preference → the interface language of the
 * screen where the email was requested. The first sign-in stores that language on the new
 * account. There is no workspace default here.
 */
export function resolveSignInCommunicationLanguage(
  sources: SignInCommunicationLanguageSources,
): Locale {
  return matchLocale(sources.recipientPreference) ?? resolveInterfaceLanguage(sources.page);
}
