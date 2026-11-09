import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Locale } from '@fivvi/i18n';
import { type OgColours, readOgColours } from './og-colours';
import type { SitePage } from './routes';
import { ogImageSize, pageCopy, siteName, siteOrigin } from './seo';

/** What the card says: the page's title without the ` | Fivvi` that search results add. */
export function ogHeadline(page: SitePage, locale: Locale): string {
  return pageCopy(page, locale).title.split(' | ')[0] ?? '';
}

/**
 * The wordmark in a share image (#669): the light `fivvi-logo.svg` of the brand as drawn, which
 * the site's header serves too (`scripts/brand-icons.ts` copies it). 64 px high, as wide as its
 * `viewBox` (1178 x 459) says. Read from `public/` at build time, from `apps/web`, like the colours.
 */
export const ogWordmark = { height: 64, width: Math.round(64 * (1178 / 459)) } as const;

const wordmarkFile = path.resolve(process.cwd(), 'public/site-images/brand/fivvi-logo.svg');

/** The wordmark as an image address. Throws when the file is missing, never an image without it. */
export function readWordmark(svg: Buffer = readFileSync(wordmarkFile)): string {
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

/**
 * The share image of a page (F064 AC12): the site's look (the warm canvas and a white card) with the
 * wordmark, the page's title and the address, and nothing else. No screen, no person and no figure, so nothing in it can pass for real data. It is drawn with `next/og`, which supports only
 * a part of CSS (flex layouts and inline styles).
 */
export function OgImage({
  headline,
  colours = readOgColours(),
  wordmark = readWordmark(),
}: {
  headline: string;
  colours?: OgColours;
  wordmark?: string;
}) {
  const size = headline.length > 48 ? 64 : 80;
  return (
    <div
      style={{
        width: ogImageSize.width,
        height: ogImageSize.height,
        display: 'flex',
        padding: 48,
        background: colours.canvas,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          borderRadius: 40,
          background: colours.surface,
        }}
      >
        <div style={{ display: 'flex' }}>
          {/* biome-ignore lint/performance/noImgElement: next/og draws a plain img; next/image is for pages */}
          <img src={wordmark} alt={siteName} width={ogWordmark.width} height={ogWordmark.height} />
        </div>
        <div
          style={{
            fontSize: size,
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: -2,
            color: colours.text,
          }}
        >
          {headline}
        </div>
        <div style={{ display: 'flex', fontSize: 32, color: colours.secondary }}>
          {siteOrigin.replace('https://', '')}
        </div>
      </div>
    </div>
  );
}
