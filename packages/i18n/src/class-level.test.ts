import { describe, expect, it } from 'vitest';
import { messages } from './index.ts';

// F067 Class Levels (spec #587): the field, the five words and the accessible name of the level
// icon, the same on every platform (the native catalogs are generated from these).

describe('F067 the class level words', () => {
  it('Niveau and the five words in Dutch, as GLOSSARY.md words them', () => {
    expect(messages['nl-NL'].classLevel).toEqual({
      accessibleName: 'Niveau: {level}',
      advanced: 'Gevorderd',
      allLevels: 'Alle niveaus',
      beginner: 'Beginner',
      field: 'Niveau',
      intermediate: 'Gemiddeld',
      none: 'Geen',
    });
  });

  it('Level and the five words in English', () => {
    expect(messages.en.classLevel).toEqual({
      accessibleName: 'Level: {level}',
      advanced: 'Advanced',
      allLevels: 'All levels',
      beginner: 'Beginner',
      field: 'Level',
      intermediate: 'Intermediate',
      none: 'None',
    });
  });
});
