import { describe, expect, it } from 'vitest';
import { ogColourTokens, readOgColours } from './og-colours';

describe('F064 AC12 the colours of a share image', () => {
  it('are the light-mode values of the design tokens, the first block of the stylesheet', () => {
    const colours = readOgColours();

    for (const value of Object.values(colours)) expect(value).toMatch(/^#[\da-f]{6}$/);
  });

  it('take the first block of the stylesheet, which is the light mode', () => {
    const block = (canvas: string) =>
      Object.values(ogColourTokens)
        .map((token) => `${token}: ${token === ogColourTokens.canvas ? canvas : '#123456'};`)
        .join('\n');

    expect(readOgColours(`${block('#111111')}\n${block('#222222')}`).canvas).toBe('#111111');
  });

  it('fail loudly when a token is missing, never a blank image', () => {
    expect(() => readOgColours(':root {}')).toThrow(/--th-color/);
  });
});
