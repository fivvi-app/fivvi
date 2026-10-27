import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../../src/index.ts';
import { clientsOf, createWorld, seedScenario, type World } from './harness.ts';

type Operation = { operationId: string; 'x-access'?: { type: string } };
const contract: { paths: Record<string, Record<string, Operation>> } = JSON.parse(
  readFileSync(new URL('../../../contract/openapi.json', import.meta.url), 'utf8'),
);

/** Every account and workspace operation of the committed contract, with a concrete URL path. */
const protectedOperations = Object.entries(contract.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([, operation]) => ['account', 'workspace'].includes(operation['x-access']?.type ?? ''))
    .map(([method, operation]) => ({
      name: operation.operationId,
      method: method.toUpperCase(),
      path: path.replaceAll(/{[^}]+}/g, '0197c0de-0000-7000-8000-0000000000a1'),
    })),
);

describe('E011 access', () => {
  it('AC7: anonymous gets 401 on every workspace and account route', async () => {
    // Nobody is signed in: the default dependencies resolve no account.
    const app = createApp(NO_DEPENDENCIES);
    // The contract has account routes today; the check must not pass by looking at nothing.
    expect(protectedOperations.map((operation) => operation.name)).toContain('getMe');

    for (const operation of protectedOperations) {
      // Whatever its body or query: valid-looking, invalid, malformed or missing.
      for (const [query, body] of [
        ['', undefined],
        ['?page=not-a-number&locale=xx', '{"unexpected":true}'],
        ['', 'not json'],
      ] as const) {
        const response = await app.request(`${operation.path}${query}`, {
          method: operation.method,
          headers: { 'content-type': 'application/json' },
          body: operation.method === 'GET' ? undefined : body,
        });

        expect(response.status, `${operation.name} ${query}`).toBe(401);
        expect(await response.json(), operation.name).toEqual({ code: 'not_signed_in' });
      }
    }
  });
});

type Scenario = Awaited<ReturnType<typeof seedScenario>>;
const NOT_FOUND = { code: 'not_found' };
const FORBIDDEN = { code: 'forbidden' };
const NO_SUCH_WORKSPACE = '0197c0de-0000-7000-8000-0000000000ff';

