import { describe, expect, it } from 'vitest';
import { type Locale, locales } from './config.ts';
import { messages } from './index.ts';
import { analyze } from './tools/analyze.ts';
import type { Body, Part } from './tools/icu.ts';
import {
  TRAINER_WORDS,
  type TrainerWord,
  type TrainerWordForms,
  trainerWordForms,
} from './trainer-word.ts';

/** The six placeholders a message uses for the word (spec #588, "The forms"). */
const FORMS = ['word', 'words', 'Word', 'Words', 'aWord', 'AWord'] as const;
const CAPITAL_FORMS: readonly string[] = ['Word', 'Words', 'AWord'];

type Expected = Record<TrainerWord, readonly [string, string, string, string, string, string]>;
const EXPECTED: Record<Locale, Expected> = {
  'nl-NL': {
    trainer: ['trainer', 'trainers', 'Trainer', 'Trainers', 'een trainer', 'Een trainer'],
    instructeur: [
      'instructeur',
      'instructeurs',
      'Instructeur',
      'Instructeurs',
      'een instructeur',
      'Een instructeur',
    ],
    docent: ['docent', 'docenten', 'Docent', 'Docenten', 'een docent', 'Een docent'],
    coach: ['coach', 'coaches', 'Coach', 'Coaches', 'een coach', 'Een coach'],
  },
  en: {
    trainer: ['trainer', 'trainers', 'Trainer', 'Trainers', 'a trainer', 'A trainer'],
    instructeur: [
      'instructor',
      'instructors',
      'Instructor',
      'Instructors',
      'an instructor',
      'An instructor',
    ],
    docent: ['teacher', 'teachers', 'Teacher', 'Teachers', 'a teacher', 'A teacher'],
    coach: ['coach', 'coaches', 'Coach', 'Coaches', 'a coach', 'A coach'],
  },
};

