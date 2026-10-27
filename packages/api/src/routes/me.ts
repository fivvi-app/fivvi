import { locales } from '@fivvi/i18n';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { type AccessEnv, defineRoute } from '../access.ts';
import { internalServerErrorResponse } from '../errors.ts';

export const MeResponseSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The account ID.' }),
    email: z.email().openapi({ description: 'The address the account signs in with.' }),
    preferredLocale: z.enum(locales).nullable().openapi({
      description: 'The language stored on the account; null until one is stored.',
    }),
  })
  .openapi('MeResponse', { description: 'The signed-in account.' });

const meRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/me',
    operationId: 'getMe',
    tags: ['me'],
    summary: 'The signed-in account',
    description:
      'The account of the sign-in session in the request. The web sends the sign-in session ' +
      'cookie, the apps’ `Authorization: Bearer <token>` (the token of `POST /v1/sign-in/token`). ' +
      'A request with an `Authorization` header is judged by that token alone, never by a cookie.',
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    responses: {
      200: {
        description: 'The account.',
        content: { 'application/json': { schema: MeResponseSchema } },
      },
      500: internalServerErrorResponse,
    },
  },
  { type: 'account' },
);

export function registerMe(app: OpenAPIHono) {
  // Its own router, so `account` is typed on the routes behind the access middleware.
  // /me has no input to validate, so it needs no `defaultHook`; a route with input added here
  // must pass the one `createApp` sets, so its validation errors stay the same.
  const me = new OpenAPIHono<AccessEnv>();
  me.openapi(meRoute, (c) => {
    const { id, email, preferredLocale } = c.get('account');
    return c.json({ id, email, preferredLocale }, 200);
  });
  app.route('/', me);
}
