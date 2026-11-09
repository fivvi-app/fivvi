import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OgImage, ogWordmark } from './og-image';

const logo = readFileSync(
  path.resolve(import.meta.dirname, '../../../docs/design/brand/fivvi-logo.svg'),
  'utf8',
);

// #669: the share images show the wordmark of the brand, not the word in plain type.
describe('F064 #669 the wordmark in a share image', () => {
  const markup = renderToStaticMarkup(<OgImage headline="Alles voor je sportschool" />);
  const wordmark = /<img [^>]*>/.exec(markup)?.[0] ?? '';

  it('is the light wordmark of the brand, as drawn, as an image of its own proportions', () => {
    const source = /src="data:image\/svg\+xml;base64,([^"]*)"/.exec(wordmark)?.[1] ?? '';

    expect(Buffer.from(source, 'base64').toString('utf8')).toBe(logo);
    const [width, height] = [/width="(\d+)"/, /height="(\d+)"/].map((p) =>
      Number(p.exec(wordmark)?.[1]),
    );
    expect(height).toBeGreaterThanOrEqual(48);
    expect(Math.abs((width ?? 0) / (height ?? 1) - 1178 / 459)).toBeLessThan(0.03);
  });

  it('replaces the word in plain type: the card says the headline and the address, no brand name', () => {
    expect(markup).toContain('Alles voor je sportschool');
    expect(markup).toContain('fivvi.app');
    expect(markup.replace(wordmark, '')).not.toMatch(/>Fivvi</);
  });

  it('has a size that follows from the drawing', () => {
    expect(ogWordmark.height).toBeGreaterThanOrEqual(48);
    expect(ogWordmark.width).toBe(Math.round(ogWordmark.height * (1178 / 459)));
  });
});
