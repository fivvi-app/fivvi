import { locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BusinessDetails } from './business';
import { JsonLd, pageJsonLd } from './json-ld';
import { builtPages, type SitePage, unlistedPages } from './routes';
import { pageUrl } from './seo';

const everyPage: readonly SitePage[] = [...builtPages, ...unlistedPages];

/** The nodes of a page's `@graph`, by type. */
function nodes(page: SitePage, locale: 'nl-NL' | 'en', details?: BusinessDetails) {
  const data = pageJsonLd(page, locale, details);
  return Object.fromEntries(data['@graph'].map((node) => [node['@type'], node]));
}

describe.each(locales)('F064 AC14 JSON-LD in %s', (locale) => {
  const copy = messages[locale].site;

  it('is Organization and SoftwareApplication on the home page, and nothing else', () => {
    const data = pageJsonLd('home', locale);

    expect(data['@context']).toBe('https://schema.org');
    expect(data['@graph'].map((node) => node['@type']).sort()).toEqual([
      'Organization',
      'SoftwareApplication',
    ]);
  });

  it('is a BreadcrumbList, and nothing else, on every other page', () => {
    for (const page of everyPage.filter((candidate) => candidate !== 'home')) {
      expect(pageJsonLd(page, locale)['@graph'].map((node) => node['@type'])).toEqual([
        'BreadcrumbList',
      ]);
    }
  });

  it('puts the home page first and the page itself second in the breadcrumbs, by their addresses', () => {
    const { BreadcrumbList } = nodes('pricing', locale);

    expect(BreadcrumbList).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: copy.meta.breadcrumbHome,
          item: pageUrl('home', locale),
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: copy.nav.pricing,
          item: pageUrl('pricing', locale),
        },
      ],
    });
  });

  it('names every page in its breadcrumbs from the catalog', () => {
    for (const page of everyPage.filter((candidate) => candidate !== 'home')) {
      const { BreadcrumbList } = nodes(page, locale);
      const items = (BreadcrumbList?.itemListElement ?? []) as { name: string }[];
      const name = items[1]?.name;

      expect(name).toBeTruthy();
      expect(name).not.toContain('{');
    }
  });

  it('describes the app as a business application and is free only as the pricing page says', () => {
    const { SoftwareApplication } = nodes('home', locale);

    expect(SoftwareApplication).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Fivvi',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: copy.meta.homeDescription,
      url: pageUrl('home', locale),
      inLanguage: locale === 'en' ? 'en' : 'nl',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'EUR',
        description: copy.pricing.metaDescription,
      },
    });
  });

  it('the 0 EUR offer is the price the pricing page shows, and the OS stays Web until the store listings are live (#648)', () => {
    const { SoftwareApplication } = nodes('home', locale);

    expect(copy.pricing.price.replace(/[^0-9.,]/g, '')).toBe('0');
    expect(copy.pricing.price).toContain('€');
    expect(SoftwareApplication?.offers).toMatchObject({ price: '0', priceCurrency: 'EUR' });
    expect(SoftwareApplication?.operatingSystem).toBe('Web');
  });

  it('never claims a rating, a review or a price beyond the free pilot', () => {
    for (const page of everyPage) {
      const json = JSON.stringify(pageJsonLd(page, locale));

      expect(json).not.toMatch(
        /"(aggregateRating|review|reviewRating|ratingValue|ratingCount|reviewCount|bestRating|worstRating)"/,
      );
    }
    const offers = JSON.stringify(nodes('home', locale).SoftwareApplication?.offers);
    expect(offers).not.toMatch(/priceSpecification|billing|unitText|validThrough/);
  });

  it('uses addresses on https://fivvi.app only', () => {
    for (const page of everyPage) {
      const urls = JSON.stringify(pageJsonLd(page, locale)).match(/https?:\/\/[^"]+/g) ?? [];
      for (const url of urls) {
        expect(url === 'https://schema.org' || url.startsWith('https://fivvi.app')).toBe(true);
      }
    }
  });
});

