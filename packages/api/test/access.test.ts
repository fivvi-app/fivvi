import type {
  Place,
  SignedInAccount,
  TenantScope,
  TenantScopes,
  WorkspaceScope,
} from '@fivvi/database';
import { type OpenAPIHono, z } from '@hono/zod-openapi';
import { describe, expect, it, vi } from 'vitest';
import { admission } from '../src/access.ts';
import {
  type ApiDependencies,
  buildOpenApiDocument,
  createApp,
  defineRoute,
  NO_DEPENDENCIES,
} from '../src/index.ts';

const ACCOUNT: SignedInAccount = {
  id: '0197c0de-0000-7000-8000-000000000001',
  email: 'owner@example.com',
  preferredLocale: null,
};

const BodySchema = z.object({ name: z.string().min(1) }).openapi('ProbeBody');

const probeRoute = (path: string, operationId: string) => ({
  method: 'post' as const,
  path,
  operationId,
  request: {
    query: z.object({ page: z.coerce.number().int().optional() }),
    body: { required: true, content: { 'application/json': { schema: BodySchema } } },
  },
  responses: { 200: { description: 'It ran.' } },
});

/** createApp plus one probe route per access, each answering 200 when it runs. */
function probeApp(dependencies: ApiDependencies): OpenAPIHono {
  const app = createApp(dependencies);
  const run = (c: { body: (body: null, status: 200) => Response }) => c.body(null, 200);
  app.openapi(defineRoute(probeRoute('/v1/probe/public', 'probePublic'), { type: 'public' }), run);
  app.openapi(
    defineRoute(probeRoute('/v1/probe/account', 'probeAccount'), { type: 'account' }),
    run,
  );
  app.openapi(
    defineRoute(probeRoute('/v1/workspaces/{workspaceId}/probe', 'probeWorkspace'), {
      type: 'workspace',
      roles: ['owner'],
      client: 'none',
    }),
    run,
  );
  return app;
}

/**
 * Tenant scopes without a database, for the order of checks: the account has `place` in every
 * workspace (none: no place). `ended` records how each request transaction ended.
 */
function fakeTenantScopes(place?: Place) {
  const ended: ('committed' | 'rolled back')[] = [];
  const settle = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      const value = await run();
      ended.push('committed');
      return value;
    } catch (error) {
      ended.push('rolled back');
      throw error;
    }
  };
  const tenantScopes: TenantScopes = {
    inAccountScope: (_input, run) => settle(() => run({ context: {} } as unknown as TenantScope)),
    inWorkspaceScope: async (input, run) => {
      if (!place?.teamRole && !place?.clientId) return { status: 'no-place' };
      const actingAs = input.admit(place);
      if (!actingAs) return { status: 'refused' };
      return {
        status: 'entered',
        value: await settle(() => run({ context: {}, actingAs } as unknown as WorkspaceScope)),
      };
    },
  };
  return { tenantScopes, ended };
}

const signedIn: ApiDependencies = {
  ...NO_DEPENDENCIES,
  findSignedInAccount: () => Promise.resolve(ACCOUNT),
  tenantScopes: fakeTenantScopes().tenantScopes,
};

const call = (app: OpenAPIHono, path: string, body: string) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

