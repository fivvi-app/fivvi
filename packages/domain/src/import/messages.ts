import { type Locale, messages } from '@fivvi/i18n';
import { createTranslator } from 'use-intl/core';
import type { ImportProblem, ImportProblemType } from './check.ts';
import type { ImportFileErrorReason } from './parse.ts';

// The messages of the import check, in the Owner's language (`dataImport.*` in packages/i18n).

const PROBLEM_KEYS = {
  'sheet-missing': 'sheetMissing',
  'column-missing': 'columnMissing',
  'column-not-imported': 'columnNotImported',
  'column-repeated': 'columnRepeated',
  'column-without-name': 'columnWithoutName',
  'value-missing': 'valueMissing',
  'client-key-duplicate': 'clientKeyDuplicate',
  'email-missing': 'emailMissing',
  'email-invalid': 'emailInvalid',
  'email-duplicate': 'emailDuplicate',
  'language-not-supported': 'languageNotSupported',
  'trainer-unknown': 'trainerUnknown',
  'status-not-supported': 'statusNotSupported',
  'client-inactive': 'clientInactive',
  'client-exists': 'clientExists',
} as const satisfies Record<
  ImportProblemType,
  keyof (typeof messages)['nl-NL']['dataImport']['problems']
>;

const FILE_ERROR_KEYS = {
  'too-large': 'tooLarge',
  'too-many-rows': 'tooManyRows',
  unreadable: 'unreadable',
} as const satisfies Record<
  ImportFileErrorReason,
  keyof (typeof messages)['nl-NL']['dataImport']['fileErrors']
>;

function translate(locale: Locale, key: string, values: Record<string, string> = {}): string {
  const translator = createTranslator({
    locale: locale === 'nl-NL' ? 'nl-NL' : 'en-GB',
    messages: messages[locale],
    onError: (error) => {
      throw error;
    },
  });
  // The keys are typed by the maps above; use-intl wants a literal path.
  return (translator as unknown as (key: string, values: Record<string, string>) => string)(
    key,
    values,
  );
}

/** The message of a finding, in the language of the Owner who reads it. */
export function describeProblem(problem: ImportProblem, locale: Locale): string {
  return translate(locale, `dataImport.problems.${PROBLEM_KEYS[problem.type]}`, {
    ...problem.values,
  });
}

/** The message for a file that can't be checked at all. */
export function describeFileError(reason: ImportFileErrorReason, locale: Locale): string {
  return translate(locale, `dataImport.fileErrors.${FILE_ERROR_KEYS[reason]}`);
}
