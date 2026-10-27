import {
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type SignedInAccount,
  type TenantContext,
  type TenantScopes,
} from '@fivvi/database';
import {
  addClient,
  addTeamRole,
  createAccount,
  createWorkspace,
  readTenantContext,
  type StoredContext,
} from '@fivvi/database/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createApp, NO_DEPENDENCIES } from '../../src/index.ts';
import { registerProbeRoutes } from './probe-routes.ts';

// The setup the isolation tests share (E011): a cloned database, the API as the app role (RLS
// applies), the data seeded through the privileged connection, and a test app with the probe
// routes. A request names who it is with the `x-test-account` header, the way the sign-in
// session does in production.

export interface Observed {
  kind: 'account' | 'workspace';
  context: TenantContext;
  stored: StoredContext;
}

export interface World {
  database: TestDatabase;
  /** The privileged connection: seeds and reads back, RLS does not apply. */
  admin: DatabaseClient;
  /** The connection the API runs on: the app role, RLS applies. */
  app: DatabaseClient;
  /** Every tenant scope the API opened, in order, with the context Postgres held for it. */
  observed: Observed[];
  api: OpenAPIHono;
  /** Calls the API as `account` (anonymous when undefined). */
  request(
    account: { id: string } | undefined,
    path: string,
    init?: { method?: string; body?: unknown; query?: string },
  ): Promise<Response>;
  close(): Promise<void>;
}

export async function createWorld(): Promise<World> {
  const database = await cloneTemplateDatabase();
  const admin = createDatabase({ url: database.url, maxConnections: 2 });
  const app = createDatabase({ url: database.appUrl, maxConnections: 4 });
  const observed: Observed[] = [];
  const emails = new Map<string, SignedInAccount>();

  const real = createTenantScopes(() => app.db);
  const tenantScopes: TenantScopes = {
    inAccountScope: (input, run) =>
      real.inAccountScope(input, async (scope) => {
        observed.push({
          kind: 'account',
          context: scope.context,
          stored: await readTenantContext(scope),
        });
        return run(scope);
      }),
    inWorkspaceScope: (input, run) =>
      real.inWorkspaceScope(input, async (scope) => {
        observed.push({
          kind: 'workspace',
          context: scope.context,
          stored: await readTenantContext(scope),
        });
        return run(scope);
      }),
  };
  const api = createApp({
    ...NO_DEPENDENCIES,
    tenantScopes,
    findSignedInAccount: (headers) => {
      const id = headers.get('x-test-account');
      return Promise.resolve(id ? emails.get(id) : undefined);
    },
  });
  registerProbeRoutes(api);

  return {
    database,
    admin,
    app,
    observed,
    api,
    request: (account, path, init = {}) => {
      if (account && !emails.has(account.id)) {
        emails.set(account.id, {
          id: account.id,
          email: `${account.id}@example.com`,
          preferredLocale: null,
        });
      }
      return Promise.resolve(
        api.request(`${path}${init.query ?? ''}`, {
          method: init.method ?? 'GET',
          headers: {
            'content-type': 'application/json',
            ...(account ? { 'x-test-account': account.id } : {}),
          },
          body:
            init.body === undefined || (init.method ?? 'GET') === 'GET'
              ? undefined
              : JSON.stringify(init.body),
        }),
      );
    },
    close: async () => {
      await app.close();
      await admin.close();
      await database.drop();
    },
  };
}

/**
 * Two workspaces and their people, the standard actors of the isolation tests: A's owner,
 * trainer and client, B's owner, Sam (trainer and client of A, owner of B), a person with no
 * place in A, and a third workspace C where nobody Sam knows has a place.
 */
export async function seedScenario(world: World) {
  const { db } = world.admin;
  const [a, b, c] = [
    (await createWorkspace(db)).id,
    (await createWorkspace(db)).id,
    (await createWorkspace(db)).id,
  ];
  const person = (label: string) => createAccount(db, { label });
  const [ownerA, trainerA, clientAccount, ownerB, sam, outsider] = await Promise.all(
    ['owner-a', 'trainer-a', 'client-a', 'owner-b', 'sam', 'outsider'].map(person),
  );
  if (!ownerA || !trainerA || !clientAccount || !ownerB || !sam || !outsider) {
    throw new Error('accounts were not created');
  }
  await addTeamRole(db, { workspaceId: a, accountId: ownerA.id, role: 'owner' });
  await addTeamRole(db, { workspaceId: a, accountId: trainerA.id });
  const clientOfClient = await addClient(db, { workspaceId: a, accountId: clientAccount.id });
  await addTeamRole(db, { workspaceId: a, accountId: sam.id });
  const clientOfSam = await addClient(db, { workspaceId: a, accountId: sam.id });
  await addTeamRole(db, { workspaceId: b, accountId: sam.id, role: 'owner' });
  await addTeamRole(db, { workspaceId: b, accountId: ownerB.id, role: 'owner' });
  const clientOfOtherInA = await addClient(db, { workspaceId: a });
  const clientInB = await addClient(db, { workspaceId: b });
  return {
    a,
    b,
    c,
    ownerA,
    trainerA,
    clientAccount,
    ownerB,
    sam,
    outsider,
    clients: {
      ofClient: clientOfClient.id,
      ofSam: clientOfSam.id,
      other: clientOfOtherInA.id,
      inB: clientInB.id,
    },
  };
}

/** A's rows, to prove a refused call changed nothing. */
export async function clientsOf(world: World, workspaceId: string): Promise<string[]> {
  const rows = await world.admin.db.query.clients.findMany({
    where: (t, { eq }) => eq(t.organizationId, workspaceId),
  });
  return rows.map((row) => row.id).sort();
}
