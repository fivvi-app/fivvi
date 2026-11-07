import { type Locale, locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../test/render';
import type { BusinessDetails } from '../business';
import { privacyEmail, supportEmail } from './contact';
import { SupportPage, supportMetadata } from './support-page';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);
const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map(([, href]) => href);

const noDetails: BusinessDetails = { tradeName: 'Voorbeeld BV' };
const allDetails: BusinessDetails = {
  tradeName: 'Voorbeeld BV',
  kvk: '12345678',
  vat: 'NL000000000B01',
  address: 'Voorbeeldstraat 1, 1234 AB Plaats',
  phone: '+31 6 00000000',
};

describe('F064 the role addresses', () => {
  it('are support@ and privacy@ on fivvi.app', () => {
    expect(supportEmail).toBe('support@fivvi.app');
    expect(privacyEmail).toBe('privacy@fivvi.app');
  });
});

describe.each(locales)('F064 AC8 the help page in %s', (locale) => {
  const copy = messages[locale].site;
  const t = copy.support;

  it('has one h1, the lead and the status line (AC19), all in the HTML', () => {
    const page = html(<SupportPage locale={locale} business={noDetails} />);

    expect(page.match(/<h1[ >]/g)).toHaveLength(1);
    expect(page).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(t.headline)}</h1>`));
    expect(page).toContain(escapeHtml(t.lead));
    expect(page).toContain(escapeHtml(copy.home.status));
    expect(page).not.toContain('<script');
  });

  it('shows the support and privacy addresses as mail links, and the trade name', () => {
    const page = html(<SupportPage locale={locale} business={noDetails} />);

    expect(hrefs(page)).toContain(`mailto:${supportEmail}`);
    expect(hrefs(page)).toContain(`mailto:${privacyEmail}`);
    expect(page).toContain(escapeHtml(t.contactHeading));
    expect(page).toContain(escapeHtml(t.email));
    expect(page).toContain(escapeHtml(copy.footer.tradeName.replace('{name}', 'Voorbeeld BV')));
  });

  it('shows every business detail that is filled in, with its label, phone included', () => {
    const page = html(<SupportPage locale={locale} business={allDetails} />);

    for (const [label, value] of [
      [copy.footer.kvk, '12345678'],
      [copy.footer.vat, 'NL000000000B01'],
      [copy.footer.address, 'Voorbeeldstraat 1, 1234 AB Plaats'],
      [copy.footer.phone, '+31 6 00000000'],
    ] as const) {
      expect(page).toContain(escapeHtml(label));
      expect(page).toContain(value);
    }
  });

  it('shows nothing for a detail that is missing: no label, no empty value, no placeholder', () => {
    for (const business of [
      noDetails,
      {
        tradeName: 'Voorbeeld BV',
        kvk: '{{KvK-nummer}}',
        vat: '',
        address: '  ',
        phone: undefined,
      },
    ]) {
      const page = html(<SupportPage locale={locale} business={business} />);

      for (const label of [
        copy.footer.kvk,
        copy.footer.vat,
        copy.footer.address,
        copy.footer.phone,
      ]) {
        expect(page).not.toContain(escapeHtml(label));
      }
      expect(page).not.toContain('{{');
      // The addresses are not business details the owner still has to give: they stay.
      expect(hrefs(page)).toContain(`mailto:${supportEmail}`);
    }
  });

  it('shows the frequently asked questions for clients and for owners and trainers', () => {
    const page = html(<SupportPage locale={locale} business={noDetails} />);

    expect(page).toContain(escapeHtml(t.clientsHeading));
    expect(page).toContain(escapeHtml(t.ownersHeading));
    for (const { question } of [...Object.values(t.clientFaq), ...Object.values(t.ownerFaq)]) {
      expect(page).toContain(escapeHtml(question));
    }
    expect(Object.keys(t.clientFaq).length).toBeGreaterThan(0);
    expect(Object.keys(t.ownerFaq).length).toBeGreaterThan(0);
    expect(page).not.toContain('{address}');
  });

  it('AC9: says how to ask for deleting an account by email, and links to no page that does not exist', () => {
    const page = html(<SupportPage locale={locale} business={noDetails} />);
    const answer = t.clientFaq.deleteAccount.answer.replace('{address}', privacyEmail);

    expect(page).toContain(escapeHtml(t.clientFaq.deleteAccount.question));
    expect(page).toContain(escapeHtml(answer));
    // #477 builds the page for deleting an account: until then nothing links to it.
    expect(page).not.toMatch(/account-verwijderen|delete-account/);
    for (const href of hrefs(page)) {
      expect(href).toMatch(/^(mailto:|#|\/(en)?\/?$)/);
    }
  });

  it('links the pricing and demo pages only once they exist', () => {
    const [pricing, demo] = locale === 'en' ? ['/en/pricing', '/en/demo'] : ['/prijzen', '/demo'];

    expect(
      hrefs(html(<SupportPage locale={locale} business={noDetails} built={[]} />)),
    ).not.toEqual(expect.arrayContaining([pricing]));
    const page = html(
      <SupportPage locale={locale} business={noDetails} built={['support', 'pricing', 'demo']} />,
    );
    expect(hrefs(page)).toEqual(expect.arrayContaining([pricing, demo]));
    expect(page).toContain(escapeHtml(t.cta.heading));
  });

  it('makes no promise of a reply time until the owner confirms one (DECISIONS.md §9, assumption 2)', () => {
    expect(t.lead).not.toMatch(/\b(1|one|één|een) (working day|werkdag)\b/i);
  });
});

describe('F064 the help page’s metadata', () => {
  it.each(locales)(
    'has the catalog’s title and description in %s, not the other language’s',
    (locale) => {
      const other: Locale = locale === 'en' ? 'nl-NL' : 'en';
      const { title, description } = supportMetadata(locale);

      expect(title).toBe(messages[locale].site.support.metaTitle);
      expect(description).toBe(messages[locale].site.support.metaDescription);
      expect(title).not.toBe(messages[other].site.support.metaTitle);
    },
  );
});
