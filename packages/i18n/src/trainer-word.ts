/**
 * The word a workspace uses for the people who teach (F068, spec #588): one of four choices,
 * stored on the workspace. It is only a label; the role stays Trainer in code, routes, role values
 * and the permission matrix. The values are Dutch identifiers; each language words them itself
 * (`trainerWord.*` in the catalogs).
 */
export const TRAINER_WORDS = ['trainer', 'instructeur', 'docent', 'coach'] as const;
export type TrainerWord = (typeof TRAINER_WORDS)[number];

/** What every workspace starts with: creating one doesn't ask. */
export const DEFAULT_TRAINER_WORD: TrainerWord = 'trainer';

export function isTrainerWord(value: unknown): value is TrainerWord {
  return typeof value === 'string' && (TRAINER_WORDS as readonly string[]).includes(value);
}
