import { parseSignUpAllowlist } from '@fivvi/auth';
import {
  consumeRateLimit,
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
import {
  createMemoryTransport,
  createPrivateSessionSender,
  createSendEmail,
  createTrainerInvitationSender,
} from '@fivvi/email';
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

/**
 * The timeout of a test that runs the whole isolation sweep: every route, as every actor, each
 * call a few round trips to Postgres and a read of every table (#678). Vitest's default of 30 s
 * holds on an idle machine (the sweeps take 5 to 10 s) but not on a busy one: with the load
 * average at 60 to 80 the slowest took 25 to 35 s, and 67 s was seen on a day with several
 * builds at once. What slows it is the machine waiting for CPU, not the code, so the limit
 * is sized to that: about 2.5 times the slowest run seen, to still catch a sweep that hangs.
 * TESTING.md §4.1 has the numbers.
 */
export const SWEEP_TIMEOUT_MS = 180_000;

/** What the isolation tests use of the pool under `world.admin`: the one `drizzle` keeps as `$client`. */
export interface AdminPool {
  query(...args: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * The pool under the privileged connection, which the `Database` type does not show. It takes a
 * named statement (planned once per connection) and lets a test see every statement sent.
 */
export function adminPool(world: World): AdminPool {
  return (world.admin.db as unknown as { $client: AdminPool }).$client;
}

export interface WorldOptions {
  /**
   * Record, for every tenant scope the API opens, the context Postgres holds for it (`observed`).
   * It costs a round trip per request: a world that only runs the sweep (`runIsolationSuite`),
   * which never reads `observed`, passes `false`. Default `true`.
   */
  observe?: boolean;
}

export async function createWorld(options: WorldOptions = {}): Promise<World> {
  const observe = options.observe ?? true;
  const database = await cloneTemplateDatabase();
  const admin = createDatabase({ url: database.url, maxConnections: 2 });
  const app = createDatabase({ url: database.appUrl, maxConnections: 4 });
  const observed: Observed[] = [];
  const emails = new Map<string, SignedInAccount>();

  const real = createTenantScopes(() => app.db);
  const tenantScopes: TenantScopes = {
    inAccountScope: (input, run) =>
      real.inAccountScope(input, async (scope) => {
        if (observe) {
          observed.push({
            kind: 'account',
            context: scope.context,
            stored: await readTenantContext(scope),
          });
        }
        return run(scope);
      }),
    inWorkspaceScope: (input, run) =>
      real.inWorkspaceScope(input, async (scope) => {
        if (observe) {
          observed.push({
            kind: 'workspace',
            context: scope.context,
            stored: await readTenantContext(scope),
          });
        }
        return run(scope);
      }),
    // The routes by an invitation's token are public, not part of the isolation suite (F011).
    inInvitationScope: (input, run) => real.inInvitationScope(input, run),
  };
  const api = createApp({
    ...NO_DEPENDENCIES,
    tenantScopes,
    // The lookup limit of the address route (F015), over the app connection like production.
    consumeRateLimit: (key, rule) => consumeRateLimit(app.db, key, rule, new Date()),
    // The trainer invitation routes email EM-09 (F011): into memory, never out.
    sendTrainerInvitation: createTrainerInvitationSender({
      sendEmail: createSendEmail({
        transport: createMemoryTransport(),
        sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
      }),
      appBaseUrl: () => 'https://fivvi.example.test',
    }),
    // The session routes email EM-11 (F020): into memory, never out.
    sendPrivateSession: createPrivateSessionSender({
      sendEmail: createSendEmail({
        transport: createMemoryTransport(),
        sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
      }),
    }),
    // The test accounts are `<id>@example.com`: every harness account is on the allowlist, so the
    // route that creates a workspace succeeds for every signed-in caller, team roles or not (F012).
    signUpAllowlist: parseSignUpAllowlist('@example.com'),
    // The email change routes (F005): the stand-ins accept every call and store nothing, so the
    // sweep proves the routes' access and that they change no row of any workspace.
    requestEmailChange: () => Promise.resolve(),
    confirmEmailChange: () => Promise.resolve({ email: 'new-address@example.com' }),
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
          name: '',
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
