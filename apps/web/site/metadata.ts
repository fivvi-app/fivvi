import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { siteIndexable } from './routes';
import { pageCopy, pageSeo } from './seo';

/**
 * The metadata of the site's root layouts: `noindex, nofollow` while `siteIndexable` is `false`
 * (`site/routes.ts`), nothing once it is `true`. **Until the go-live ticket (#648):** merging to
 * `main` deploys to production, and the site must not be found before every claim on it is
 * checked. The environments that are not production send `noindex` as a header at run time
 * (`site/indexing.ts`), because this markup is built once for all of them.
 */
export function rootMetadata(indexable: boolean): Metadata {
  return indexable ? {} : { robots: { index: false, follow: false } };
}

export const siteRootMetadata: Metadata = rootMetadata(siteIndexable);

/** The title and description of the home page in a language (unique per page, AC12). */
export function homeMetadata(locale: Locale): Metadata {
  return pageSeo('home', locale, pageCopy('home', locale));
}
