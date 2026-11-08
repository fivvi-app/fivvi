import { formattingLocales, type Locale, type MessageKey } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { builtPages, type SitePage, sitePagePath, unlistedPages } from './routes';
import { siteText } from './text';

/** Where the site lives (ADR-030). Canonical URLs and alternates are absolute, on this origin. */
export const siteOrigin = 'https://fivvi.app';

/** The brand as a social card names it. */
export const siteName = 'Fivvi';

/** Open Graph's recommended size, which the generated images have. */
export const ogImageSize = { width: 1200, height: 630 } as const;

/** The absolute address of a page in a language. */
export function pageUrl(page: SitePage, locale: Locale): string {
  return `${siteOrigin}${sitePagePath(page, locale)}`;
}

/** The pages that have their own Open Graph image: every page that has a page file. */
export const siteImagePages: readonly SitePage[] = [...builtPages, ...unlistedPages];

/** The language as the image's address spells it. */
export const imageLanguages = ['nl', 'en'] as const;
export type ImageLanguage = (typeof imageLanguages)[number];

export function imageLanguage(locale: Locale): ImageLanguage {
  return locale === 'en' ? 'en' : 'nl';
}

/** The path of a page's Open Graph image (`app/site-og`): generated at build time. */
export function ogImagePath(page: SitePage, locale: Locale): string {
  return `/site-og/${imageLanguage(locale)}/${page}`;
}

/** The catalog keys of a page's title and description (AC12), for every page that has a page file. */
const copyKeys = {
  home: ['site.meta.homeTitle', 'site.meta.homeDescription'],
  gyms: ['site.audience.gyms.metaTitle', 'site.audience.gyms.metaDescription'],
  studios: ['site.audience.studios.metaTitle', 'site.audience.studios.metaDescription'],
  personalTrainers: [
    'site.audience.personalTrainers.metaTitle',
    'site.audience.personalTrainers.metaDescription',
  ],
  clients: ['site.audience.clients.metaTitle', 'site.audience.clients.metaDescription'],
  pricing: ['site.pricing.metaTitle', 'site.pricing.metaDescription'],
  support: ['site.support.metaTitle', 'site.support.metaDescription'],
  subProcessors: ['site.subProcessors.metaTitle', 'site.subProcessors.metaDescription'],
  demo: ['site.demo.metaTitle', 'site.demo.metaDescription'],
} as const satisfies Partial<Record<SitePage, readonly [MessageKey, MessageKey]>>;
const copyOf: Partial<Record<SitePage, readonly [MessageKey, MessageKey]>> = copyKeys;

/** The title and description of a page in a language, from the catalog. */
export function pageCopy(page: SitePage, locale: Locale): { title: string; description: string } {
  const keys = copyOf[page];
  if (!keys) throw new Error(`The page ${page} has no title and description in the catalog`);
  const t = siteText(locale);
  return { title: t(keys[0]), description: t(keys[1]) };
}

/**
 * The search and sharing metadata of a page (AC12): title and description, the canonical URL,
 * `hreflang` for Dutch, English and `x-default` (Dutch), and the Open Graph card with an image of
 * its own. A page that is not in `builtPages` yet (the demo page) also says `noindex`, whatever
 * `siteIndexable` says: nothing links to it, and the sitemap leaves it out.
 */
export function pageSeo(
  page: SitePage,
  locale: Locale,
  { title, description }: { title: string; description: string },
): Metadata {
  const url = pageUrl(page, locale);
  const images = [
    {
      url: `${siteOrigin}${ogImagePath(page, locale)}`,
      ...ogImageSize,
      alt: title,
    },
  ];
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        nl: pageUrl(page, 'nl-NL'),
        en: pageUrl(page, 'en'),
        'x-default': pageUrl(page, 'nl-NL'),
      },
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      siteName,
      locale: formattingLocales[locale].replace('-', '_'),
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images },
    ...(builtPages.includes(page) ? {} : { robots: { index: false, follow: false } }),
  };
}
