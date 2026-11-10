import { formattingLocales, type Locale, locales, messages } from '@fivvi/i18n';
import { expect, test } from './fixtures';

// F064 AC12, AC13, AC14 (#644, #648): what a search engine and a share card see of the site. The e2e
// server is not the `production` environment, so it sends `noindex` on everything in the header and
// its robots.txt disallows all, exactly as a preview does. The production side (open pages, the
// robots.txt that allows the site and names the sitemap) is unit-tested (site/indexing.test.ts) and
// seen through the go-live proxy of the budget spec; the markup of the site is the same everywhere
// and carries no `robots` tag, because the header decides per environment.
const ORIGIN = 'https://fivvi.app';

type Site = (typeof messages)['en']['site'];
interface PageSpec {
  paths: Record<Locale, string>;
  /** The title and description in the catalog. */
  copy: (site: Site) => { title: string; description: string };
  /** The names in the breadcrumbs after the home page (none on the home page). */
  breadcrumb?: (site: Site) => string;
}

const PAGES: Record<string, PageSpec> = {
  home: {
    paths: { 'nl-NL': '/', en: '/en' },
    copy: (s) => ({ title: s.meta.homeTitle, description: s.meta.homeDescription }),
  },
  gyms: {
    paths: { 'nl-NL': '/sportscholen', en: '/en/gyms' },
    copy: (s) => ({
      title: s.audience.gyms.metaTitle,
      description: s.audience.gyms.metaDescription,
    }),
    breadcrumb: (s) => s.nav.gyms,
  },
  studios: {
    paths: { 'nl-NL': '/studios', en: '/en/studios' },
    copy: (s) => ({
      title: s.audience.studios.metaTitle,
      description: s.audience.studios.metaDescription,
    }),
    breadcrumb: (s) => s.nav.studios,
  },
  personalTrainers: {
    paths: { 'nl-NL': '/personal-trainers', en: '/en/personal-trainers' },
    copy: (s) => ({
      title: s.audience.personalTrainers.metaTitle,
      description: s.audience.personalTrainers.metaDescription,
    }),
    breadcrumb: (s) => s.nav.personalTrainers,
  },
  clients: {
    paths: { 'nl-NL': '/klanten', en: '/en/clients' },
    copy: (s) => ({
      title: s.audience.clients.metaTitle,
      description: s.audience.clients.metaDescription,
    }),
    breadcrumb: (s) => s.nav.clients,
  },
  pricing: {
    paths: { 'nl-NL': '/prijzen', en: '/en/pricing' },
    copy: (s) => ({ title: s.pricing.metaTitle, description: s.pricing.metaDescription }),
    breadcrumb: (s) => s.nav.pricing,
  },
  support: {
    paths: { 'nl-NL': '/support', en: '/en/support' },
    copy: (s) => ({ title: s.support.metaTitle, description: s.support.metaDescription }),
    breadcrumb: (s) => s.footer.support,
  },
  privacy: {
    paths: { 'nl-NL': '/privacy', en: '/en/privacy' },
    copy: (s) => ({ title: s.privacy.metaTitle, description: s.privacy.metaDescription }),
    breadcrumb: (s) => s.footer.privacy,
  },
  terms: {
    paths: { 'nl-NL': '/voorwaarden', en: '/en/terms' },
    copy: (s) => ({ title: s.terms.metaTitle, description: s.terms.metaDescription }),
    breadcrumb: (s) => s.footer.terms,
  },
  subProcessors: {
    paths: { 'nl-NL': '/subverwerkers', en: '/en/sub-processors' },
    copy: (s) => ({
      title: s.subProcessors.metaTitle,
      description: s.subProcessors.metaDescription,
    }),
    breadcrumb: (s) => s.footer.subProcessors,
  },
  demo: {
    paths: { 'nl-NL': '/demo', en: '/en/demo' },
    copy: (s) => ({ title: s.demo.metaTitle, description: s.demo.metaDescription }),
    breadcrumb: (s) => s.header.demo,
  },
};
const ids = Object.keys(PAGES);

const urlOf = (id: string, locale: Locale) => {
  const path = PAGES[id]?.paths[locale] ?? '';
  return `${ORIGIN}${path}`;
};

/** The types in a page's JSON-LD, and the nodes. */
type Node = Record<string, unknown> & { '@type': string };

