import { type Locale, locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../test/render';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { LOGO_DARK_SRC, LOGO_LIGHT_SRC, LOGO_RATIO } from './site-logo';

// The client pieces (the current page, the language switch) read the path through the router,
// which exists only in a running app.
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const homePath = (locale: Locale) => (locale === 'en' ? '/en' : '/');

/** The link to the home page of the logo: its attributes and everything inside it. */
function logoLink(markup: string, locale: Locale) {
  const found = [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].find(([, attributes = '']) =>
    attributes.includes(`href="${homePath(locale)}"`),
  );
  return { attributes: found?.[1] ?? '', inside: found?.[2] ?? '' };
}

const attribute = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

// #669: the wordmark of the brand (`docs/design/brand`) replaces the word in plain type.
describe.each(locales)('F064 #669 the logo in the header and footer in %s', (locale) => {
  const label = messages[locale].site.logo.homeLabel;
  const surfaces = {
    header: <SiteHeader locale={locale} />,
    footer: <SiteFooter locale={locale} />,
  };

  for (const [name, surface] of Object.entries(surfaces)) {
    describe(name, () => {
      const { inside } = logoLink(renderToStaticMarkup(surface), locale);

      it('is a link to the home page of the language, named from the catalog', () => {
        const image = /<img [^>]*>/.exec(inside)?.[0] ?? '';

        expect(inside).not.toBe('');
        expect(attribute(image, 'alt')).toBe(escapeHtml(label));
        expect(label).toContain(messages[locale].app.title);
      });

      it('shows the light wordmark, and the white one in dark mode', () => {
        const image = /<img [^>]*>/.exec(inside)?.[0] ?? '';
        const source = /<source [^>]*>/.exec(inside)?.[0] ?? '';

        expect(attribute(image, 'src')).toBe(LOGO_LIGHT_SRC);
        expect(attribute(source, 'srcSet')).toBe(LOGO_DARK_SRC);
        expect(attribute(source, 'media')).toBe('(prefers-color-scheme: dark)');
        expect(LOGO_LIGHT_SRC).toBe('/site-images/brand/fivvi-logo.svg');
        expect(LOGO_DARK_SRC).toBe('/site-images/brand/fivvi-logo-dark.svg');
      });

      it('is at least 20 px high, with its width and height set so the page does not shift', () => {
        const image = /<img [^>]*>/.exec(inside)?.[0] ?? '';
        const [width, height] = [attribute(image, 'width'), attribute(image, 'height')].map(Number);

        expect(height).toBeGreaterThanOrEqual(20);
        expect(width).toBeGreaterThan(0);
        // The drawing's proportions, to the pixel.
        expect(Math.abs((width ?? 0) / (height ?? 1) - LOGO_RATIO)).toBeLessThan(0.02);
      });
    });
  }
});
