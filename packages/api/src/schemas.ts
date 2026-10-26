import { locales } from '@fivvi/i18n';
import { z } from '@hono/zod-openapi';

/** Schemas more than one route shares. */
export const LocaleSchema = z.enum(locales).openapi('Locale', {
  description: 'Catalog locale from packages/i18n: Dutch (nl-NL) or English (en).',
});
