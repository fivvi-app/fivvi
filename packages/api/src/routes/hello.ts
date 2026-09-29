import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { locales, type MessageKey, parseAcceptLanguage, resolveLocale } from '@trainer-hub/i18n';
import { ValidationErrorSchema } from '../errors.ts';

// Stub for the M1 walking skeleton. The G1 slice reads the key from `system_greetings` (E004).
export const HELLO_GREETING_KEY = 'hello.title' satisfies MessageKey;

export const LocaleSchema = z.enum(locales).openapi('Locale', {
  description: 'Catalog locale from packages/i18n. Dutch (nl-NL) is the default.',
});

export const HelloResponseSchema = z
  .object({
    greetingKey: z.string().openapi({
      description: 'i18n message key that the client renders in `locale`.',
      example: HELLO_GREETING_KEY,
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
    'Without `locale`, the locale follows the Accept-Language header and falls back to nl-NL.',
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
  },
});

export function registerHello(app: OpenAPIHono) {
  app.openapi(helloRoute, (c) => {
    const locale = resolveLocale({
      explicit: c.req.valid('query').locale,
      requested: parseAcceptLanguage(c.req.header('accept-language')),
    });
    return c.json({ greetingKey: HELLO_GREETING_KEY, locale }, 200);
  });
}