describe('F064 AC7, AC14 the Organization of the site as it is published (#648, #1344)', () => {
  it.each(['nl-NL', 'en'] as const)(
    'has the name, the registered name K&S Apps, the address of the site and the support mailbox in %s, and no address, telephone, KvK or VAT number',
    (locale) => {
      const { Organization } = nodes('home', locale);

      expect(Organization).toEqual({
        '@type': 'Organization',
        '@id': 'https://fivvi.app/#organization',
        name: 'Fivvi',
        url: 'https://fivvi.app/',
        legalName: 'K&S Apps',
        email: 'support@fivvi.app',
      });
      for (const property of ['address', 'telephone', 'identifier', 'vatID']) {
        expect(Organization).not.toHaveProperty(property);
      }
    },
  );
});

describe('F064 AC14 the Organization shows only what is filled in', () => {
  it('with only the trade name: the name, the address of the site and the support mailbox, and no legal name', () => {
    const { Organization } = nodes('home', 'nl-NL', { tradeName: 'K&S Apps' });

    expect(Organization).toEqual({
      '@type': 'Organization',
      '@id': 'https://fivvi.app/#organization',
      name: 'Fivvi',
      url: 'https://fivvi.app/',
      email: 'support@fivvi.app',
    });
  });

  it('leaves out a legal name that is blank or still an open {{…}} value', () => {
    for (const legalName of ['  ', '{{naam}}', undefined]) {
      const { Organization } = nodes('home', 'nl-NL', { tradeName: 'Example BV', legalName });

      expect(Object.keys(Organization ?? {}).sort()).toEqual(
        ['@id', '@type', 'email', 'name', 'url'].sort(),
      );
      expect(JSON.stringify(Organization)).not.toContain('{{');
    }
  });

  it('adds the legal name only from the business details, and only when filled in (#612)', () => {
    const { Organization } = nodes('home', 'en', {
      tradeName: 'Example BV',
      legalName: 'Example Holding BV',
    });

    expect(Organization).toMatchObject({ legalName: 'Example Holding BV' });
    expect(nodes('home', 'en', { tradeName: 'Example BV' }).Organization).not.toHaveProperty(
      'legalName',
    );
    expect(
      nodes('home', 'en', { tradeName: 'Example BV', legalName: '{{naam}}' }).Organization,
    ).not.toHaveProperty('legalName');
  });

  it('the SoftwareApplication is published by that organization', () => {
    const { SoftwareApplication } = nodes('home', 'nl-NL');

    expect(SoftwareApplication?.publisher).toEqual({ '@id': 'https://fivvi.app/#organization' });
  });
});

describe('F064 AC14 the script element', () => {
  it('is application/ld+json with the page’s data, which parses back', () => {
    const markup = renderToStaticMarkup(<JsonLd page="pricing" locale="en" />);

    const match = /^<script type="application\/ld\+json">(.*)<\/script>$/s.exec(markup);
    expect(match).not.toBeNull();
    expect(JSON.parse(match?.[1] ?? '')).toEqual(pageJsonLd('pricing', 'en'));
  });

  it('cannot end the script early: < is escaped, so a legal name with </script> stays data', () => {
    const markup = renderToStaticMarkup(
      <JsonLd
        page="home"
        locale="nl-NL"
        details={{
          tradeName: 'Example',
          legalName: 'A </script><script>alert(1)</script> B',
        }}
      />,
    );

    expect(markup.match(/<script/g)).toHaveLength(1);
    expect(markup.match(/<\/script>/g)).toHaveLength(1);
    const json = /^<script[^>]*>(.*)<\/script>$/s.exec(markup)?.[1] ?? '';
    expect(JSON.parse(json)['@graph'][0].legalName).toBe('A </script><script>alert(1)</script> B');
  });
});
