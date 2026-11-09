import { describe, expect, it } from 'vitest';
import { pickContentLanguage } from './content-language.ts';

describe('F021 AC9 pickContentLanguage: user content in the viewer’s language, else Dutch (PRODUCT.md §3)', () => {
  it('shows the English text to an English viewer when there is one', () => {
    expect(pickContentLanguage('en', 'Kracht', 'Strength')).toBe('Strength');
  });

  it('shows the Dutch text to a Dutch viewer, also when an English text exists', () => {
    expect(pickContentLanguage('nl-NL', 'Kracht', 'Strength')).toBe('Kracht');
  });

  it('falls back to Dutch for an English viewer without an English text', () => {
    expect(pickContentLanguage('en', 'Kracht', null)).toBe('Kracht');
    expect(pickContentLanguage('en', 'Kracht', undefined)).toBe('Kracht');
  });

  it('treats a blank English text as missing', () => {
    expect(pickContentLanguage('en', 'Kracht', '   ')).toBe('Kracht');
    expect(pickContentLanguage('en', 'Kracht', '')).toBe('Kracht');
  });

  it('reads a language tag by its language: en-GB is English, nl-BE is Dutch', () => {
    expect(pickContentLanguage('en-GB', 'Kracht', 'Strength')).toBe('Strength');
    expect(pickContentLanguage('nl-BE', 'Kracht', 'Strength')).toBe('Kracht');
  });

  it('falls back to Dutch for a language there is no catalog for, or none at all', () => {
    expect(pickContentLanguage('de', 'Kracht', 'Strength')).toBe('Kracht');
    expect(pickContentLanguage(undefined, 'Kracht', 'Strength')).toBe('Kracht');
    expect(pickContentLanguage(null, 'Kracht', 'Strength')).toBe('Kracht');
  });

  it('keeps an absent Dutch text absent: a description in English only is shown to English viewers alone', () => {
    expect(pickContentLanguage('en', null, 'Only English')).toBe('Only English');
    expect(pickContentLanguage('nl-NL', null, 'Only English')).toBeNull();
    expect(pickContentLanguage('en', null, null)).toBeNull();
  });

  it('never translates: the text is returned as it was written', () => {
    expect(pickContentLanguage('en', 'Kracht & Conditie', ' Strength ')).toBe(' Strength ');
  });
});
