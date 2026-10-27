import { addClient } from '@fivvi/database/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, seedScenario, type World } from './harness.ts';

type Scenario = Awaited<ReturnType<typeof seedScenario>>;

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
    // GET /v1/me ran in a context of the workspaces where the caller has any place.
    expect(world.observed.map((observed) => observed.kind)).toEqual([
      'account',
      'account',
      'account',
    ]);
    expect(world.observed.map((observed) => idsOf(observed.context.workspaceIds))).toEqual([
      idsOf([s.a, s.b]),
      idsOf([s.a]),
      [],
    ]);
    // Postgres holds the same, and never an unscoped context.
    expect(
      world.observed.map((observed) => observed.stored.workspaceIds?.toSorted() ?? null),
    ).toEqual([idsOf([s.a, s.b]), idsOf([s.a]), null]);
    expect(world.observed.map((observed) => observed.stored.accountId)).toEqual([
      s.sam.id,
      s.clientAccount.id,
      s.outsider.id,
    ]);
    // The response is the account and nothing of any workspace.
    const body = await sam.text();
    expect(JSON.parse(body)).toEqual({
      id: s.sam.id,
      email: `${s.sam.id}@example.com`,
      preferredLocale: null,
    });
    for (const foreign of [s.a, s.b, s.c, clientInC, ...Object.values(s.clients)]) {
      expect(body).not.toContain(foreign);
    }
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
