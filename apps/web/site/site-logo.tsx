import type { Locale } from '@fivvi/i18n';
import Link from 'next/link';
import { siteHomePath } from './routes';
import { siteText } from './text';

/**
 * The Fivvi wordmark of the brand (`docs/design/brand/README.md`), drawn once and used as drawn: the
 * script `scripts/brand-icons.ts` copies `fivvi-logo.svg` (near-black letters) and
 * `fivvi-logo-dark.svg` (white letters, a lighter pink) here. Their colours belong to the logo
 * alone, so they are not design tokens.
 */
export const LOGO_LIGHT_SRC = '/site-images/brand/fivvi-logo.svg';
export const LOGO_DARK_SRC = '/site-images/brand/fivvi-logo-dark.svg';

/** The wordmark's width over its height: its `viewBox` is 1178 x 459. */
export const LOGO_RATIO = 1178 / 459;

/** The two places the logo sits: the brand's smallest size is 20 px high on a screen. */
const sizes = { header: 28, footer: 24 } as const;

/**
 * The logo as a link to the home page of the language (F064, #669). The picture shows the white
 * wordmark when the visitor's system is dark (the site's one dark-mode switch is
 * `prefers-color-scheme`, as in the design tokens) and the light one otherwise. Width and height
 * are set, so the page does not shift while the image loads. The link's padding is the logo's clear
 * space: the brand asks for at least the height of an i dot (a fifth of the logo's height) free all
 * around, and 6 px is more than that at both sizes. Its accessible name is the image's alt text,
 * from the catalog.
 */
export function SiteLogo({ locale, place }: { locale: Locale; place: keyof typeof sizes }) {
  const height = sizes[place];
  const width = Math.round(height * LOGO_RATIO);
  return (
    <Link href={siteHomePath(locale)} prefetch={false} className="inline-flex rounded-md p-1.5">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={LOGO_DARK_SRC} />
        <img
          src={LOGO_LIGHT_SRC}
          alt={siteText(locale)('site.logo.homeLabel')}
          width={width}
          height={height}
          className="block"
        />
      </picture>
    </Link>
  );
}
