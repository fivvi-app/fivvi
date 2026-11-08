import { describe, expect, it } from 'vitest';
import { imageLanguages, siteImagePages } from '../../../../site/seo';
import { dynamicParams, GET, generateStaticParams } from './route';

describe('F064 AC12 the Open Graph images', () => {
  it('are made at build time, one for every page in each language, and no other address answers', () => {
    expect(dynamicParams).toBe(false);
    const params = generateStaticParams();

    expect(params).toHaveLength(siteImagePages.length * imageLanguages.length);
    for (const language of imageLanguages) {
      for (const page of siteImagePages) {
        expect(params).toContainEqual({ language, page });
      }
    }
  });

  it('is a 1200 x 630 PNG', async () => {
    const response = await GET(new Request('https://fivvi.app/site-og/nl/home'), {
      params: Promise.resolve({ language: 'nl', page: 'home' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const png = new DataView(await response.arrayBuffer());
    // The IHDR chunk: width and height as big-endian 32-bit numbers after the 8-byte signature.
    expect([png.getUint32(16), png.getUint32(20)]).toEqual([1200, 630]);
  });

  it('answers 404 for an address that is not a page of the site', async () => {
    for (const params of [
      { language: 'de', page: 'home' },
      { language: 'nl', page: 'privacy' },
      { language: 'nl', page: 'nope' },
    ]) {
      const response = await GET(new Request('https://fivvi.app/site-og/x/y'), {
        params: Promise.resolve(params),
      });
      expect(response.status).toBe(404);
    }
  });
});