test.describe('F064 AC12, AC14 every site page, walked in both languages', () => {
  test('has its own title and description, one h1, its language, a canonical URL, hreflang, a share image and JSON-LD', async ({
    page,
    request,
  }) => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    const imageUrls = new Set<string>();

    for (const id of ids) {
      for (const locale of locales) {
        const spec = PAGES[id] as PageSpec;
        const where = `${id} in ${locale}`;
        const { title, description } = spec.copy(messages[locale].site);

        const response = await page.goto(spec.paths[locale]);
        expect(response?.status(), where).toBe(200);

        // Title, description, one h1, the language.
        await expect(page, where).toHaveTitle(title);
        await expect(page.locator('meta[name="description"]'), where).toHaveAttribute(
          'content',
          description,
        );
        await expect(page.getByRole('heading', { level: 1 }), where).toHaveCount(1);
        await expect(page.locator('html'), where).toHaveAttribute(
          'lang',
          formattingLocales[locale],
        );
        titles.add(title);
        descriptions.add(description);

        // Canonical and hreflang, on https://fivvi.app, Dutch as x-default.
        await expect(page.locator('link[rel="canonical"]'), where).toHaveAttribute(
          'href',
          urlOf(id, locale),
        );
        const alternates = await page
          .locator('link[rel="alternate"][hreflang]')
          .evaluateAll((links) =>
            Object.fromEntries(
              links.map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]),
            ),
          );
        expect(alternates, where).toEqual({
          nl: urlOf(id, 'nl-NL'),
          en: urlOf(id, 'en'),
          'x-default': urlOf(id, 'nl-NL'),
        });

        // Open Graph and its own image, which exists.
        const og = (property: string) =>
          page.locator(`meta[property="${property}"]`).getAttribute('content');
        expect(await og('og:title'), where).toBe(title);
        expect(await og('og:description'), where).toBe(description);
        expect(await og('og:url'), where).toBe(urlOf(id, locale));
        expect(await og('og:image:width'), where).toBe('1200');
        expect(await og('og:image:height'), where).toBe('630');
        const image = (await og('og:image')) ?? '';
        expect(image, where).toMatch(new RegExp(`^${ORIGIN}/site-og/`));
        imageUrls.add(image);
        const picture = await request.get(image.replace(ORIGIN, ''));
        expect(picture.status(), where).toBe(200);
        expect(picture.headers()['content-type'], where).toBe('image/png');
        expect((await picture.body()).length, where).toBeGreaterThan(2000);

        // JSON-LD: valid JSON, the right types, nothing made up.
        const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
        expect(blocks, where).toHaveLength(1);
        const data = JSON.parse(blocks[0] ?? '') as { '@context': string; '@graph': Node[] };
        expect(data['@context'], where).toBe('https://schema.org');
        const types = data['@graph'].map((node) => node['@type']).sort();
        expect(types, where).toEqual(
          id === 'home' ? ['Organization', 'SoftwareApplication'] : ['BreadcrumbList'],
        );
        expect(blocks[0], where).not.toMatch(
          /"(aggregateRating|review|reviewRating|ratingValue|ratingCount|bestRating)"/,
        );
        if (spec.breadcrumb) {
          const list = data['@graph'][0]?.itemListElement as { name: string; item: string }[];
          expect(
            list.map((item) => [item.name, item.item]),
            where,
          ).toEqual([
            [messages[locale].site.meta.breadcrumbHome, urlOf('home', locale)],
            [spec.breadcrumb(messages[locale].site), urlOf(id, locale)],
          ]);
        }
      }
    }

    // Unique across the pages of a language, and every page has an image of its own.
    expect(titles.size).toBe(ids.length * locales.length);
    expect(descriptions.size).toBe(ids.length * locales.length);
    expect(imageUrls.size).toBe(ids.length * locales.length);
  });
});

test.describe('F064 AC13 outside production nothing is indexable', () => {
  test('every site page says noindex in the header, and its markup has no robots tag of its own', async ({
    page,
    request,
  }) => {
    for (const id of ids) {
      for (const locale of locales) {
        const path = (PAGES[id] as PageSpec).paths[locale];

        await page.goto(path);
        await expect(page.locator('meta[name="robots"]'), path).toHaveCount(0);
        const response = await request.get(path);
        expect(response.headers()['x-robots-tag'], path).toBe('noindex, nofollow');
      }
    }
  });

  test('the app, sign-in, booking and join pages and the API send noindex', async ({ request }) => {
    for (const path of [
      '/login',
      '/book/pilot-gym',
      '/join/some-code',
      '/api/v1/health',
      '/home',
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.headers()['x-robots-tag'], path).toBe('noindex, nofollow');
    }
  });

  test('the sign-in page has the noindex markup too', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('robots.txt, outside production, disallows all and names no sitemap', async ({
    request,
  }) => {
    const response = await request.get('/robots.txt');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/text\/plain/);
    const text = await response.text();
    expect(text).toMatch(/^User-Agent: \*$/im);
    expect(text).toMatch(/^Disallow: \/$/m);
    expect(text).not.toMatch(/^Allow:/im);
    expect(text).not.toMatch(/sitemap/i);
  });
});

test.describe('F064 AC13 sitemap.xml', () => {
  test('lists every page of the site, the demo page too, in both languages with its alternates', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/xml/);
    const xml = await response.text();

    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
    const expected = ids.flatMap((id) => locales.map((locale) => urlOf(id, locale)));
    expect([...locs].sort()).toEqual([...expected].sort());
    expect(locs).toContain(urlOf('demo', 'nl-NL'));
    expect(locs).toContain(urlOf('demo', 'en'));

    // Each entry carries the three alternates.
    const gyms =
      xml.slice(xml.indexOf(`<loc>${urlOf('gyms', 'en')}</loc>`)).split('</url>')[0] ?? '';
    for (const [hreflang, locale] of [
      ['nl', 'nl-NL'],
      ['en', 'en'],
      ['x-default', 'nl-NL'],
    ] as const) {
      expect(gyms).toMatch(
        new RegExp(
          `hreflang="${hreflang}"[^>]*href="${urlOf('gyms', locale)}"|href="${urlOf('gyms', locale)}"[^>]*hreflang="${hreflang}"`,
        ),
      );
    }
  });
});
