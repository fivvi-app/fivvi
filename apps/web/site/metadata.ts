import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { siteText } from './text';

/**
 * The metadata of the site's root layouts. **`noindex` until the go-live ticket (#648):** merging
 * to `main` deploys to production, and the site must not be found before every claim on it is
 * checked. That ticket turns indexing on here, for every page at once.
 */
export const siteRootMetadata: Metadata = {
  robots: { index: false, follow: false },
};

/** The title and description of the home page in a language (unique per page, AC12). */
export function homeMetadata(locale: Locale): Metadata {
  const t = siteText(locale);
  return { title: t('site.meta.homeTitle'), description: t('site.meta.homeDescription') };
}
