import { matchLocale } from './locale.ts';

/**
 * The text of user content (a class name or description) to show a viewer (`PRODUCT.md §3`): the
 * English text when the viewer's interface language is English and an English text exists, else
 * the Dutch one. Names and descriptions are written by the team and never machine-translated, so
 * this only chooses between the texts that exist. Shared by the web, the apps' views and, later,
 * the booking pages.
 *
 * `viewerLocale` is the viewer's interface language (`resolveInterfaceLanguage`) or any language
 * tag; one the catalog has no language for counts as Dutch. A blank English text is no text. The
 * Dutch text is returned as given, `null` when the content has none (an optional description).
 */
export function pickContentLanguage(
  viewerLocale: string | null | undefined,
  nl: string,
  en: string | null | undefined,
): string;
export function pickContentLanguage(
  viewerLocale: string | null | undefined,
  nl: string | null,
  en: string | null | undefined,
): string | null;
export function pickContentLanguage(
  viewerLocale: string | null | undefined,
  nl: string | null,
  en: string | null | undefined,
): string | null {
  if (matchLocale(viewerLocale) === 'en' && en !== null && en !== undefined && en.trim() !== '') {
    return en;
  }
  return nl;
}
