import type { SignedInAccount } from '@fivvi/database';
import { locales } from '@fivvi/i18n';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { ApiDependencies } from '../dependencies.ts';
import { internalServerErrorResponse } from '../errors.ts';

/** The context of a route behind `resolveSignedInAccount`; no other route has an `account`. */
export interface SignedInEnv {
  Variables: { account: SignedInAccount };
}

export const MeResponseSchema = z
  .object({
    id: z.uuid().openapi({ description: 'The account ID.' }),
    email: z.email().openapi({ description: 'The address the account signs in with.' }),
    preferredLocale: z.enum(locales).nullable().openapi({
      description: 'The language stored on the account; null until one is stored.',
    }),
  })
  .openapi('MeResponse', { description: 'The signed-in account.' });

const UnauthorizedSchema = z.object({ code: z.enum(['unauthorized']) }).openapi('Unauthorized', {
  description: 'The request has no valid sign-in session. Contains no user-facing text.',
});

const UNAUTHORIZED = { code: 'unauthorized' } as const;

/**
 * Resolves the signed-in account from the sign-in session cookie and answers `401` when there
 * is none. A route behind it reads the account from `c.get('account')`.
 */
export function resolveSignedInAccount(
  dependencies: ApiDependencies,
): MiddlewareHandler<SignedInEnv> {
  return async (c, next) => {
    const account = await dependencies.findSignedInAccount(c.req.raw.headers);
    if (!account) return c.json(UNAUTHORIZED, 401);
    c.set('account', account);
    await next();
    return undefined;
  };
}

const meRoute = createRoute({
  method: 'get',
  path: '/v1/me',
  operationId: 'getMe',
  tags: ['me'],
  summary: 'The signed-in account',
  description:
    'The account of the sign-in session in the request. The web sends the sign-in session ' +
    'cookie; there is no other way to sign in yet.',
  responses: {
    200: {
      description: 'The account.',
      content: { 'application/json': { schema: MeResponseSchema } },
    },
    401: {
      description: 'No valid sign-in session.',
      content: { 'application/json': { schema: UnauthorizedSchema } },
    },
    500: internalServerErrorResponse,
  },
});

export function registerMe(app: OpenAPIHono, dependencies: ApiDependencies) {
  // Its own router, so `account` is typed (and set) only on the routes behind the middleware.
  // /me has no input to validate, so it needs no `defaultHook`; a route with input added here
  // must pass the one `createApp` sets, so its validation errors stay the same.
  const me = new OpenAPIHono<SignedInEnv>();
  me.use(meRoute.getRoutingPath(), resolveSignedInAccount(dependencies));
  me.openapi(meRoute, (c) => {
    const { id, email, preferredLocale } = c.get('account');
    return c.json({ id, email, preferredLocale }, 200);
  });
  app.route('/', me);
}
