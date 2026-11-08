import type { Locale } from '@fivvi/i18n';
import { type OgColours, readOgColours } from './og-colours';
import type { SitePage } from './routes';
import { ogImageSize, pageCopy, siteName, siteOrigin } from './seo';

/** What the card says: the page's title without the ` | Fivvi` that search results add. */
export function ogHeadline(page: SitePage, locale: Locale): string {
  return pageCopy(page, locale).title.split(' | ')[0] ?? '';
}

/**
 * The share image of a page (F064 AC12): the site's look (the warm canvas, a white card, the pink
 * accent) with the page's title and the address, and nothing else. No screen, no person and no
 * figure, so nothing in it can pass for real data. It is drawn with `next/og`, which supports only
 * a part of CSS (flex layouts and inline styles).
 */
export function OgImage({
  headline,
  colours = readOgColours(),
}: {
  headline: string;
  colours?: OgColours;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: colours.accent }} />
          <div style={{ fontSize: 44, fontWeight: 700, color: colours.accentText }}>{siteName}</div>
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
