/**
 * The word a workspace uses for the people who teach (F068, spec #588): one of four choices,
 * stored on the workspace. It is only a label; the role stays Trainer in code, routes, role values
 * and the permission matrix. The values are Dutch identifiers; each language will word them itself
 * (`trainerWord.*` in the catalogs, ticket #741). `packages/database` writes the same list for
 * its enum, because the runtime image ships it without this package; its `ops-image.test.ts`
 * compares the two.
 */
export const TRAINER_WORDS = ['trainer', 'instructeur', 'docent', 'coach'] as const;
export type TrainerWord = (typeof TRAINER_WORDS)[number];
