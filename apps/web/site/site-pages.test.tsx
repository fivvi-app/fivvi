import { formattingLocales, type Locale, locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../test/render';
import { HomePage } from './home-page';
import { alternatePath, type SitePage } from './routes';
import { SiteDocument } from './site-document';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

// The client pieces (the current page, the language switch) read the path through the router,
// which exists only in a running app.
let currentPath: string | null = '/';
vi.mock('next/navigation', () => ({ usePathname: () => currentPath }));

const ALL_PAGES: SitePage[] = [
  'home',
  'gyms',
  'studios',
  'personalTrainers',
  'clients',
  'pricing',
  'demo',
  'support',
  'privacy',
  'terms',
  'subProcessors',
];

const homePath = (locale: Locale) => (locale === 'en' ? '/en' : '/');
const html = (node: React.ReactNode) => renderToStaticMarkup(node);

/** The links of a rendered page: where each goes, what it says and its other attributes. */
function links(markup: string) {
  return [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map(([, attributes = '', text = '']) => ({
    href: /href="([^"]*)"/.exec(attributes)?.[1],
    text: text.replaceAll(/<[^>]*>/g, ''),
    current: /aria-current="([^"]*)"/.exec(attributes)?.[1],
    lang: /lang="([^"]*)"/.exec(attributes)?.[1],
  }));
}
const linkTo = (markup: string, href: string) => links(markup).find((link) => link.href === href);

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F064 AC1 the home page in %s', (locale) => {
  const copy = messages[locale].site;

  it('has its whole text in the HTML: one h1 with the headline, the lead and the status line', () => {
    const page = html(<HomePage locale={locale} />);

    expect(page.match(/<h1[ >]/g)).toHaveLength(1);
    expect(page).toContain(escapeHtml(copy.home.headline));
    expect(page).toContain(escapeHtml(copy.home.headlineRest));
    expect(page).toContain(escapeHtml(copy.home.lead));
    expect(page).toContain(escapeHtml(copy.home.status));
    expect(page).not.toContain('<script');
  });

  it('shows no placeholder and no hello page', () => {
    const page = html(<HomePage locale={locale} />);

    expect(page).not.toContain('{{');
    expect(page).not.toContain('first-name');
    expect(page).not.toContain('<form');
  });
});

describe.each(locales)('F064 the site’s document in %s', (locale) => {
  const copy = messages[locale].site;

  it('is the page’s language in lang, with the client theme and touch density, and a skip link', () => {
    currentPath = homePath(locale);
    const document = html(
      <SiteDocument locale={locale}>
        <hr />
      </SiteDocument>,
    );

    expect(document).toContain(`<html lang="${formattingLocales[locale]}"`);
    expect(document).toMatch(/<body[^>]*data-theme="client"/);
    expect(document).toMatch(/<body[^>]*data-density="touch"/);
    expect(document).toContain(`href="#main"`);
    expect(document).toContain(escapeHtml(copy.header.skipToContent));
    expect(document).toMatch(/<main[^>]*id="main"[^>]*><hr\/><\/main>/);
    expect(document).toContain('<header');
    expect(document).toContain('<footer');
  });

  it('reads no cookie or header: it is the same for every visitor', () => {
    // A static page renders without a request; a cookie or header read would throw here.
    expect(() => html(<SiteDocument locale={locale}>{null}</SiteDocument>)).not.toThrow();
  });
});

