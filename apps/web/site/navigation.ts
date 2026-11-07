import type { Locale, MessageKey } from '@fivvi/i18n';
import { builtPages, type SitePage, sitePagePath } from './routes';

/** The catalog key of the label of every page that is linked from the header or the footer. */
const labelKeys = {
  gyms: 'site.nav.gyms',
  studios: 'site.nav.studios',
  personalTrainers: 'site.nav.personalTrainers',
  clients: 'site.nav.clients',
  pricing: 'site.nav.pricing',
  demo: 'site.header.demo',
  support: 'site.footer.support',
  privacy: 'site.footer.privacy',
  terms: 'site.footer.terms',
  subProcessors: 'site.footer.subProcessors',
} as const satisfies Partial<Record<SitePage, MessageKey>>;

type LinkedPage = keyof typeof labelKeys;

/** The audiences and pricing: the header's links, and the footer's product column. */
const productPages: readonly LinkedPage[] = [
  'gyms',
  'studios',
  'personalTrainers',
  'clients',
  'pricing',
];

/** The header: the product pages. *Plan een demo* is the button next to them. */
export const headerPages = productPages;

/** The footer's columns (AC7): the product, help (the demo and the help page) and the legal pages. */
export const footerColumns: readonly {
  heading: 'site.footer.productHeading' | 'site.footer.helpHeading' | 'site.footer.legalHeading';
  pages: readonly LinkedPage[];
}[] = [
  { heading: 'site.footer.productHeading', pages: productPages },
  { heading: 'site.footer.helpHeading', pages: ['demo', 'support'] },
  { heading: 'site.footer.legalHeading', pages: ['privacy', 'terms', 'subProcessors'] },
];

export interface SiteLink {
  page: LinkedPage;
  href: string;
  /** The catalog key of the label. */
  labelKey: (typeof labelKeys)[LinkedPage];
}

/**
 * The links to the pages of a list that exist, in `locale`. A page that does not exist yet is left
 * out, so no link is a 404.
 */
export function linksTo(
  pages: readonly LinkedPage[],
  locale: Locale,
  built: readonly SitePage[] = builtPages,
): SiteLink[] {
  return pages
    .filter((page) => built.includes(page))
    .map((page) => ({ page, href: sitePagePath(page, locale), labelKey: labelKeys[page] }));
}
