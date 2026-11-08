import { describe, expect, it } from 'vitest';
import { hue, mix } from '../src/colour.ts';

describe('E020 colour mixing', () => {
  it('mixes in oklab like CSS color-mix: the colour with black keeps its hue and loses light', () => {
    expect(mix('#0088FF', '#000000', 85, 'oklab')).toBe('#006CCE');
    expect(mix('#0088FF', '#000000', 75, 'oklab')).toBe('#005BAE');
    expect(mix('#E6164A', '#000000', 85, 'oklab')).toBe('#B90F3A');
  });

  it('mixes in srgb channel by channel', () => {
    expect(mix('#FF383C', '#000000', 85, 'srgb')).toBe('#D93033');
    expect(mix('#0088FF', '#FFFFFF', 15, 'srgb')).toBe('#D9EDFF');
  });

  it('is the colour itself at 100% and the other colour at 0%', () => {
    expect(mix('#34C759', '#000000', 100, 'oklab')).toBe('#34C759');
    expect(mix('#34C759', '#FFFFFF', 0, 'srgb')).toBe('#FFFFFF');
  });

  it('reads the hue of a colour in degrees', () => {
    expect(hue('#FF0000')).toBeCloseTo(0, 0);
    expect(hue('#00FF00')).toBeCloseTo(120, 0);
    expect(hue('#0000FF')).toBeCloseTo(240, 0);
  });
});