describe('E011 route access', () => {
  describe('AC10: the access check runs before request validation', () => {
    it.each([
      ['an account route', '/v1/probe/account'],
      ['a workspace route', '/v1/workspaces/0197c0de-0000-7000-8000-0000000000a1/probe'],
    ])('answers an anonymous caller of %s 401, whatever the body or query', async (_name, path) => {
      const app = probeApp(NO_DEPENDENCIES);

      for (const [query, body] of [
        ['', '{"name":""}'],
        ['?page=abc', '{"name":"x"}'],
        ['', 'not json'],
        ['', ''],
      ] as const) {
        const response = await call(app, `${path}${query}`, body);

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ code: 'not_signed_in' });
      }
    });

    it('lets a signed-in account reach validation and the handler on an account route', async () => {
      const app = probeApp(signedIn);

      const invalid = await call(app, '/v1/probe/account', '{"name":""}');
      const valid = await call(app, '/v1/probe/account', '{"name":"x"}');

      expect(invalid.status).toBe(400);
      expect((await invalid.json()) as { code: string }).toMatchObject({
        code: 'validation_failed',
      });
      expect(valid.status).toBe(200);
    });

    it('does not turn a public route into one that checks the sign-in', async () => {
      const app = probeApp(NO_DEPENDENCIES);

      expect((await call(app, '/v1/probe/public', '{"name":"x"}')).status).toBe(200);
      expect((await call(app, '/v1/probe/public', '{"name":""}')).status).toBe(400);
    });
  });

  describe('the order of checks on a workspace route (owner only)', () => {
    const path = '/v1/workspaces/0197c0de-0000-7000-8000-0000000000a1/probe';
    const appFor = (place?: Place) =>
      probeApp({
        ...NO_DEPENDENCIES,
        findSignedInAccount: () => Promise.resolve(ACCOUNT),
        tenantScopes: fakeTenantScopes(place).tenantScopes,
      });

    it('AC8: no place answers 404, whatever the body', async () => {
      for (const body of ['{"name":""}', 'not json', '{"name":"x"}']) {
        const response = await call(appFor(undefined), path, body);

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: 'not_found' });
      }
    });

    it.each([
      ['a trainer', { teamRole: 'trainer' as const }],
      ['a client', { clientId: '0197c0de-0000-7000-8000-0000000000c1' }],
    ])('AC10: %s on an owner-only route gets 403, whatever the body', async (_who, place) => {
      for (const body of ['{"name":""}', 'not json', '{"name":"x"}']) {
        const response = await call(appFor(place), path, body);

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ code: 'forbidden' });
      }
    });

    it('runs validation and then the handler only for an owner', async () => {
      const owner = appFor({ teamRole: 'owner' });

      expect((await call(owner, path, '{"name":""}')).status).toBe(400);
      expect((await call(owner, path, '{"name":"x"}')).status).toBe(200);
    });
  });

  describe('the request transaction ends with the request', () => {
    const path = '/v1/workspaces/0197c0de-0000-7000-8000-0000000000a1/probe';

    it('commits on success and rolls back on a failed request or an error', async () => {
      const { tenantScopes, ended } = fakeTenantScopes({ teamRole: 'owner' });
      const app = probeApp({ ...signedIn, tenantScopes });

      await call(app, path, '{"name":"x"}'); // 200
      await call(app, path, '{"name":""}'); // 400
      await call(app, '/v1/probe/account', '{"name":"x"}'); // 200
      await call(app, '/v1/probe/account', '{"name":""}'); // 400

      expect(ended).toEqual(['committed', 'rolled back', 'committed', 'rolled back']);
    });

    it('rolls back when the handler throws', async () => {
      const { tenantScopes, ended } = fakeTenantScopes({ teamRole: 'owner' });
      const app = probeApp({ ...signedIn, tenantScopes });
      app.openapi(
        defineRoute(
          {
            method: 'get',
            path: '/v1/workspaces/{workspaceId}/boom',
            operationId: 'boom',
            responses: { 200: { description: 'It ran.' } },
          },
          { type: 'workspace', roles: ['owner'], client: 'none' },
        ),
        () => {
          throw new Error('boom');
        },
      );
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await app.request(
        '/v1/workspaces/0197c0de-0000-7000-8000-0000000000a1/boom',
      );

      expect(response.status).toBe(500);
      expect(ended).toEqual(['rolled back']);
      log.mockRestore();
    });
  });

  describe('admission: who runs as what', () => {
    const route = { type: 'workspace', roles: ['trainer'], client: 'own-records' } as const;

    it('a listed team role runs as a team member, even for a client of the same workspace', () => {
      expect(admission(route, { teamRole: 'trainer', clientId: 'c1' })).toBe('team');
    });

    it('a client runs as a client only where the route allows clients', () => {
      expect(admission(route, { clientId: 'c1' })).toBe('client');
      expect(admission({ ...route, client: 'none' }, { clientId: 'c1' })).toBeUndefined();
    });

    it('a team role the route does not list is not admitted, but a client side still is', () => {
      expect(admission(route, { teamRole: 'owner' })).toBeUndefined();
      expect(admission(route, { teamRole: 'owner', clientId: 'c1' })).toBe('client');
    });
  });

  it('refuses a workspace route without {workspaceId} in its path', () => {
    expect(() =>
      defineRoute(probeRoute('/v1/elsewhere', 'elsewhere'), {
        type: 'workspace',
        roles: ['owner'],
        client: 'none',
      }),
    ).toThrow(/workspaceId/);
  });

  it('fails closed (500) when the app was not built by createApp', async () => {
    const { OpenAPIHono } = await import('@hono/zod-openapi');
    const app = new OpenAPIHono();
    app.openapi(
      defineRoute(probeRoute('/v1/probe/account', 'probeAccount'), { type: 'account' }),
      (c) => c.body(null, 200),
    );

    const response = await call(app, '/v1/probe/account', '{"name":"x"}');

    expect(response.status).toBe(500);
  });

  it('refuses a workspace route that nobody can call', () => {
    expect(() =>
      defineRoute(probeRoute('/v1/workspaces/{workspaceId}/none', 'none'), {
        type: 'workspace',
        roles: [],
        client: 'none',
      }),
    ).toThrow(/none/);
  });

  describe('a route may not declare a response the access refusal owns', () => {
    const withResponses = (responses: Record<number, { description: string }>) => ({
      ...probeRoute('/v1/workspaces/{workspaceId}/own', 'own'),
      responses: { 200: { description: 'It ran.' }, ...responses },
    });
    const own = { description: 'Its own.' };

    it.each([401, 403, 404])('refuses a workspace route that declares its own %i', (status) => {
      expect(() =>
        defineRoute(withResponses({ [status]: own }), {
          type: 'workspace',
          roles: ['owner'],
          client: 'none',
        }),
      ).toThrow(new RegExp(`own.*${status}`));
    });

    it('refuses an account route that declares its own 401', () => {
      expect(() => defineRoute(withResponses({ 401: own }), { type: 'account' })).toThrow(
        /own.*401/,
      );
    });

    it('lets an account route declare 403 and 404, and a public route declare 401', () => {
      expect(() =>
        defineRoute(withResponses({ 403: own, 404: own }), { type: 'account' }),
      ).not.toThrow();
      expect(() => defineRoute(withResponses({ 401: own }), { type: 'public' })).not.toThrow();
    });
  });

  describe('x-access in the document', () => {
    const paths = buildOpenApiDocument(probeApp(NO_DEPENDENCIES)).paths ?? {};
    const operation = (path: string, method: 'get' | 'post' = 'get') =>
      paths[path]?.[method] as Record<string, unknown>;

    it('is written from the declaration', () => {
      expect(operation('/v1/probe/public', 'post')['x-access']).toEqual({ type: 'public' });
      expect(operation('/v1/probe/account', 'post')['x-access']).toEqual({ type: 'account' });
      expect(operation('/v1/workspaces/{workspaceId}/probe', 'post')['x-access']).toEqual({
        type: 'workspace',
        roles: ['owner'],
        client: 'none',
      });
    });

    it('documents the refusals a route can give as machine-readable codes', () => {
      const responses = (path: string) =>
        Object.keys((operation(path, 'post').responses ?? {}) as object).sort();

      expect(responses('/v1/probe/public')).toEqual(['200']);
      expect(responses('/v1/probe/account')).toEqual(['200', '401']);
      expect(responses('/v1/workspaces/{workspaceId}/probe')).toEqual(['200', '401', '403', '404']);
    });

    it('declares the refusal bodies as schemas without text', () => {
      const schemas = buildOpenApiDocument().components?.schemas as Record<string, unknown>;

      expect(schemas.NotSignedIn).toMatchObject({
        properties: { code: { enum: ['not_signed_in'] } },
      });
      expect(schemas.NotFound).toMatchObject({ properties: { code: { enum: ['not_found'] } } });
      expect(schemas.Forbidden).toMatchObject({ properties: { code: { enum: ['forbidden'] } } });
    });
  });

  it('declares access on every route the API ships', () => {
    const access = Object.entries(buildOpenApiDocument().paths ?? {}).flatMap(([path, item]) =>
      Object.entries(item ?? {}).map(([method, operation]) => [
        `${method} ${path}`,
        (operation as { 'x-access'?: { type: string } })['x-access']?.type,
      ]),
    );

    expect(Object.fromEntries(access)).toEqual({
      'get /v1/health': 'public',
      'get /v1/hello': 'public',
      'get /v1/me': 'account',
      'post /v1/sign-in/request': 'public',
      'post /v1/sign-in/token': 'public',
      'post /v1/sign-out': 'public',
    });
  });
});
