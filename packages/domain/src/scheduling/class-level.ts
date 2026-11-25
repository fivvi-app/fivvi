// Module: The class level (F067, spec #587): `CLASS_LEVELS`, the fixed list of four values a class,
//        a weekly series and a class date can carry (`null` is *Geen*), and `ClassLevel`
// Spec: F067 AC4

/**
 * The levels of a class, in the order of the field's list (*Alle niveaus*, *Beginner*, *Gemiddeld*,
 * *Gevorderd*). A fixed enum, not free text and not translated user content: the API returns the
 * value and each platform shows the word from `classLevel.*` in `packages/i18n`. `null` is *Geen*,
 * the starting value; nothing in booking reads the level.
 */
export const CLASS_LEVELS = ['all_levels', 'beginner', 'intermediate', 'advanced'] as const;

export type ClassLevel = (typeof CLASS_LEVELS)[number];