describe.each(locales)('F064 the header in %s', (locale) => {
  const copy = messages[locale].site;
  const other: Locale = locale === 'en' ? 'nl-NL' : 'en';

  it('AC18: Sign in goes to /login', () => {
    currentPath = homePath(locale);
    const header = html(<SiteHeader locale={locale} />);

    expect(linkTo(header, '/login')?.text).toBe(escapeHtml(copy.header.signIn));
  });

  it('AC16: the language switch is two links to the same page in each language, without a cookie', () => {
    const option = (markup: string, lang: string) =>
      links(markup).find((link) => link.lang === lang);

    currentPath = '/sportscholen';
    const gyms = html(<SiteHeader locale="nl-NL" built={ALL_PAGES} />);
    expect(option(gyms, 'en')).toMatchObject({ href: '/en/gyms', text: 'EN', current: undefined });
    expect(option(gyms, 'nl')).toMatchObject({
      href: '/sportscholen',
      text: 'NL',
      current: 'true',
    });

    currentPath = homePath(locale);
    const home = html(<SiteHeader locale={locale} />);
    expect(option(home, locale === 'en' ? 'nl' : 'en')?.href).toBe(
      alternatePath(currentPath, other),
    );
    expect(option(home, locale === 'en' ? 'en' : 'nl')).toMatchObject({
      href: homePath(locale),
      current: 'true',
    });
    expect(home).toContain(escapeHtml(copy.language.label));
    // Each option is named in its own language, and it is a link: nothing to click with script.
    expect(links(home).flatMap(({ lang }) => (lang ? [lang] : []))).toEqual(['nl', 'en']);
    expect(home).not.toContain('<button');
  });

  it('links the pages that exist, marks the current one, and leaves out the ones that do not', () => {
    const en = locale === 'en';
    currentPath = en ? '/en/pricing' : '/prijzen';
    const pricing = currentPath;
    const gyms = en ? '/en/gyms' : '/sportscholen';
    const demo = en ? '/en/demo' : '/demo';

    const none = html(<SiteHeader locale={locale} built={[]} />);
    expect(none).not.toContain(escapeHtml(copy.nav.pricing));
    expect(none).not.toContain(escapeHtml(copy.header.demo));
    expect(linkTo(none, gyms)).toBeUndefined();

    const header = html(<SiteHeader locale={locale} built={ALL_PAGES} />);
    expect(linkTo(header, gyms)).toMatchObject({
      text: escapeHtml(copy.nav.gyms),
      current: undefined,
    });
    expect(linkTo(header, pricing)).toMatchObject({ text: escapeHtml(copy.nav.pricing) });
    expect(links(header).filter(({ current }) => current === 'page')).toEqual([
      expect.objectContaining({ href: pricing }),
    ]);
    expect(linkTo(header, demo)?.text).toBe(escapeHtml(copy.header.demo));
  });

  it('links the four audience pages by default, in the order of the header (#639)', () => {
    const en = locale === 'en';
    currentPath = homePath(locale);
    const header = html(<SiteHeader locale={locale} />);
    const audiences = en
      ? ['/en/gyms', '/en/studios', '/en/personal-trainers', '/en/clients']
      : ['/sportscholen', '/studios', '/personal-trainers', '/klanten'];

    expect(
      links(header).flatMap(({ href }) => (href && audiences.includes(href) ? [href] : [])),
    ).toEqual(audiences);
    expect(linkTo(header, audiences[0] ?? '')?.text).toBe(escapeHtml(copy.nav.gyms));
    expect(linkTo(header, audiences[3] ?? '')?.text).toBe(escapeHtml(copy.nav.clients));
  });

  it('the logo goes to the home page of the language', () => {
    const header = html(<SiteHeader locale={locale} />);
    const logo = [...header.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].find(([, attributes = '']) =>
      attributes.includes(`href="${homePath(locale)}"`),
    );

    expect(logo?.[2]).toContain(`alt="${escapeHtml(messages[locale].site.logo.homeLabel)}"`);
  });
});

describe.each(locales)('F064 AC7 the footer in %s', (locale) => {
  const copy = messages[locale].site;

  it('shows the trade name and nothing else while no other detail is filled in', () => {
    const footer = html(
      <SiteFooter locale={locale} business={{ tradeName: 'Voorbeeld BV' }} built={[]} />,
    );

    expect(footer).toContain(escapeHtml(copy.footer.tradeName.replace('{name}', 'Voorbeeld BV')));
    for (const label of [
      copy.footer.kvk,
      copy.footer.vat,
      copy.footer.address,
      copy.footer.phone,
    ]) {
      expect(footer).not.toContain(escapeHtml(label));
    }
    expect(footer).not.toContain('<dl');
    expect(footer).not.toContain('{{');
    // No page exists but the home page, so there are no links and no headings over none.
    expect(links(footer).map(({ href }) => href)).toEqual([homePath(locale)]);
    expect(footer).not.toContain(escapeHtml(copy.footer.legalHeading));
  });

  it('shows no trade name line when the trade name is blank or still a placeholder', () => {
    for (const tradeName of ['', '  ', '{{naam}}']) {
      const footer = html(<SiteFooter locale={locale} business={{ tradeName }} />);

      expect(footer).not.toContain(escapeHtml(copy.footer.tradeName.replace('{name}', '')).trim());
      expect(footer).not.toContain('{{');
      expect(footer).not.toMatch(/<p[ >]/);
    }
  });

  it('shows every detail that is filled in, with its label', () => {
    const footer = html(
      <SiteFooter
        locale={locale}
        business={{
          tradeName: 'Voorbeeld BV',
          kvk: '12345678',
          vat: 'NL000000000B01',
          address: 'Voorbeeldstraat 1, 1234 AB Plaats',
        }}
      />,
    );

    expect(footer).toContain(copy.footer.kvk);
    expect(footer).toContain('12345678');
    expect(footer).toContain(escapeHtml(copy.footer.vat));
    expect(footer).toContain('NL000000000B01');
    expect(footer).toContain(escapeHtml(copy.footer.address));
    expect(footer).toContain('Voorbeeldstraat 1, 1234 AB Plaats');
    expect(footer).not.toContain(escapeHtml(copy.footer.phone));
  });

  it('links help, pricing and every legal page once they exist', () => {
    const footer = html(<SiteFooter locale={locale} built={ALL_PAGES} />);
    const en = locale === 'en';

    for (const [href, label] of [
      [en ? '/en/pricing' : '/prijzen', copy.nav.pricing],
      [en ? '/en/support' : '/support', copy.footer.support],
      [en ? '/en/privacy' : '/privacy', copy.footer.privacy],
      [en ? '/en/terms' : '/voorwaarden', copy.footer.terms],
      [en ? '/en/sub-processors' : '/subverwerkers', copy.footer.subProcessors],
    ] as const) {
      expect(linkTo(footer, href)?.text, label).toBe(escapeHtml(label));
    }
    expect(footer).toContain(escapeHtml(copy.footer.legalHeading));
  });
});
