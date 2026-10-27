import type {
  ActingAs,
  Place,
  SignedInAccount,
  TenantScope,
  WorkspaceScope,
} from '@fivvi/database';
import { createRoute, type RouteConfig } from '@hono/zod-openapi';
import type { Context, MiddlewareHandler, Next } from 'hono';
import type { ApiDependencies } from './dependencies.ts';
import {
  FORBIDDEN,
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
 * - `account`: any signed-in account, about itself and across its workspaces (`/v1/me…`). The
 *   request transaction's context holds the workspaces where the account has the relationship
 *   `workspaces` asks for (a team role, a client relationship, or either, the default): never an
 *   unscoped query (ADR-006).
 * - `workspace`: a signed-in account with one of the allowed team `roles` in the workspace of
 *   the path, or, with `client: 'own-records'`, a client of it, then only for their own records.
 */
export type Access =
  | { readonly type: 'public' }
  | { readonly type: 'account'; readonly workspaces?: 'team' | 'client' | 'any' }
  | {
      readonly type: 'workspace';
      readonly roles: readonly TeamRole[];
      readonly client: 'none' | 'own-records';
    };

/** The context of a route behind an `account` access: the scope holds the caller's workspaces. */
export interface AccessEnv {
  Variables: { dependencies: ApiDependencies; account: SignedInAccount; scope: TenantScope };
}

/** The context of a route behind a `workspace` access: the scope holds that one workspace. */
export interface WorkspaceEnv {
  Variables: { dependencies: ApiDependencies; account: SignedInAccount; scope: WorkspaceScope };
}

/** Puts the dependencies where the access middleware of every route can read them. */
export function provideDependencies(dependencies: ApiDependencies): MiddlewareHandler<AccessEnv> {
  return async (c, next) => {
    c.set('dependencies', dependencies);
    await next();
  };
}

/** Thrown inside the request transaction to roll it back; the answer is already set. */
class RollBack extends Error {}

/**
 * Whether a place may call the route, and as what. A team role the route lists runs as a team
 * member, whatever else the caller is (a trainer who is also a client of the workspace sees what
 * any trainer sees); otherwise a client relationship runs as a client when the route allows
 * clients, on their own records only.
 */
export function admission(
  access: Extract<Access, { type: 'workspace' }>,
  place: Place,
): ActingAs | undefined {
  if (place.teamRole && access.roles.includes(place.teamRole)) return 'team';
  if (access.client === 'own-records' && place.clientId) return 'client';
  return undefined;
}

/**
 * Runs the rest of the request (validation, handler) inside the transaction that `open` starts,
 * with the scope set on the context. A failed request (status 400 and up, or an error) rolls the
 * transaction back; any other commits with the request, so the context never outlives it.
 */
async function withinRequest<S>(
  c: Context<AccessEnv>,
  next: Next,
  open: (run: (scope: S) => Promise<void>) => Promise<unknown>,
): Promise<void> {
  try {
    await open(async (scope) => {
      c.set('scope', scope as unknown as TenantScope);
      await next();
      if (c.res.status >= 400) throw new RollBack();
    });
  } catch (error) {
    if (!(error instanceof RollBack)) throw error;
  }
}

function accessMiddleware(access: Access): MiddlewareHandler<AccessEnv> {
  return async (c, next) => {
    if (access.type === 'public') return next();
    const dependencies = c.get('dependencies');
    // Not built by createApp: fail closed with a 500 rather than let the route run unchecked.
    if (!dependencies) throw new Error('Route access needs the dependencies createApp provides.');
    const account = await dependencies.findSignedInAccount(c.req.raw.headers);
    if (!account) return c.json(NOT_SIGNED_IN, 401);
    c.set('account', account);
    const { tenantScopes } = dependencies;
    if (access.type === 'account') {
      return withinRequest<TenantScope>(c, next, (run) =>
        tenantScopes.inAccountScope(
          { accountId: account.id, workspaces: access.workspaces ?? 'any' },
          run,
        ),
      );
    }
    // The workspace of the path, as text: it isn't validated yet, and a value that is no
    // workspace gets the same 404 as one that doesn't exist.
    const workspaceId = c.req.param('workspaceId') ?? '';
    let refusal: Response | undefined;
    await withinRequest<WorkspaceScope>(c, next, async (run) => {
      const entry = await tenantScopes.inWorkspaceScope(
        { accountId: account.id, workspaceId, admit: (place) => admission(access, place) },
        run,
      );
      if (entry.status === 'no-place') refusal = c.json(NOT_FOUND, 404);
      if (entry.status === 'refused') refusal = c.json(FORBIDDEN, 403);
    });
    return refusal;
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
  if (access.type === 'workspace') {
    return { type: access.type, roles: [...access.roles], client: access.client };
  }
  if (access.type === 'account' && access.workspaces) {
    return { type: access.type, workspaces: access.workspaces };
  }
  return { type: access.type };
}

/**
 * `createRoute` with the route's access. Installs the access middleware ahead of the request
 * validators, writes `x-access` on the operation and documents the refusals the access can give
 * (`401`, `404`, `403`). A route can't declare its own response for a status that refusal owns: the
 * middleware would still send the refusal, so the contract would lie. It throws instead.
 */
export function defineRoute<R extends RouteConfig, A extends Access>(route: R, access: A) {
  if (access.type === 'workspace' && access.roles.length === 0 && access.client === 'none') {
    throw new Error(`${route.operationId ?? route.path}: no team role and no client may call it.`);
  }
  if (access.type === 'workspace' && !route.path.includes('{workspaceId}')) {
    throw new Error(
      `${route.operationId ?? route.path}: a workspace route names {workspaceId} in its path.`,
    );
  }
  const owned = Object.keys(refusalsOf(access)).filter((status) => status in route.responses);
  if (owned.length > 0) {
    throw new Error(
      `${route.operationId ?? route.path}: the ${access.type} access answers ${owned.join(', ')} itself; a route can't declare its own response for it.`,
    );
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
