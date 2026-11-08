import { ImageResponse } from 'next/og';
import { OgImage, ogHeadline } from '../../../../site/og-image';
import { imageLanguages, ogImageSize, siteImagePages } from '../../../../site/seo';

// The share image of every page in each language, drawn once when the site is built (F064 AC12).
// Any other address is a 404 and nothing is drawn per request.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return imageLanguages.flatMap((language) => siteImagePages.map((page) => ({ language, page })));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ language: string; page: string }> },
) {
  const { language, page } = await params;
  const known = siteImagePages.find((candidate) => candidate === page);
  if (!known || !(imageLanguages as readonly string[]).includes(language)) {
    return new Response(null, { status: 404 });
  }
  const locale = language === 'en' ? 'en' : 'nl-NL';
  return new ImageResponse(<OgImage headline={ogHeadline(known, locale)} />, ogImageSize);
}
