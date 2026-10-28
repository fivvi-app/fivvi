import {
  createClient,
  findClient,
  listClients,
  listMyWorkspaces,
  type TenantScope,
} from '@fivvi/database';
import { readTenantContext } from '@fivvi/database/testing';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { type AccessEnv, defineRoute, type WorkspaceEnv } from '../../src/access.ts';
import { NOT_FOUND, toValidationError } from '../../src/errors.ts';

// Probe routes for the access tests (E011, #254), registered only in the test app: no product
// workspace route exists yet. One per access kind: Owner only, the team, and a client's own
// records. They read and write only through the repositories, like a product route would.

const Body = z.looseObject({}).openapi('ProbeResponse');
const ok = { 200: { description: 'It ran.', content: { 'application/json': { schema: Body } } } };

const hook = (
  result: { success: boolean; error?: z.ZodError },
  c: { json: (body: unknown, status: 400) => Response },
) => (result.success || !result.error ? undefined : c.json(toValidationError(result.error), 400));

const params = z.object({ workspaceId: z.uuid(), clientId: z.uuid() });
const workspace = (base: string, operationId: string) => ({
  method: 'get' as const,
  path: `/v1/workspaces/{workspaceId}${base}`,
  operationId,
  responses: ok,
});

const ownerOnly = { type: 'workspace', roles: ['owner'], client: 'none' } as const;
const team = { type: 'workspace', roles: ['owner', 'trainer'], client: 'none' } as const;
const ownRecords = { type: 'workspace', roles: [], client: 'own-records' } as const;

/** What a handler can tell about its own request: the scope, and what Postgres holds for it. */
async function describeScope(scope: TenantScope) {
  return { context: scope.context, stored: await readTenantContext(scope) };
}

export function registerProbeRoutes(app: OpenAPIHono): void {
  const workspaces = new OpenAPIHono<WorkspaceEnv>({ defaultHook: hook as never });

  workspaces.openapi(defineRoute(workspace('/probe/owner', 'probeOwner'), ownerOnly), async (c) =>
    c.json(await describeScope(c.get('scope')), 200),
  );

  workspaces.openapi(defineRoute(workspace('/probe/team', 'probeTeam'), team), async (c) =>
    c.json(await describeScope(c.get('scope')), 200),
  );

  workspaces.openapi(
    defineRoute(workspace('/probe/clients', 'probeListClients'), team),
    async (c) => c.json({ clients: await listClients(c.get('scope')) }, 200),
  );

  workspaces.openapi(
    defineRoute(
      {
        ...workspace('/probe/clients/{clientId}', 'probeFindClient'),
        request: { params },
      },
      team,
    ),
    async (c) => {
      const client = await findClient(c.get('scope'), c.req.valid('param').clientId);
      return client ? c.json({ client }, 200) : c.json(NOT_FOUND, 404);
    },
  );

  workspaces.openapi(
    defineRoute({ ...workspace('/probe/clients', 'probeCreateClient'), method: 'post' }, team),
    async (c) => c.json({ client: await createClient(c.get('scope'), {}) }, 200),
  );

  // A route with a required body and a typed query: validation must run after the access.
  workspaces.openapi(
    defineRoute(
      {
        ...workspace('/probe/validated', 'probeValidated'),
        method: 'put',
        request: {
          query: z.object({ page: z.string().regex(/^\d+$/) }),
          body: {
            required: true,
            content: { 'application/json': { schema: z.object({ name: z.string().min(1) }) } },
          },
        },
      },
      team,
    ),
    (c) => c.json({ page: c.req.valid('query').page, name: c.req.valid('json').name }, 200),
  );

  workspaces.openapi(defineRoute(workspace('/probe/own', 'probeOwn'), ownRecords), async (c) =>
    c.json(await describeScope(c.get('scope')), 200),
  );

  workspaces.openapi(
    defineRoute(workspace('/probe/own/clients', 'probeOwnListClients'), ownRecords),
    async (c) => c.json({ clients: await listClients(c.get('scope')) }, 200),
  );

  workspaces.openapi(
    defineRoute(
      {
        ...workspace('/probe/own/clients/{clientId}', 'probeOwnFindClient'),
        request: { params },
      },
      ownRecords,
    ),
    async (c) => {
      const client = await findClient(c.get('scope'), c.req.valid('param').clientId);
      return client ? c.json({ client }, 200) : c.json(NOT_FOUND, 404);
    },
  );
  app.route('/', workspaces);

  // Account routes: what the caller's own context holds.
  const accounts = new OpenAPIHono<AccessEnv>({ defaultHook: hook as never });
  const account = (route: string, operationId: string) => ({
    method: 'get' as const,
    path: route,
    operationId,
    responses: ok,
  });
  const places = async (scope: TenantScope) => ({
    ...(await describeScope(scope)),
    places: await listMyWorkspaces(scope),
  });
  accounts.openapi(
    defineRoute(account('/v1/probe/places', 'probePlaces'), { type: 'account' }),
    async (c) => c.json(await places(c.get('scope')), 200),
  );
  accounts.openapi(
    defineRoute(account('/v1/probe/team-places', 'probeTeamPlaces'), {
      type: 'account',
      workspaces: 'team',
    }),
    async (c) => c.json(await places(c.get('scope')), 200),
  );
  app.route('/', accounts);
}

/**
 * Writes, then answers 404: a failed request must not keep the write. Not one of the probe
 * routes of the isolation suite: its answer is not the one its access derives, so only the test
 * of the rollback registers it.
 */
export function registerRollbackProbe(app: OpenAPIHono): void {
  const workspaces = new OpenAPIHono<WorkspaceEnv>({ defaultHook: hook as never });
  workspaces.openapi(
    defineRoute(
      { ...workspace('/probe/clients-then-not-found', 'probeCreateThenNotFound'), method: 'post' },
      team,
    ),
    async (c) => {
      await createClient(c.get('scope'), {});
      return c.json(NOT_FOUND, 404);
    },
  );
  app.route('/', workspaces);
}
