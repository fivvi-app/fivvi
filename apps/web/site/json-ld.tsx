import type { Locale } from '@fivvi/i18n';
import { type BusinessDetails, business as fivviBusiness, shown } from './business';
import { supportEmail } from './info/contact';
import { pageLabelKey } from './navigation';
import type { SitePage } from './routes';
import { imageLanguage, pageUrl, siteOrigin } from './seo';
import { siteText } from './text';

/** A JSON-LD value: plain data, written as typed objects (no `schema-dts`; nothing to depend on). */
type JsonLdValue = string | number | JsonLdNode | readonly JsonLdValue[];
interface JsonLdNode {
  readonly [key: string]: JsonLdValue;
}

/** The structured data of a page: one `@graph` of schema.org nodes. */
export interface JsonLdDocument {
  '@context': 'https://schema.org';
  '@graph': (JsonLdNode & { '@type': string })[];
}

const organizationId = `${siteOrigin}/#organization`;

/**
 * The Organization behind Fivvi: its name, address on the web and support mailbox, and the
 * `legalName` when `site/business.ts` has one. No postal address, telephone, KvK or VAT number: the
 * site shows none of them (owner, 11 November 2026, #1344). The `legalName` is the registered name
 * of `site/business.ts`, which the owner confirmed (#612, #648); without one it is left out, never
 * guessed from the trade name.
 */
function organization(details: BusinessDetails): JsonLdNode & { '@type': string } {
  const legalName = shown(details.legalName);
  return {
    '@type': 'Organization',
    '@id': organizationId,
    name: 'Fivvi',
    url: `${siteOrigin}/`,
    ...(legalName ? { legalName } : {}),
    email: supportEmail,
  };
}

/**
 * The app, on the web: the iPhone and Android apps are not in the stores yet, so they are not named
 * here; they are added when the store listings are live. Its one price statement is the pricing page's own
 * words: free during the pilot (`offers`, `price` 0). There is no rating, review or other price, because none exists yet (`DECISIONS.md` §9,
 * *Nothing made up*).
 */
function softwareApplication(locale: Locale): JsonLdNode & { '@type': string } {
  const t = siteText(locale);
  return {
    '@type': 'SoftwareApplication',
    name: 'Fivvi',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: t('site.meta.homeDescription'),
    url: pageUrl('home', locale),
    inLanguage: imageLanguage(locale),
    publisher: { '@id': organizationId },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      description: t('site.pricing.metaDescription'),
    },
  };
}

/** The home page, then the page itself. */
function breadcrumbs(page: Exclude<SitePage, 'home'>, locale: Locale) {
  const t = siteText(locale);
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t('site.meta.breadcrumbHome'),
        item: pageUrl('home', locale),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t(pageLabelKey(page)),
        item: pageUrl(page, locale),
      },
    ],
  };
}

/**
 * The structured data of a site page (F064 AC14): Organization and SoftwareApplication on the home
 * page, a BreadcrumbList on every other page.
 */
export function pageJsonLd(
  page: SitePage,
  locale: Locale,
  details: BusinessDetails = fivviBusiness,
): JsonLdDocument {
  return {
    '@context': 'https://schema.org',
    '@graph':
      page === 'home'
        ? [organization(details), softwareApplication(locale)]
        : [breadcrumbs(page, locale)],
  };
}

/**
 * The page's structured data as a `<script type="application/ld+json">`. `<` is written as
 * `<`, so a value can never end the script early; the JSON means the same.
 */
export function JsonLd({
  page,
  locale,
  details,
}: {
  page: SitePage;
  locale: Locale;
  details?: BusinessDetails;
}) {
  const json = JSON.stringify(pageJsonLd(page, locale, details)).replaceAll('<', '\\u003c');
  // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON built here from our own data, with `<` escaped; React would turn the quotes of text children into entities.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
