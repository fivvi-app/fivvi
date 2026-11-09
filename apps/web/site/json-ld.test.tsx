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

  it('adds the KvK number, VAT number, address and phone number that are filled in', () => {
    const { Organization } = nodes('home', 'en', {
      tradeName: 'Example BV',
      kvk: '12345678',
      vat: 'NL000000000B01',
      address: 'Voorbeeldstraat 1, 1234 AB Voorbeeldstad',
      phone: '+31 6 00000000',
    });

    expect(Organization).toMatchObject({
      vatID: 'NL000000000B01',
      identifier: { '@type': 'PropertyValue', propertyID: 'KvK', value: '12345678' },
      address: 'Voorbeeldstraat 1, 1234 AB Voorbeeldstad',
      telephone: '+31 6 00000000',
    });
  });

  it('leaves out a detail that is blank or still an open {{…}} value, and the legal name too', () => {
    const { Organization } = nodes('home', 'nl-NL', {
      tradeName: '{{trade name}}',
      kvk: '  ',
      vat: '{{VAT}}',
      address: undefined,
      phone: '',
    });

    expect(Object.keys(Organization ?? {}).sort()).toEqual(
      ['@id', '@type', 'email', 'name', 'url'].sort(),
    );
    expect(JSON.stringify(Organization)).not.toContain('{{');
  });

  it('never emits a legal name: the trade name is not the registered name (#612)', () => {
    const { Organization } = nodes('home', 'en', {
      tradeName: 'Example BV',
      kvk: '12345678',
    });

    expect(Organization).not.toHaveProperty('legalName');
    expect(JSON.stringify(pageJsonLd('home', 'en'))).not.toContain('legalName');
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

  it('cannot end the script early: < is escaped, so a detail with </script> stays data', () => {
    const markup = renderToStaticMarkup(
      <JsonLd
        page="home"
        locale="nl-NL"
        details={{
          tradeName: 'Example',
          address: 'A </script><script>alert(1)</script> B',
        }}
      />,
    );

    expect(markup.match(/<script/g)).toHaveLength(1);
    expect(markup.match(/<\/script>/g)).toHaveLength(1);
    const json = /^<script[^>]*>(.*)<\/script>$/s.exec(markup)?.[1] ?? '';
    expect(JSON.parse(json)['@graph'][0].address).toBe('A </script><script>alert(1)</script> B');
  });
});