describe('E011 the caller’s place in the workspace', () => {
  let world: World;
  let s: Scenario;
  const inWorkspace = (workspaceId: string, route: string) =>
    `/v1/workspaces/${workspaceId}${route}`;
  const json = async (response: Response) =>
    (await response.json()) as Record<string, unknown> & {
      clients: { id: string }[];
      client: { workspaceId: string };
    };

  beforeAll(async () => {
    world = await createWorld();
    s = await seedScenario(world);
  });

  afterAll(async () => {
    await world?.close();
  });

  it('AC8: no place in the workspace answers like a missing workspace, writes nothing and sets no context with it', async () => {
    const before = await clientsOf(world, s.a);
    world.observed.length = 0;
    const routes = [
      ['GET', '/probe/owner'],
      ['GET', '/probe/team'],
      ['GET', '/probe/clients'],
      ['GET', `/probe/clients/${s.clients.ofClient}`],
      ['POST', '/probe/clients'],
      ['GET', '/probe/own'],
      ['GET', `/probe/own/clients/${s.clients.ofClient}`],
    ] as const;

    for (const [method, route] of routes) {
      const missing = await world.request(s.outsider, inWorkspace(NO_SUCH_WORKSPACE, route), {
        method,
      });
      // Whatever the body or query: never a validation error.
      for (const init of [{}, { query: '?page=abc', body: { unexpected: true } }]) {
        const response = await world.request(s.outsider, inWorkspace(s.a, route), {
          method,
          ...init,
        });

        expect(response.status, `${method} ${route}`).toBe(404);
        expect(await response.json()).toEqual(NOT_FOUND);
        expect(missing.status).toBe(404);
        expect(await json(missing.clone())).toEqual(NOT_FOUND);
      }
    }

    // A workspace that is no id at all is the same answer.
    const notAnId = await world.request(s.outsider, '/v1/workspaces/not-an-id/probe/team');
    expect(notAnId.status).toBe(404);
    expect(await notAnId.json()).toEqual(NOT_FOUND);
    // Nothing was written, no handler ran, and no scope was ever opened for A.
    expect(await clientsOf(world, s.a)).toEqual(before);
    expect(world.observed).toEqual([]);
  });

  it('AC9: the context holds exactly the requested workspace and the caller’s place in it', async () => {
    world.observed.length = 0;

    const asSam = await world.request(s.sam, inWorkspace(s.a, '/probe/team'));
    const inB = await world.request(s.sam, inWorkspace(s.b, '/probe/owner'));
    const asClient = await world.request(s.clientAccount, inWorkspace(s.a, '/probe/own'));

    expect(asSam.status).toBe(200);
    expect(inB.status).toBe(200);
    expect(asClient.status).toBe(200);
    // Sam is a trainer and a client of A: both are in the context object, and the database
    // context names no client because the route runs Sam as a trainer.
    expect(world.observed[0]).toEqual({
      kind: 'workspace',
      context: {
        accountId: s.sam.id,
        workspaceIds: [s.a],
        teamRole: 'trainer',
        clientId: s.clients.ofSam,
        actingAs: 'team',
      },
      stored: { accountId: s.sam.id, workspaceIds: [s.a], clientId: null },
    });
    expect(await json(asSam)).toMatchObject({ context: world.observed[0]?.context });
    // In B, Sam is an owner, and A is nowhere in the context.
    expect(world.observed[1]).toEqual({
      kind: 'workspace',
      context: { accountId: s.sam.id, workspaceIds: [s.b], teamRole: 'owner', actingAs: 'team' },
      stored: { accountId: s.sam.id, workspaceIds: [s.b], clientId: null },
    });
    // A client route names the client in the database context.
    expect(world.observed[2]).toEqual({
      kind: 'workspace',
      context: {
        accountId: s.clientAccount.id,
        workspaceIds: [s.a],
        clientId: s.clients.ofClient,
        actingAs: 'client',
      },
      stored: { accountId: s.clientAccount.id, workspaceIds: [s.a], clientId: s.clients.ofClient },
    });
    for (const observed of world.observed) expect(observed.context.workspaceIds).toHaveLength(1);
  });

  it('AC9: the context ends with the request', async () => {
    await world.request(s.ownerA, inWorkspace(s.a, '/probe/team'));
    // Every pooled connection of the API, each starting a new transaction.
    const results = await Promise.all(
      [0, 1, 2, 3].map(() =>
        world.app.db.transaction(async (tx) => {
          const [row] = (await tx.execute(sql`select app_workspace_ids() as ids`)).rows;
          return row?.ids ?? null;
        }),
      ),
    );
    expect(results).toEqual([null, null, null, null]);
  });

  describe('AC10: a place the route does not allow', () => {
    it.each([
      ['a trainer on an owner-only route', 'trainerA', '/probe/owner'],
      ['a client without a team role on a team route', 'clientAccount', '/probe/team'],
      [
        'a client without a team role on the clients of a team route',
        'clientAccount',
        '/probe/clients',
      ],
      ['a team member without a client relationship on a client route', 'trainerA', '/probe/own'],
      ['an owner without a client relationship on a client route', 'ownerA', '/probe/own'],
      ['Sam, a trainer of A, on an owner-only route', 'sam', '/probe/owner'],
    ] as const)('gets 403, whatever the request: %s', async (_name, who, route) => {
      world.observed.length = 0;

      for (const init of [{}, { query: '?page=abc', body: { unexpected: true } }]) {
        const response = await world.request(s[who], inWorkspace(s.a, route), init);

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual(FORBIDDEN);
      }
      // Refused before any scope with A was opened.
      expect(world.observed).toEqual([]);
    });

    it('lets in what the access allows', async () => {
      for (const [who, workspace, route] of [
        ['ownerA', s.a, '/probe/owner'],
        ['trainerA', s.a, '/probe/team'],
        ['sam', s.a, '/probe/team'],
        ['sam', s.a, '/probe/own'],
        ['sam', s.b, '/probe/owner'],
        ['clientAccount', s.a, '/probe/own'],
      ] as const) {
        const response = await world.request(s[who], inWorkspace(workspace, route));

        expect(response.status, `${who} ${route}`).toBe(200);
      }
    });

    it('answers a person with no place in a workspace of their own account 404, not 403', async () => {
      const inC = await world.request(s.sam, inWorkspace(s.c, '/probe/owner'));
      const ownerBInA = await world.request(s.ownerB, inWorkspace(s.a, '/probe/owner'));

      expect(inC.status).toBe(404);
      expect(ownerBInA.status).toBe(404);
    });

    it('validates only after the access: a caller who may call it gets 400 for a bad id', async () => {
      const response = await world.request(s.ownerA, inWorkspace(s.a, '/probe/clients/not-an-id'));

      expect(response.status).toBe(400);
    });

    it('another workspace’s record is 404, as if it did not exist', async () => {
      const missing = await world.request(
        s.ownerA,
        inWorkspace(s.a, '/probe/clients/0197c0de-0000-7000-8000-0000000000fe'),
      );
      const fromB = await world.request(
        s.ownerA,
        inWorkspace(s.a, `/probe/clients/${s.clients.inB}`),
      );
      const bWithA = await world.request(
        s.ownerB,
        inWorkspace(s.b, `/probe/clients/${s.clients.ofClient}`),
      );
      // The same id under the other workspace's path.
      const inRightPlace = await world.request(
        s.ownerB,
        inWorkspace(s.b, `/probe/clients/${s.clients.inB}`),
      );

      for (const response of [missing, fromB, bWithA]) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual(NOT_FOUND);
      }
      expect(inRightPlace.status).toBe(200);
    });

    it('another client’s record on a client route is 404, and the caller’s own is not', async () => {
      const own = await world.request(
        s.clientAccount,
        inWorkspace(s.a, `/probe/own/clients/${s.clients.ofClient}`),
      );
      const other = await world.request(
        s.clientAccount,
        inWorkspace(s.a, `/probe/own/clients/${s.clients.other}`),
      );
      const sams = await world.request(
        s.clientAccount,
        inWorkspace(s.a, `/probe/own/clients/${s.clients.ofSam}`),
      );
      const list = await world.request(s.clientAccount, inWorkspace(s.a, '/probe/own/clients'));

      expect(own.status).toBe(200);
      for (const response of [other, sams]) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual(NOT_FOUND);
      }
      expect((await json(list)).clients.map((client: { id: string }) => client.id)).toEqual([
        s.clients.ofClient,
      ]);
    });

    it('Sam on a client route sees only Sam’s own client, and as a trainer what any trainer sees', async () => {
      const own = await world.request(s.sam, inWorkspace(s.a, '/probe/own/clients'));
      const ofClient = await world.request(
        s.sam,
        inWorkspace(s.a, `/probe/own/clients/${s.clients.ofClient}`),
      );
      const asSam = await world.request(s.sam, inWorkspace(s.a, '/probe/clients'));
      const asTrainer = await world.request(s.trainerA, inWorkspace(s.a, '/probe/clients'));

      expect((await json(own)).clients.map((c: { id: string }) => c.id)).toEqual([s.clients.ofSam]);
      expect(ofClient.status).toBe(404);
      expect(await json(asSam)).toEqual(await json(asTrainer));
    });
  });

  it('a failed request leaves nothing behind: its transaction rolls back', async () => {
    const before = await clientsOf(world, s.a);

    const created = await world.request(s.ownerA, inWorkspace(s.a, '/probe/clients'), {
      method: 'POST',
    });
    const afterCreated = await clientsOf(world, s.a);
    const failed = await world.request(
      s.ownerA,
      inWorkspace(s.a, '/probe/clients-then-not-found'),
      { method: 'POST' },
    );

    expect(created.status).toBe(200);
    expect(afterCreated).toHaveLength(before.length + 1);
    expect(failed.status).toBe(404);
    expect(await clientsOf(world, s.a)).toEqual(afterCreated);
    // The new client belongs to the workspace of the path.
    expect((await json(created)).client.workspaceId).toBe(s.a);
  });
});