describe('F068 the workspace’s word for its trainers', () => {
  it('offers exactly trainer, instructeur, docent and coach, in that order', () => {
    expect(TRAINER_WORDS).toEqual(['trainer', 'instructeur', 'docent', 'coach']);
  });

  describe('AC5: every form, word and language', () => {
    for (const locale of locales) {
      for (const choice of TRAINER_WORDS) {
        it(`gives the six forms of ${choice} in ${locale}`, () => {
          expect(trainerWordForms(choice, locale)).toEqual(
            Object.fromEntries(FORMS.map((form, i) => [form, EXPECTED[locale][choice][i]])),
          );
        });
      }
    }

    it('has every form of every word in both catalogs, and nothing else', () => {
      for (const locale of locales) {
        const group = messages[locale].trainerWord as Record<string, Record<string, string>>;
        expect(Object.keys(group)).toEqual([...TRAINER_WORDS]);
        for (const choice of TRAINER_WORDS) {
          expect(Object.keys(group[choice] ?? {}).sort()).toEqual(
            ['word', 'words', 'wordCap', 'wordsCap', 'aWord', 'aWordCap'].sort(),
          );
        }
      }
    });

    it('capitalises the start only, and puts the article only on the a-forms', () => {
      for (const locale of locales) {
        for (const choice of TRAINER_WORDS) {
          const forms = trainerWordForms(choice, locale);
          expect(forms.Word).toBe(capitalise(forms.word));
          expect(forms.Words).toBe(capitalise(forms.words));
          expect(forms.AWord).toBe(capitalise(forms.aWord));
          expect(forms.aWord.endsWith(` ${forms.word}`)).toBe(true);
        }
      }
    });

    it('never compounds: a form is one word (and the article)', () => {
      for (const locale of locales) {
        for (const choice of TRAINER_WORDS) {
          const forms = trainerWordForms(choice, locale);
          for (const form of ['word', 'words', 'Word', 'Words'] as const) {
            expect(forms[form]).not.toMatch(/[\s-]/);
          }
        }
      }
    });

    it('renders every catalog message that uses the word, with every word, in both languages', () => {
      const analysis = analyze({ messages, comments: {} });
      const users = analysis.keys.filter((key) => usesWord(analysis, key));
      // The role label is the first message that uses the word (the others come with the tickets that switch their callers).
      expect(users).toContain('roles.trainerLabel');

      for (const key of users) {
        for (const locale of locales) {
          const message = analysis.compiled[locale].get(key);
          if (!message) throw new Error(`${key} is missing in ${locale}`);
          for (const choice of TRAINER_WORDS) {
            const forms = trainerWordForms(choice, locale);
            for (const text of render(message.body, forms)) {
              expect(text, `${key} (${locale}, ${choice})`).not.toMatch(/[{}]/);
              // Only the chosen word may name the role: no literal trainer for another choice.
              if (choice !== 'trainer') expect(text.toLowerCase()).not.toContain('trainer');
              expect(text).toContain(forms[usedForm(message.body)]);
            }
          }
        }
      }
    });

    it('reads a sentence correctly for each word, as the spec’s examples do', () => {
      expect(`${trainerWordForms('instructeur', 'nl-NL').AWord} nodig`).toBe(
        'Een instructeur nodig',
      );
      expect(trainerWordForms('instructeur', 'en').AWord).toBe('An instructor');
      expect(trainerWordForms('docent', 'en').AWord).toBe('A teacher');
      expect(trainerWordForms('docent', 'nl-NL').Words).toBe('Docenten');
    });

    it('keeps a lowercase form out of the start of a message, and a capital one out of its middle', () => {
      const analysis = analyze({ messages, comments: {} });
      for (const locale of locales) {
        for (const [key, message] of analysis.compiled[locale]) {
          for (const parts of partLists(message.body)) {
            parts.forEach((part, i) => {
              if (part.type !== 'arg' || !(FORMS as readonly string[]).includes(part.name)) return;
              const before = parts.slice(0, i).map(textOf).join('');
              const capital = CAPITAL_FORMS.includes(part.name);
              if (before === '' && !capital) {
                expect.fail(
                  `${key} (${locale}): {${part.name}} starts the message; use its capital form`,
                );
              }
              if (capital && /[a-z0-9] $/.test(before)) {
                expect.fail(
                  `${key} (${locale}): {${part.name}} is mid-sentence; use its lowercase form`,
                );
              }
            });
          }
        }
      }
    });
  });
});

function capitalise(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function partLists(body: Body): Part[][] {
  return body.kind === 'simple'
    ? [body.parts]
    : [body.before, ...Object.values(body.branches), body.after];
}

function textOf(part: Part): string {
  return part.type === 'text' ? part.value : part.type === 'count' ? '1' : `{${part.name}}`;
}

function usesWord(analysis: ReturnType<typeof analyze>, key: string): boolean {
  return locales.some((locale) =>
    analysis.compiled[locale]
      .get(key)
      ?.args.some((arg) => (FORMS as readonly string[]).includes(arg.name)),
  );
}

function usedForm(body: Body): (typeof FORMS)[number] {
  for (const parts of partLists(body)) {
    for (const part of parts) {
      if (part.type === 'arg' && (FORMS as readonly string[]).includes(part.name)) {
        return part.name as (typeof FORMS)[number];
      }
    }
  }
  throw new Error('the message does not use the word');
}

/** Every text the message can show: one per plural branch, with the count, the forms and any other value filled in. */
function render(body: Body, forms: TrainerWordForms): string[] {
  return partLists(body).map((parts) =>
    parts
      .map((part) =>
        part.type === 'text'
          ? part.value
          : part.type === 'count'
            ? '2'
            : // A message may carry other values too (a person's name, a workspace): any stand-in will do.
              (forms[part.name as keyof TrainerWordForms] ?? 'Sam'),
      )
      .join(''),
  );
}
