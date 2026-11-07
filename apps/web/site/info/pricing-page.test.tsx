import { type Locale, locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../test/render';
import type { SitePage } from '../routes';
import { PricingPage, pricingMetadata } from './pricing-page';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);
const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map(([, href]) => href);

describe.each(locales)('F064 AC4 the pricing page in %s', (locale) => {
  const copy = messages[locale].site;

  it('says Fivvi is free during the pilot, in the one h1', () => {
    const page = html(<PricingPage locale={locale} />);

    expect(page.match(/<h1[ >]/g)).toHaveLength(1);
    expect(page).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy.pricing.headline)}</h1>`));
    expect(page).toContain(escapeHtml(copy.pricing.lead));
    expect(page).toContain(escapeHtml(copy.pricing.price));
    expect(page).toContain(escapeHtml(copy.pricing.period));
  });

  it('says Mollie charges per payment and that Fivvi does not', () => {
    const page = html(<PricingPage locale={locale} />);

    expect(page).toContain(escapeHtml(copy.pricing.payments.question));
    expect(page).toContain(escapeHtml(copy.pricing.payments.answer));
    expect(copy.pricing.payments.answer).toContain('Mollie');
  });

  it('says amounts are in euros', () => {
    const page = html(<PricingPage locale={locale} />);

    expect(page).toContain(escapeHtml(copy.pricing.currency));
    expect(copy.pricing.price).toContain('€');
  });

  it('gives the 60 days’ notice of the terms (A4)', () => {
    const page = html(<PricingPage locale={locale} />);

    expect(page).toContain(escapeHtml(copy.pricing.later.question));
    expect(page).toContain(escapeHtml(copy.pricing.later.answer));
    expect(copy.pricing.later.answer).toContain('60');
  });

  it('lists what is included, and what clients pay', () => {
    const page = html(<PricingPage locale={locale} />);

    for (const item of Object.values(copy.pricing.included)) {
      expect(page).toContain(escapeHtml(item));
    }
    expect(page).toContain(escapeHtml(copy.pricing.clients.answer));
  });

  it('carries the status line (AC19), has its whole text without script, and shows no placeholder', () => {
    const page = html(<PricingPage locale={locale} />);

    expect(page).toContain(escapeHtml(copy.home.status));
    expect(page).not.toContain('<script');
    expect(page).not.toContain('{{');
  });

  it('links the demo only once the demo page exists, and never links to itself', () => {
    const demo = locale === 'en' ? '/en/demo' : '/demo';
    const pricing = locale === 'en' ? '/en/pricing' : '/prijzen';
    const built: SitePage[] = ['pricing', 'demo'];

    const without = html(<PricingPage locale={locale} built={[]} />);
    expect(hrefs(without)).not.toContain(demo);
    expect(without).not.toContain(escapeHtml(copy.pricing.cta.heading));

    const page = html(<PricingPage locale={locale} built={built} />);
    expect(hrefs(page)).toContain(demo);
    expect(hrefs(page)).not.toContain(pricing);
    expect(page).toContain(escapeHtml(copy.pricing.cta.heading));
    expect(page).toContain(escapeHtml(copy.pricing.cta.demo));
  });
});

describe('F064 the pricing page’s metadata', () => {
  it.each(locales)(
    'has the catalog’s title and description in %s, not the other language’s',
    (locale) => {
      const other: Locale = locale === 'en' ? 'nl-NL' : 'en';
      const { title, description, robots } = pricingMetadata(locale);

      expect(title).toBe(messages[locale].site.pricing.metaTitle);
      expect(description).toBe(messages[locale].site.pricing.metaDescription);
      expect(title).not.toBe(messages[other].site.pricing.metaTitle);
      // The site is noindex until the go-live ticket (#648), set once on the root layout.
      expect(robots).toBeUndefined();
    },
  );
});
