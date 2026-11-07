import { type Locale, locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../test/render';
import { HomePage } from '../home-page';
import type { SitePage } from '../routes';

const html = (locale: Locale, built?: readonly SitePage[]) =>
  renderToStaticMarkup(<HomePage locale={locale} built={built} />);

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

function links(markup: string) {
  return [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map(([, attributes = '', text = '']) => ({
    href: /href="([^"]*)"/.exec(attributes)?.[1],
    text: text.replaceAll(/<[^>]*>/g, ''),
  }));
}

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F064 AC3 the home page in %s', (locale) => {
  const copy = messages[locale].site.home;
  const cta = messages[locale].site.cta;

  it('has the whole page in the HTML, without script: every band, card and promise', () => {
    const page = html(locale);

    expect(page.match(/<h1[ >]/g)).toHaveLength(1);
    for (const heading of [
      copy.onePlace.heading,
      copy.chain.heading,
      copy.forWhom.heading,
      copy.platforms.heading,
      copy.promises.heading,
    ]) {
      expect(page, heading).toMatch(
        new RegExp(`<h2[^>]*>${escapeRegExp(escapeHtml(heading))}</h2>`),
      );
    }
    const texts = [
      copy.status,
      copy.onePlace.calendar,
      copy.onePlace.app,
      copy.onePlace.everything,
      ...Object.values(copy.chain.steps).flatMap(({ title, text }) => [title, text]),
      ...Object.values(copy.promises.items).flatMap(({ title, text }) => [title, text]),
      ...Object.values(copy.audience).flatMap(({ cardTitle, short }) => [cardTitle, short]),
      copy.platforms.owners,
      copy.platforms.clients,
      ...Object.values(copy.platforms.items).flatMap(({ title, text }) => [title, text]),
      copy.fictional,
    ];
    for (const text of texts) expect(page, text).toContain(escapeHtml(text));
    expect(page).not.toContain('<script');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('{{');
  });

  it('starts on the gym: its miniature, its line and its screens, with the switch on it', () => {
    const page = html(locale);

    expect(page).toContain('/site-images/scenes/gym-800.webp');
    expect(page).toContain(escapeHtml(copy.audience.gym.short));
    expect(page).toContain(escapeHtml(copy.screens.webDashboard));
    expect(page).toContain(escapeHtml(copy.screens.proTodayGym));
    expect(page).not.toContain(escapeHtml(copy.screens.proTodaySolo));
    const buttons = [
      ...page.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/g),
    ];
    const switchButtons = buttons.filter(([, , label]) =>
      [copy.iAm.gym, copy.iAm.studio, copy.iAm.pt, copy.iAm.client]
        .map(escapeHtml)
        .includes(label ?? ''),
    );
    expect(switchButtons.map(([, pressed, label]) => [label, pressed])).toEqual([
      [escapeHtml(copy.iAm.gym), 'true'],
      [escapeHtml(copy.iAm.studio), 'false'],
      [escapeHtml(copy.iAm.pt), 'false'],
      [escapeHtml(copy.iAm.client), 'false'],
    ]);
    expect(page).toContain(escapeHtml(copy.iAm.label));
  });

  it('shows the credits of the sample booking, and a button that asks before it books', () => {
    const page = html(locale);

    expect(page).toContain(escapeHtml(copy.chain.card.say0.replace('{count}', '7')));
    expect(page).toContain(escapeHtml(copy.chain.card.book));
    // The confirmation and the attendance button appear only after the visitor books.
    expect(page).not.toContain(escapeHtml(copy.chain.card.confirm));
    expect(page).not.toContain(escapeHtml(copy.chain.card.attend));
  });

  it('has both groups of the platforms in the HTML, the one not chosen hidden', () => {
    const page = html(locale);
    const { items } = copy.platforms;

    expect(page).toMatch(
      new RegExp(
        `<div hidden=""[^>]*>(?:(?!<div hidden).)*${escapeRegExp(escapeHtml(items.clientIphone.title))}`,
      ),
    );
    expect(page).not.toMatch(
      new RegExp(
        `<div hidden=""[^>]*>(?:(?!<div hidden).)*${escapeRegExp(escapeHtml(items.proIphone.title))}`,
      ),
    );
  });

  it('writes each figure of the sample booking as a label then its number, valid in a list', () => {
    const page = html(locale);
    const { left, planned, used, time } = copy.chain.card;

    for (const label of [left, planned, used]) {
      expect(page).toMatch(new RegExp(`<dt[^>]*>${escapeRegExp(escapeHtml(label))}</dt><dd`));
    }
    expect(page).not.toMatch(/<\/dd><dt/);
    expect(page).toContain(`>${time}</span>`);
  });

  it('serves the screens of the page’s language, light and dark, with a description', () => {
    const page = html(locale);
    const language = locale === 'en' ? 'en' : 'nl';
    const other = language === 'en' ? 'nl' : 'en';

    expect(page).toContain(`/site-images/shots/web-agenda-${language}-light-1280.webp`);
    expect(page).toContain(`/site-images/shots/web-agenda-${language}-dark-640.webp`);
    expect(page).toContain('media="(prefers-color-scheme: dark)"');
    expect(page).not.toContain(`-${other}-light-`);
    // A screen always says what it shows; a miniature stands on its own.
    for (const picture of (page.match(/<picture>.*?<\/picture>/g) ?? []).filter(
      (candidate) => !candidate.includes('/scenes/'),
    )) {
      expect(picture).toMatch(/alt="[^"]{10,}"/);
    }
    for (const scene of page.match(/<img[^>]*scenes[^>]*>/g) ?? [])
      expect(scene).toContain('alt=""');
  });

  it('puts the first screens first and loads the rest as they come near', () => {
    const page = html(locale);
    const images = page.match(/<img[^>]*>/g) ?? [];

    expect(images.filter((image) => image.includes('loading="eager"')).length).toBeGreaterThan(0);
    expect(images.filter((image) => image.includes('loading="lazy"')).length).toBeGreaterThan(3);
    for (const image of images) expect(image).toMatch(/width="\d+"[^>]*height="\d+"/);
  });

  // F064 AC15: images are modern formats per screen size, with their size set.
  it('serves every image in a modern format, in sizes of its own, with its size set', () => {
    const page = html(locale);
    const images = page.match(/<img[^>]*>/g) ?? [];

    expect(images.length).toBeGreaterThan(3);
    for (const image of images) {
      expect(image).toMatch(/width="\d+"[^>]*height="\d+"/);
      expect(image).toMatch(/srcSet="[^"]+ \d+w, [^"]+ \d+w/);
      expect(image).toMatch(/sizes="[^"]+"/);
      expect(image).not.toMatch(/\.(png|jpe?g|gif)\b/);
    }
    // The miniature is AVIF first and WebP for a browser that lacks it.
    const scene = (page.match(/<picture>(?:(?!<\/picture>).)*\/scenes\/.*?<\/picture>/g) ?? [])[0];
    expect(scene).toMatch(
      /<source type="image\/avif" srcSet="[^"]*-400\.avif 400w, [^"]*-600\.avif 600w, [^"]*-800\.avif 800w"/,
    );
    expect(scene).toMatch(/<img[^>]*src="[^"]*-800\.webp"/);
    expect(scene).toContain('fetchPriority="high"');
  });

  // AC15: a picture that fades in from nothing is painted, and counted as the largest contentful
  // paint, only once the fade is over. The first miniature and the screens under it are there at once.
  it('shows the first miniature and its screens at once, without a fade in', () => {
    const page = html(locale);
    const firstScreen = page.slice(0, page.indexOf('<section'));

    expect(firstScreen).toContain('<picture><source type="image/avif"');
    expect(firstScreen).toContain('site-stage');
    expect(firstScreen).not.toContain('animate-in');
  });

  it('links no page that does not exist, and no button goes to a 404', () => {
    const page = html(locale, ['home']);

    expect(links(page)).toEqual([]);
    expect(page).not.toContain(escapeHtml(copy.seeFor));
    expect(page).not.toContain(escapeHtml(copy.forWhom.readDay));
    expect(page).not.toContain(escapeHtml(cta.pricing));
  });

  it('closes with the shared call to action once there is a demo page, and not before', () => {
    expect(html(locale, ['home'])).not.toContain(escapeHtml(cta.heading));
    const page = html(locale, ALL_PAGES);

    expect(page).toContain(escapeHtml(cta.heading));
    expect(page).toContain(escapeHtml(cta.text));
    expect(page).toContain(escapeHtml(copy.fictional));
    expect(html(locale, ['home'])).toContain(escapeHtml(copy.fictional));
  });

  it('links the audience pages, the demo and the prices once they exist', () => {
    const en = locale === 'en';
    const page = html(locale, ALL_PAGES);
    const hrefs = links(page).map(({ href }) => href);

    expect(hrefs).toEqual(
      expect.arrayContaining([
        en ? '/en/gyms' : '/sportscholen',
        en ? '/en/studios' : '/studios',
        en ? '/en/personal-trainers' : '/personal-trainers',
        en ? '/en/clients' : '/klanten',
        en ? '/en/demo' : '/demo',
        en ? '/en/pricing' : '/prijzen',
      ]),
    );
    expect(links(page).find(({ href }) => href === (en ? '/en/demo' : '/demo'))?.text).toBe(
      escapeHtml(cta.demo),
    );
    expect(links(page).find(({ href }) => href === (en ? '/en/pricing' : '/prijzen'))?.text).toBe(
      escapeHtml(cta.pricing),
    );
    // The line under the headline links the first audience's page.
    expect(links(page).find(({ text }) => text.startsWith(escapeHtml(copy.seeFor)))?.href).toBe(
      en ? '/en/gyms' : '/sportscholen',
    );
    // Only the pages that exist: a language never links the other language's page.
    for (const href of hrefs) expect(href?.startsWith('/en') ?? false).toBe(en);
  });

  it('links only the built pages when some exist', () => {
    const page = html(locale, ['home', 'gyms']);

    expect(links(page).map(({ href }) => href)).toEqual(
      locale === 'en' ? ['/en/gyms', '/en/gyms'] : ['/sportscholen', '/sportscholen'],
    );
  });
});

function escapeRegExp(text: string) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
