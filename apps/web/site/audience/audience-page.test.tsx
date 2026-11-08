import { type Locale, locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../test/render';
import { shotLanguage } from '../home/devices';
import { shots } from '../home/screens';
import type { SitePage } from '../routes';
import {
  type AudiencePageId,
  audiencePageIds,
  audiencePages,
  forKind,
  kinds,
} from './audience-data';
import { AudiencePage } from './audience-page';

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

const html = (page: AudiencePageId, locale: Locale, built?: readonly SitePage[]) =>
  renderToStaticMarkup(<AudiencePage page={page} locale={locale} built={built} />);

function links(markup: string) {
  return [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map(([, attributes = '', text = '']) => ({
    href: /href="([^"]*)"/.exec(attributes)?.[1],
    text: text.replaceAll(/<[^>]*>/g, ''),
  }));
}

const escapeRegExp = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The articles of the working day, in the order of the page. */
const articles = (markup: string) => markup.match(/<article[ >].*?<\/article>/g) ?? [];

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F064 AC2 the audience pages in %s', (locale) => {
  const copy = messages[locale].site;
  const language = shotLanguage(locale);

  /** A moment's words as the catalog has them, with the studio's words filled in. */
  function words(text: string, kind: (typeof kinds)[number] = 'pilates') {
    const studio = copy.audience.studios.words[kind];
    return escapeHtml(text.replace('{who}', studio.who).replace('{spots}', studio.spots));
  }

  describe.each(audiencePageIds)('the %s page', (page) => {
    const text = copy.audience[page];

    it('has its whole text in the HTML without script: one h1, the lead, the status line and the three problems', () => {
      const markup = html(page, locale);

      expect(markup.match(/<h1[ >]/g)).toHaveLength(1);
      expect(markup).toMatch(
        new RegExp(`<h1[^>]*>${escapeRegExp(escapeHtml(text.headline))}</h1>`),
      );
      expect(markup).toContain(escapeHtml(text.eyebrow));
      expect(markup).toContain(escapeHtml(text.lead));
      expect(markup).toContain(escapeHtml(copy.home.status));
      expect(markup).toMatch(
        new RegExp(`<h2[^>]*>${escapeRegExp(escapeHtml(copy.audience.recognise))}</h2>`),
      );
      for (const pain of Object.values(text.pains)) {
        expect(markup).toMatch(new RegExp(`<li[^>]*>${escapeRegExp(escapeHtml(pain))}</li>`));
      }
      expect(markup).not.toContain('<script');
      expect(markup).not.toContain('<form');
      expect(markup).not.toMatch(/\{[a-z]+\}/);
    });

    it('tells the day as cards: a time, a question, an answer, the ticks and the screen, in order', () => {
      const markup = html(page, locale);
      // The studio page holds one day per kind; the first is the one shown.
      const day = articles(markup).slice(0, audiencePages[page].moments.length);

      expect(day).toHaveLength(audiencePages[page].moments.length);
      expect(markup).toMatch(
        new RegExp(`<h2[^>]*>${escapeRegExp(escapeHtml(copy.audience.dayEyebrow))}</h2>`),
      );
      expect(markup).toContain(escapeHtml(copy.audience.dayLead));
      audiencePages[page].moments.forEach((moment, index) => {
        const moments = text.moments as Record<
          string,
          { question: string; answer: string; ticks: Record<string, string> }
        >;
        const entry = moments[moment.id];
        const card = day[index] ?? '';
        expect(card, `${page} ${moment.id}`).toContain(`>${moment.time}</`);
        expect(card).toMatch(
          new RegExp(`<h3[^>]*>${escapeRegExp(words(entry?.question ?? ''))}</h3>`),
        );
        expect(card).toContain(words(entry?.answer ?? ''));
        for (const tick of moment.ticks) {
          expect(card).toMatch(
            new RegExp(`<li[^>]*>.*?${escapeRegExp(words(entry?.ticks[tick] ?? ''))}`),
          );
        }
        // Each card has the real screen of its moment.
        expect(card).toContain(
          `/site-images/shots/${forKind(moment.shot, 'pilates')}-${language}-light-`,
        );
      });
    });

    it('gives the web screens the wider column, and the phones the narrower', () => {
      const markup = html(page, locale);
      const day = articles(markup).slice(0, audiencePages[page].moments.length);

      audiencePages[page].moments.forEach((moment, index) => {
        const web = shots[forKind(moment.shot, 'pilates')].device === 'browser';
        expect(day[index]?.includes('data-wide=""'), `${page} ${moment.id}`).toBe(web);
      });
    });

    it('puts the miniature beside the headline, on its own, and the screens below it', () => {
      const markup = html(page, locale);
      const scenes = markup.match(/<img[^>]*\/scenes\/[^>]*>/g) ?? [];

      expect(scenes.length).toBeGreaterThan(0);
      expect(scenes[0]).toContain(
        `/scenes/${forKind(audiencePages[page].scene, 'pilates')}-800.webp`,
      );
      for (const scene of scenes) expect(scene).toContain('alt=""');
      // The miniature is before the stage's screens, and not inside any card of the day or the stage.
      const heroEnd = markup.indexOf('site-stage');
      expect(heroEnd).toBeGreaterThan(markup.indexOf('/scenes/'));
      for (const card of articles(markup)) expect(card).not.toContain('/scenes/');
      expect(markup).not.toMatch(/<div[^>]*site-stage[^>]*>(?:(?!<\/picture>).)*\/scenes\//);
    });

    it('serves the screens of the page’s language, light and dark, each described', () => {
      const markup = html(page, locale);
      const other = language === 'en' ? 'nl' : 'en';

      expect(markup).toContain('media="(prefers-color-scheme: dark)"');
      expect(markup).toMatch(new RegExp(`-${language}-dark-(320|640|1280)\\.webp`));
      expect(markup).not.toContain(`-${other}-light-`);
      for (const picture of markup.match(/<picture>.*?<\/picture>/g) ?? []) {
        expect(picture).toMatch(/alt="[^"]{10,}"/);
      }
      const images = markup.match(/<img[^>]*>/g) ?? [];
      for (const image of images) expect(image).toMatch(/width="\d+"[^>]*height="\d+"/);
      expect(images.filter((image) => image.includes('loading="eager"')).length).toBeGreaterThan(0);
      expect(images.filter((image) => image.includes('loading="lazy"')).length).toBeGreaterThan(3);
    });

    it('closes with the promises and the shared call to action once there is a demo page', () => {
      const markup = html(page, locale, ALL_PAGES);
      const cta = copy.cta;
      const en = locale === 'en';

      expect(markup).toContain(escapeHtml(copy.home.promises.heading));
      for (const { title } of Object.values(copy.home.promises.items)) {
        expect(markup).toContain(escapeHtml(title));
      }
      expect(markup).toContain(escapeHtml(cta.heading));
      expect(links(markup).find(({ text }) => text === escapeHtml(cta.demo))?.href).toBe(
        en ? '/en/demo' : '/demo',
      );
      expect(links(markup).find(({ text }) => text === escapeHtml(cta.pricing))?.href).toBe(
        en ? '/en/pricing' : '/prijzen',
      );
      expect(html(page, locale, ['home', page])).not.toContain(escapeHtml(cta.heading));
      expect(markup).toContain(escapeHtml(copy.home.fictional));
    });

    it('links no page that does not exist', () => {
      expect(links(html(page, locale, ['home']))).toEqual([]);
    });
  });

  describe('the studios page', () => {
    const text = copy.audience.studios;

    it('has a switch between pilates and yoga, on pilates, and both kinds in the HTML for a visitor without script', () => {
      const markup = html('studios', locale);
      const buttons = [
        ...markup.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/g),
      ].map(([, pressed, label]) => [label, pressed]);

      expect(buttons).toEqual([
        [escapeHtml(text.kind.pilates), 'true'],
        [escapeHtml(text.kind.yoga), 'false'],
      ]);
      expect(markup).toContain(escapeHtml(text.kind.label));
      // The yoga screens, miniature and words are all there, in panels that are hidden: the
      // miniature, the screens under the headline and the day.
      expect(markup).toContain('/scenes/yoga-800.webp');
      expect(markup).toContain('/scenes/pilates-800.webp');
      for (const kind of kinds) {
        for (const moment of audiencePages.studios.moments) {
          expect(markup).toContain(`/${forKind(moment.shot, kind)}-${language}-light-`);
        }
      }
      expect(hiddenPanels(markup)).toHaveLength(3);
    });

    it('says instructeur or docent, and the number of spots, to match the kind of studio', () => {
      const markup = html('studios', locale);
      const [art = '', stage = '', day = ''] = hiddenPanels(markup);
      const { substitute, waitlist } = text.moments;

      // Each kind has its own words, and the one chosen is the one outside the hidden panels.
      for (const [kind, other] of [
        ['pilates', 'yoga'],
        ['yoga', 'pilates'],
      ] as const) {
        const here = markup.replace(day, '');
        const mine = words(substitute.question, kind);
        const theirs = words(substitute.question, other);
        expect(kind === 'pilates' ? here : day).toContain(mine);
        expect(kind === 'pilates' ? here : day).not.toContain(theirs);
        expect(kind === 'pilates' ? here : day).toContain(words(waitlist.question, kind));
        expect(kind === 'pilates' ? here : day).not.toContain(words(waitlist.question, other));
      }
      expect(art).toContain('/scenes/yoga-');
      expect(stage).toContain(`/web-class-yoga-${language}-light-`);
    });

    it('shows each studio’s own poster, and loads the hidden yoga screens only when yoga is chosen', () => {
      const markup = html('studios', locale);
      const [, , day = ''] = hiddenPanels(markup);

      expect(day).toContain(`/web-join-yoga-${language}-light-`);
      expect(day).not.toContain(`/web-join-pilates-`);
      expect(markup).toContain(`/web-join-pilates-${language}-light-`);
      for (const image of hiddenPanels(markup).flatMap(
        (panel) => panel.match(/<img[^>]*>/g) ?? [],
      )) {
        expect(image).toContain('loading="lazy"');
      }
    });
  });
});

/** The content of every hidden panel: the `<div hidden="">` elements, each with what is inside. */
function hiddenPanels(markup: string): string[] {
  const panels: string[] = [];
  let from = markup.indexOf('<div hidden=""');
  while (from !== -1) {
    let depth = 0;
    let end = from;
    for (const tag of markup.slice(from).matchAll(/<div[ >]|<\/div>/g)) {
      depth += tag[0] === '</div>' ? -1 : 1;
      if (depth === 0) {
        end = from + tag.index + tag[0].length;
        break;
      }
    }
    panels.push(markup.slice(from, end));
    from = markup.indexOf('<div hidden=""', end);
  }
  return panels;
}
