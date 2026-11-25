'use client';

import { Label } from '@fivvi/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { LevelIcon } from '@fivvi/ui/kit/level-icon';
import { useTranslations } from 'next-intl';
import { CLASS_LEVELS, type ClassLevel, type ClassLevelChoice } from './classes-client';

/** The `classLevel.*` key of each level's word. */
const WORD = {
  all_levels: 'allLevels',
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
} as const satisfies Record<ClassLevel, string>;

/**
 * The level of a class as the kit's three-bar icon (F067), with the word of the viewer's language
 * as accessible name ("Niveau: Gevorderd") and tooltip. `compact`, for the rows of a list, is the
 * bars alone and nothing for *Alle niveaus*; the full form, for a page about one class, has the
 * word beside the bars. *Geen* (no level) draws nothing in either.
 */
export function ClassLevelIcon({
  level,
  compact = false,
}: {
  level: ClassLevel | null | undefined;
  compact?: boolean;
}) {
  const t = useTranslations('classLevel');
  if (!level) return null;
  const word = t(WORD[level]);
  return (
    <LevelIcon
      level={level}
      compact={compact}
      word={word}
      label={t('accessibleName', { level: word })}
    />
  );
}

/**
 * *Niveau*: the select of the class form and of *Les wijzigen*. *Geen* is the starting value
 * (`''`), then the four levels, the words from the catalog in the viewer's language.
 */
export function ClassLevelSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: ClassLevelChoice;
  onChange: (value: ClassLevelChoice) => void;
}) {
  const t = useTranslations('classLevel');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t('field')}</Label>
      <NativeSelect
        id={id}
        name="level"
        value={value}
        className="w-full"
        onChange={(event) => onChange(event.target.value as ClassLevelChoice)}
      >
        <NativeSelectOption value="">{t('none')}</NativeSelectOption>
        {CLASS_LEVELS.map((level) => (
          <NativeSelectOption key={level} value={level}>
            {t(WORD[level])}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
