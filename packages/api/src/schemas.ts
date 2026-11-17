import { locales, TRAINER_WORDS } from '@fivvi/i18n';
import { z } from '@hono/zod-openapi';

/** Schemas more than one route shares. */
export const LocaleSchema = z.enum(locales).openapi('Locale', {
  description: 'Catalog locale from packages/i18n: Dutch (nl-NL) or English (en).',
});

/**
 * The word a workspace uses for its trainers (F068): a label only, the role stays `trainer`.
 * Used bare on the properties, like `LocaleSchema` (#223): a description on the property would
 * make the Swift generator emit a payload struct.
 */
export const TrainerWordSchema = z.enum(TRAINER_WORDS).openapi('TrainerWord', {
  description:
    'The word the product uses for the people who teach in the workspace: `trainer`, ' +
    '`instructeur`, `docent` or `coach`. It is only a label shown to the team and the clients, in ' +
    'their own language; the role stays `trainer` in the API and nobody’s rights depend on it. ' +
    'Every workspace starts on `trainer`.',
});
