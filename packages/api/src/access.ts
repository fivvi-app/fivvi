import type { SignedInAccount } from '@fivvi/database';
import { createRoute, type RouteConfig } from '@hono/zod-openapi';
import type { Context, MiddlewareHandler } from 'hono';
import type { ApiDependencies } from './dependencies.ts';
import {
  ForbiddenSchema,
  NOT_FOUND,
  NOT_SIGNED_IN,
  NotFoundSchema,
  NotSignedInSchema,
} from './errors.ts';

// How a route says who may call it (E011, spec #145). Every route is defined through
// `defineRoute` with its access. The one declaration installs the access middleware and writes
// the `x-access` extension on the operation in openapi.json, so enforcement and contract can't
// drift and a reviewer sees the access in the contract diff.
//
// The order of checks, which the middleware runs ahead of zod-openapi's request validation, so a
// refused caller never learns a route's shape from a validation error:
//   anonymous -> 401 not_signed_in; no place in the workspace -> 404 not_found; a place without
//   the route's access -> 403 forbidden; only then validation (400) and the handler.

/** The team roles of a workspace that exist today (AC3); Admin comes later. */
export type TeamRole = 'owner' | 'trainer';

/**
 * Who may call a route:
 * - `public`: anyone, signed in or not. Each one is on the public-routes allow-list of the
 *   coverage check, with its reason.
 * - `account`: any signed-in account, about itself and across its workspaces (`/v1/me…`).
 * - `workspace`: a signed-in account with one of the allowed team `roles` in the workspace of
 *   the path, or, with `client: 'own-records'`, a client of it, then only for their own records.
 */
export type Access =
  | { readonly type: 'public' }
  | { readonly type: 'account' }
  | {
      readonly type: 'workspace';
      readonly roles: readonly TeamRole[];
      readonly client: 'none' | 'own-records';
    };

/** The context of a route behind an `account` or `workspace` access. */
export interface AccessEnv {
  Variables: { dependencies: ApiDependencies; account: SignedInAccount };
}

/** Puts the dependencies where the access middleware of every route can read them. */
export function provideDependencies(dependencies: ApiDependencies): MiddlewareHandler {
  return async (c, next) => {
    (c as unknown as Context<AccessEnv>).set('dependencies', dependencies);
    await next();
  };
}

function accessMiddleware(access: Access): MiddlewareHandler {
  return async (c, next) => {
    if (access.type === 'public') return next();
    const context = c as unknown as Context<AccessEnv>;
    const dependencies = context.get('dependencies');
    // Not built by createApp: fail closed with a 500 rather than let the route run unchecked.
    if (!dependencies) throw new Error('Route access needs the dependencies createApp provides.');
    const account = await dependencies.findSignedInAccount(c.req.raw.headers);
    if (!account) return c.json(NOT_SIGNED_IN, 401);
    context.set('account', account);
    if (access.type === 'workspace') {
      // The workspace context (the caller's place in the workspace, 404 or 403 from it) is #254.
      // Until it lands no caller has a place anywhere, so a workspace route fails closed.
      return c.json(NOT_FOUND, 404);
    }
    return next();
  };
}

const refusalResponses = {
  401: {
    description: 'Nobody is signed in: no valid sign-in session or bearer token.',
    content: { 'application/json': { schema: NotSignedInSchema } },
  },
  403: {
    description: 'The caller has a place in the workspace that this route’s access doesn’t allow.',
    content: { 'application/json': { schema: ForbiddenSchema } },
  },
  404: {
    description:
      'The caller has no place in the workspace, or the record is out of the caller’s reach.',
    content: { 'application/json': { schema: NotFoundSchema } },
  },
} as const;

type RefusalResponses<A extends Access> = A extends { type: 'public' }
  ? unknown
  : A extends { type: 'account' }
    ? Pick<typeof refusalResponses, 401>
    : typeof refusalResponses;

function refusalsOf(access: Access) {
  switch (access.type) {
    case 'public':
      return {};
    case 'account':
      return { 401: refusalResponses[401] };
    case 'workspace':
      return refusalResponses;
  }
}

/** What `x-access` holds in openapi.json: the declaration, nothing derived. */
function describeAccess(access: Access) {
  return access.type === 'workspace'
    ? { type: access.type, roles: [...access.roles], client: access.client }
    : { type: access.type };
}

/**
 * `createRoute` with the route's access. Installs the access middleware ahead of the request
 * validators, writes `x-access` on the operation and documents the refusals the access can give
 * (`401`, `404`, `403`) unless the route's own `responses` already say otherwise.
 */
export function defineRoute<R extends RouteConfig, A extends Access>(route: R, access: A) {
  if (access.type === 'workspace' && access.roles.length === 0 && access.client === 'none') {
    throw new Error(`${route.operationId ?? route.path}: no team role and no client may call it.`);
  }
  const middleware = [route.middleware ?? []].flat();
  const defined = createRoute({
    ...route,
    responses: { ...refusalsOf(access), ...route.responses },
    middleware: [accessMiddleware(access), ...middleware],
    'x-access': describeAccess(access),
  });
  return defined as Omit<typeof defined, 'responses'> & {
    responses: R['responses'] & RefusalResponses<A>;
  };
}
