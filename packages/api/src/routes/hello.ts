import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { HELLO_GREETING } from '@trainer-hub/database';
import {
  locales,
  type MessageKey,
  parseAcceptLanguage,
  resolveInterfaceLanguage,
} from '@trainer-hub/i18n';
import type { ApiDependencies } from '../dependencies.ts';
import { internalServerErrorResponse, ValidationErrorSchema } from '../errors.ts';

export const LocaleSchema = z.enum(locales).openapi('Locale', {
  description: 'Catalog locale from packages/i18n: Dutch (nl-NL) or English (en).',
});

export const HelloResponseSchema = z
  .object({
    greetingKey: z.string().openapi({
      description: 'i18n message key that the client renders in `locale`.',
      // Also fails the type check when the migrated key is not in the catalog.
      example: HELLO_GREETING.i18nKey satisfies MessageKey,
    }),
    locale: LocaleSchema,
  })
  .openapi('HelloResponse');

const helloRoute = createRoute({
  method: 'get',
  path: '/v1/hello',
  operationId: 'getHello',
  tags: ['hello'],
  summary: 'Greeting for the walking skeleton',
  description:
    'The `hello` greeting from the database. Without `locale`, the locale is the first supported language in ' +
    'the Accept-Language header, otherwise en.',
  request: {
    query: z.object({ locale: LocaleSchema.optional() }),
  },
  responses: {
    200: {
      description: 'The greeting key and the locale to render it in.',
      content: { 'application/json': { schema: HelloResponseSchema } },
    },
    400: {
      description: 'Invalid query parameters.',
      content: { 'application/json': { schema: ValidationErrorSchema } },
    },
    500: internalServerErrorResponse,
  },
});

export function registerHello(app: OpenAPIHono, dependencies: ApiDependencies) {
  app.openapi(helloRoute, async (c) => {
    const locale = resolveInterfaceLanguage({
      explicit: c.req.valid('query').locale,
      requested: parseAcceptLanguage(c.req.header('accept-language')),
    });
    const greeting = await dependencies.findSystemGreeting(HELLO_GREETING.slug);
    // System data every environment's migrations insert: a missing row is a server fault, which
    // createApp's error handler reports and answers with the documented 500.
    if (!greeting) throw new Error(`System greeting "${HELLO_GREETING.slug}" is missing.`);
    return c.json({ greetingKey: greeting.i18nKey, locale }, 200);
  });
}
