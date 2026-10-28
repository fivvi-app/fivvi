import { organizations, teamMembers } from '@fivvi/database';
import { addClient } from '@fivvi/database/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedActors } from './actors.ts';
import { createWorld, seedScenario, type World } from './harness.ts';
import { ISOLATION_CASES } from './isolation-cases.ts';
import { runIsolationSuite } from './suite.ts';

type Scenario = Awaited<ReturnType<typeof seedScenario>>;

describe('E011 isolation suite', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    await world?.close();
  });

  it('AC11: every workspace route, every actor: right status, no A data, A unchanged', async () => {
    const result = await runIsolationSuite(world, ISOLATION_CASES);

    expect(result.failures).toEqual([]);
    // It must not pass by looking at nothing: every case was called, with a call per actor.
    expect(result.operations.toSorted()).toEqual(Object.keys(ISOLATION_CASES).toSorted());
    expect(result.calls).toBeGreaterThan(Object.keys(ISOLATION_CASES).length * 8);
  });
});

describe('F002 the route that creates a workspace, in the isolation suite', () => {
  let world: World;

  beforeAll(async () => {
    world = await createWorld();
  });

  afterAll(async () => {
    await world?.close();
  });

  const workspaces = (accountId: string) =>
    world.admin.db
      .select({ workspaceId: teamMembers.organizationId, role: teamMembers.role })
      .from(teamMembers)
      .where(eq(teamMembers.accountId, accountId));

  it('makes a workspace of their own for an account without a team role, and none for a team member', async () => {
    const scenario = await seedActors(world);
    const { clientA, outsider, ownerA, sam } = scenario.actors;
    const before = await world.admin.db.$count(organizations);

    const result = await runIsolationSuite(world, ISOLATION_CASES, {
      scenario,
      only: (actor) => [clientA, outsider, ownerA, sam].includes(actor),
    });

    expect(result.failures).toEqual([]);
    // Two accounts with no team role (a client of A and an outsider) made one each, under RLS.
    expect(await world.admin.db.$count(organizations)).toBe(before + 2);
    for (const actor of [clientA, outsider]) {
      expect(await workspaces(actor.account?.id ?? '')).toEqual([
        { workspaceId: expect.any(String), role: 'owner' },
      ]);
    }
    // A's owner and Sam have team roles already: refused, nothing added.
    expect(await workspaces(ownerA.account?.id ?? '')).toHaveLength(1);
    expect(await workspaces(sam.account?.id ?? '')).toHaveLength(2);
  });
});

describe('E011 account routes', () => {
  let world: World;
  let s: Scenario;
  let clientInC: string;

  beforeAll(async () => {
    world = await createWorld();
    s = await seedScenario(world);
    clientInC = (await addClient(world.admin.db, { workspaceId: s.c })).id;
  });

  afterAll(async () => {
    await world?.close();
  });

  const idsOf = (workspaces: readonly string[]) => [...workspaces].sort();

  it('AC13: account routes see only the caller’s workspaces', async () => {
    world.observed.length = 0;

    const sam = await world.request(s.sam, '/v1/me');
    const client = await world.request(s.clientAccount, '/v1/me');
    const outsider = await world.request(s.outsider, '/v1/me');

    expect([sam.status, client.status, outsider.status]).toEqual([200, 200, 200]);
    // GET /v1/me ran in a context of the workspaces where the caller has a team role: it lists
    // those and no workspace the caller is only a client of.
    expect(world.observed.map((observed) => observed.kind)).toEqual([
      'account',
      'account',
      'account',
    ]);
    expect(world.observed.map((observed) => idsOf(observed.context.workspaceIds))).toEqual([
      idsOf([s.a, s.b]),
      [],
      [],
    ]);
    // Postgres holds the same, and never an unscoped context.
    expect(
      world.observed.map((observed) => observed.stored.workspaceIds?.toSorted() ?? null),
    ).toEqual([idsOf([s.a, s.b]), null, null]);
    expect(world.observed.map((observed) => observed.stored.accountId)).toEqual([
      s.sam.id,
      s.clientAccount.id,
      s.outsider.id,
    ]);
    // The response is the account and the workspaces it has a team role in, nothing of any other.
    const body = await sam.text();
    const listed = [s.a, s.b].map((id) => ({
      id,
      name: expect.any(String),
      slug: expect.any(String),
    }));
    expect(JSON.parse(body)).toEqual({
      id: s.sam.id,
      email: `${s.sam.id}@example.com`,
      name: null,
      preferredLocale: null,
      canCreateWorkspace: false,
      workspaces: expect.arrayContaining(listed),
    });
    expect(JSON.parse(body).workspaces).toHaveLength(2);
    for (const foreign of [s.c, clientInC, ...Object.values(s.clients)]) {
      expect(body).not.toContain(foreign);
    }
    // A client of A has no team role anywhere: nothing of A, and the first-run rule applies.
    const clientBody = await client.text();
    expect(JSON.parse(clientBody)).toMatchObject({ workspaces: [], canCreateWorkspace: true });
    expect(clientBody).not.toContain(s.a);
  });

  it('AC13: a route asks for the relationship it needs: team roles only', async () => {
    world.observed.length = 0;

    const sam = await world.request(s.sam, '/v1/probe/team-places');
    const client = await world.request(s.clientAccount, '/v1/probe/team-places');
    const any = await world.request(s.clientAccount, '/v1/probe/places');

    const samBody = (await sam.json()) as { places: { workspaceId: string }[] };
    expect(
      idsOf(samBody.places.map((place: { workspaceId: string }) => place.workspaceId)),
    ).toEqual(idsOf([s.a, s.b]));
    // A client of A has no team role anywhere: an empty context, and nothing listed.
    const clientBody = (await client.json()) as { places: unknown[] };
    expect(clientBody.places).toEqual([]);
    expect(world.observed[1]?.context.workspaceIds).toEqual([]);
    // Where the route asks for either, the client's workspace is there.
    expect(((await any.json()) as { places: unknown[] }).places).toEqual([
      { workspaceId: s.a, clientId: s.clients.ofClient },
    ]);
    // None of the responses names a workspace or client the caller has no place in.
    const text = JSON.stringify([samBody, clientBody]);
    expect(text).not.toContain(s.c);
    expect(text).not.toContain(clientInC);
  });

  it('refuses an anonymous caller before any scope is opened', async () => {
    world.observed.length = 0;

    const response = await world.request(undefined, '/v1/me');

    expect(response.status).toBe(401);
    expect(world.observed).toEqual([]);
  });
});
