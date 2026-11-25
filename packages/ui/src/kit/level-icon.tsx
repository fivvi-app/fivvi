import { cn } from 'cn';
import type { ComponentProps } from 'react';

/** The four levels of a class (F067); `null` or `undefined` is *Geen*: nothing is drawn. */
export type LevelIconLevel = 'all_levels' | 'beginner' | 'intermediate' | 'advanced';

/** How many of the three bars each level fills; *Alle niveaus* fills all three, at the same weight. */
const FILLED: Record<LevelIconLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  all_levels: 3,
};

/** The bars rise: 5, 8 and 11 px. */
const HEIGHTS = ['h-[5px]', 'h-[8px]', 'h-[11px]'] as const;

/**
 * The level of a class as three bars of rising height (F067), filled by level, in the secondary
 * text colour (3:1 on the page and on the card, a pair of the token checks). The word is its
 * accessible name (`label`, "Niveau: Gevorderd") and its tooltip (`title`); colour alone never says
 * the level. Two forms: `compact`, for the rows of a list, is the bars only and draws nothing for
 * *Alle niveaus*; the full form, for a page about one class, has the `word` beside the bars. *Geen*
 * (`null` or `undefined`) draws nothing in either form, so no empty line is left. `label` and
 * `word` come from `packages/i18n` (`classLevel.*`).
 */
export function LevelIcon({
  level,
  label,
  word,
  compact = false,
  className,
  ...props
}: Omit<ComponentProps<'span'>, 'children' | 'title'> & {
  level: LevelIconLevel | null | undefined;
  /** The accessible name: "Niveau: Gevorderd". */
  label: string;
  /** The level's word: the tooltip, and the text beside the bars in the full form. */
  word: string;
  compact?: boolean;
}) {
  if (!level || (compact && level === 'all_levels')) return null;
  const filled = FILLED[level];
  return (
    <span
      {...props}
      role="img"
      aria-label={label}
      title={word}
      data-slot="level-icon"
      data-level={level}
      className={cn('inline-flex items-center gap-1.5 text-muted-foreground', className)}
    >
      <span aria-hidden="true" className="inline-flex items-end gap-0.5">
        {HEIGHTS.map((height, index) => (
          <i
            key={height}
            className={cn(
              'w-[3px] rounded-[1px] bg-current',
              height,
              index >= filled && 'opacity-30',
            )}
          />
        ))}
      </span>
      {compact ? null : <span>{word}</span>}
    </span>
  );
}
