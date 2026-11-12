import en from '../en.json' with { type: 'json' };
import nlNL from '../nl-NL.json' with { type: 'json' };
import type { Locale } from './config.ts';

/**
 * The word a workspace uses for the people who teach (F068, spec #588): one of four choices,
 * stored on the workspace. It is only a label; the role stays Trainer in code, routes, role values
 * and the permission matrix. The values are Dutch identifiers; each language words them itself
 * (`trainerWord.*` in the catalogs, below). `packages/database` writes the same list for
 * its enum, because the runtime image ships it without this package; its `ops-image.test.ts`
 * compares the two.
 */
export const TRAINER_WORDS = ['trainer', 'instructeur', 'docent', 'coach'] as const;
export type TrainerWord = (typeof TRAINER_WORDS)[number];

/**
 * The values of the six placeholders a message uses for the word: `{word}`, `{words}`,
 * `{Word}`, `{Words}`, `{aWord}` and `{AWord}` ("een instructeur", "An instructor"). Plain
 * placeholders, because the native exporters reject ICU `select`. They are separate because
 * English needs *a* or *an*, and Dutch never compounds the word ("profiel van de trainer",
 * not "trainersprofiel"). `{trainer}` stays a person's name.
 */
export interface TrainerWordForms {
  word: string;
  words: string;
  Word: string;
  Words: string;
  aWord: string;
  AWord: string;
}

const catalogs = { 'nl-NL': nlNL.trainerWord, en: en.trainerWord } as const;

/**
 * The placeholder values for a workspace's choice in the reader's language. The words live in
 * the catalogs (`trainerWord.<choice>.<form>`), so the native apps mirror this from the
 * generated strings, with tests named after this one (spec #588, AC5, AC13).
 */
export function trainerWordForms(choice: TrainerWord, locale: Locale): TrainerWordForms {
  const forms = catalogs[locale][choice];
  return {
    word: forms.word,
    words: forms.words,
    Word: forms.wordCap,
    Words: forms.wordsCap,
    aWord: forms.aWord,
    AWord: forms.aWordCap,
  };
}
