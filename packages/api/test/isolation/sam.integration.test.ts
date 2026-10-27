import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/index.ts';
import { type Actor, type Scenario, seedActors, withTeamRoleEnded } from './actors.ts';
import { type ContractDocument, describeOperations } from './coverage.ts';
import {
  type CallFacts,
  type ExpectedCall,
  expectedCall,
  REFUSAL_BODIES,
  type RecordKind,
  type XAccess,
} from './expectations.ts';
import { clientsOf, createWorld, type World } from './harness.ts';
import { ISOLATION_CASES } from './isolation-cases.ts';
import { runIsolationSuite } from './suite.ts';

// AC12 (E011, #257): one person with a different place in each workspace gets exactly the rights
// of each place and nothing more (`PRODUCT.md §9`). Sam is a trainer in A, the owner of B and a
// client of A (`createSam` in `actors.ts`, one of the standard actors of the suite). Every status
// below comes from `expectations.ts`, from the route's declared access and Sam's place, the same
// module that drives the whole suite; a few lines also state the status the spec names, so a
// change of the rules there can't quietly weaken what AC12 says.

/** What the probe routes answer with, as far as these tests read it. */
interface ProbeBody {
  clients: { id: string }[];
  client: { id: string };
  stored: Record<string, unknown>;
}

interface Asked {
  status: number;
  text: string;
  body: ProbeBody;
  expected: ExpectedCall;
}

/** The world of a test, with the means to call an operation as an actor and know the answer. */
function scene() {
  const state = {} as { world: World; s: Scenario; operations: Map<string, Operation> };
  type Operation = { name: string; method: string; path: string; access: XAccess };

  async function open(): Promise<void> {
    state.world = await createWorld();
    state.s = await seedActors(state.world);
    const document = buildOpenApiDocument(state.world.api) as unknown as ContractDocument;
    state.operations = new Map(
      describeOperations(document).flatMap((operation) =>
        operation.access ? [[operation.name, operation as Operation] as const] : [],
      ),
    );
  }

  /**
   * Calls a workspace operation as `actor` in `workspaceId`, naming `clientId` where the path
   * has one, and checks the status against what the expectations derive for it.
   */
  async function ask(
    actor: Actor,
    workspaceId: string,
    name: string,
    named: { clientId?: string; record?: RecordKind } = {},
  ): Promise<Asked> {
    const operation = state.operations.get(name);
    if (!operation) throw new Error(`${name} is no operation of the test app.`);
    const facts: CallFacts = {
      access: operation.access,
      method: operation.method,
      workspaceId,
      signedIn: actor.account !== undefined,
      places: actor.places,
      record: named.record ?? 'none',
      self: actor.account ? [actor.account.id, actor.account.email, actor.account.marker] : [],
    };
    const isolationCase = ISOLATION_CASES[name];
    const response = await state.world.request(
      actor.account,
      operation.path
        .replaceAll('{workspaceId}', workspaceId)
        .replaceAll('{clientId}', named.clientId ?? '0197c0de-0000-7000-8000-0000000000ff'),
      {
        method: operation.method,
        ...(isolationCase?.query ? { query: isolationCase.query } : {}),
        ...(isolationCase?.body !== undefined ? { body: isolationCase.body } : {}),
      },
    );
    const text = await response.text();
    const expected = expectedCall(facts);
    const status = response.status;
    if (expected.status === 'success') {
      expect(status, `${name} as ${actor.name}`).toBeGreaterThanOrEqual(200);
      expect(status, `${name} as ${actor.name}`).toBeLessThan(300);
    } else {
      expect(status, `${name} as ${actor.name}`).toBe(expected.status);
      expect(text, `${name} as ${actor.name}`).toBe(
        JSON.stringify(REFUSAL_BODIES[expected.status]),
      );
    }
    return { status, text, body: (text ? JSON.parse(text) : {}) as ProbeBody, expected };
  }

  const lastObserved = () => state.world.observed.at(-1);
  return { state, open, ask, lastObserved };
}

/**
 * The calls the suite makes as Sam: one to an account route; to a workspace route that names no
 * record one in each of A, B and C; to one that names a record two more in A and in B (his own
 * client's, and the other workspace's record) and a call with C's record.
 */
function callsAsSam(operations: ReadonlyMap<string, { access: XAccess }>): number {
  let calls = 0;
  for (const [name, isolationCase] of Object.entries(ISOLATION_CASES)) {
    if (operations.get(name)?.access.type === 'account') calls += 1;
    else calls += Object.keys(isolationCase.params ?? {}).length > 0 ? 6 : 3;
  }
  return calls;
}

const accountTokens = (accounts: Scenario['accounts']) =>
  accounts.flatMap((account) => [account.id, account.email, account.marker]);

/** The accounts of one workspace's people, by the label the standard actors give them. */
const accountsOf = (s: Scenario, workspace: 'a' | 'b') =>
  s.accounts.filter((account) => new RegExp(`-${workspace}-[0-9a-f]{8}$`).test(account.marker));

describe('AC12: trainer in A, owner of B, client of A', () => {
  const { state, open, ask, lastObserved } = scene();
  const sam = () => state.s.actors.sam;
  const clientIdsOf = (asked: Asked) => asked.body.clients.map((client) => client.id).sort();

  beforeAll(open);
  afterAll(async () => {
    await state.world?.close();
  });

  it('in B, Sam has owner access, and the context holds B only', async () => {
    const { s, world } = state;
    world.observed.length = 0;

    const owner = await ask(sam(), s.b, 'probeOwner');
    const team = await ask(sam(), s.b, 'probeTeam');

    // The spec: an owner reaches the Owner-only route and the team route.
    expect([owner.expected.status, team.expected.status]).toEqual(['success', 'success']);
    expect(world.observed).toHaveLength(2);
    for (const observed of world.observed) {
      // B and nothing else, with the role he has there; his client relationship in A is not in it.
      expect(observed.context).toEqual({
        accountId: sam().account?.id,
        workspaceIds: [s.b],
        teamRole: 'owner',
        actingAs: 'team',
      });
      expect(observed.stored).toEqual({
        accountId: sam().account?.id,
        workspaceIds: [s.b],
        clientId: null,
      });
    }
    // He is no client of B: a route for B's clients' own records is not his.
    expect((await ask(sam(), s.b, 'probeOwn')).expected.status).toBe(403);
  });

  it('in A, an Owner-only route answers 403, a team route is allowed', async () => {
    const { s, world } = state;
    world.observed.length = 0;

    const ownerOnly = await ask(sam(), s.a, 'probeOwner');
    const team = await ask(sam(), s.a, 'probeTeam');

    expect(ownerOnly.expected.status).toBe(403);
    expect(ownerOnly.body).toEqual({ code: 'forbidden' });
    expect(team.expected.status).toBe('success');
    // The refusal opened no scope; the team route ran for A alone, as a trainer.
    expect(world.observed).toHaveLength(1);
    expect(lastObserved()?.context).toEqual({
      accountId: sam().account?.id,
      workspaceIds: [s.a],
      teamRole: 'trainer',
      clientId: s.clients.a.sam,
      actingAs: 'team',
    });
    // The database context names no client: this request runs him as a trainer.
    expect(lastObserved()?.stored.clientId).toBeNull();
  });

  it('in A, a client route returns only Sam’s own client data, never another client’s', async () => {
    const { s } = state;
    const { own, other, sam: samClient } = s.clients.a;

    const own1 = await ask(sam(), s.a, 'probeOwn');
    expect(lastObserved()?.context.actingAs).toBe('client');
    expect(lastObserved()?.stored.clientId).toBe(samClient);
    expect(own1.expected).toEqual({ status: 'success', hat: 'client' });

    const list = await ask(sam(), s.a, 'probeOwnListClients');
    expect(clientIdsOf(list)).toEqual([samClient]);
    for (const foreign of [own, other]) expect(list.text).not.toContain(foreign);

    // His own client's record: found. Another client's: as if it didn't exist.
    const mine = await ask(sam(), s.a, 'probeOwnFindClient', {
      clientId: samClient,
      record: 'own',
    });
    expect(mine.body.client.id).toBe(samClient);
    for (const foreign of [own, other]) {
      const refused = await ask(sam(), s.a, 'probeOwnFindClient', {
        clientId: foreign,
        record: 'other-client',
      });
      expect(refused.expected.status).toBe(404);
      expect(refused.body).toEqual({ code: 'not_found' });
    }
  });

  it('Sam’s trainer role shows nothing more than any trainer in A sees, and his client relationship adds nothing', async () => {
    const { s } = state;
    const trainer = s.actors.trainerA;
    const clients = Object.values(s.clients.a);

    // The team routes show a trainer the same, whoever he is also.
    const samList = await ask(sam(), s.a, 'probeListClients');
    const trainerList = await ask(trainer, s.a, 'probeListClients');
    expect(clientIdsOf(samList)).toEqual(clientIdsOf(trainerList));
    expect(clientIdsOf(samList)).toEqual([...clients].sort());
    for (const clientId of clients) {
      const record = { clientId, record: 'other-client' } as const;
      const samFind = await ask(sam(), s.a, 'probeFindClient', record);
      const trainerFind = await ask(trainer, s.a, 'probeFindClient', record);
      expect(samFind.body).toEqual(trainerFind.body);
    }
    // The same context, apart from who he is: no second workspace, no wider reach.
    const samTeam = await ask(sam(), s.a, 'probeTeam');
    const trainerTeam = await ask(trainer, s.a, 'probeTeam');
    expect(samTeam.body.stored).toEqual({
      ...trainerTeam.body.stored,
      accountId: sam().account?.id,
    });
    // Neither of the two roles lifts the other: still no Owner-only route, as for any trainer.
    expect((await ask(sam(), s.a, 'probeOwner')).status).toBe(403);
    expect((await ask(trainer, s.a, 'probeOwner')).status).toBe(403);

    // As a client he is one among A's clients: the view of the client of A, not a wider one.
    const asClient = await ask(s.actors.clientA, s.a, 'probeOwnListClients');
    const samAsClient = await ask(sam(), s.a, 'probeOwnListClients');
    expect(clientIdsOf(asClient)).toHaveLength(1);
    expect(clientIdsOf(samAsClient)).toHaveLength(1);
    expect(clientIdsOf(samAsClient)).not.toEqual(clientIdsOf(asClient));
  });

  it('no response for B holds A’s data, and none for A holds B’s', async () => {
    const { s } = state;
    const readsOf = (workspaceId: string, clientId: string, mine: string) =>
      Promise.all([
        ask(sam(), workspaceId, 'probeTeam'),
        ask(sam(), workspaceId, 'probeListClients'),
        ask(sam(), workspaceId, 'probeFindClient', { clientId, record: 'other-client' }),
        ask(sam(), workspaceId, 'probeOwnListClients'),
        ask(sam(), workspaceId, 'probeOwner'),
      ]).then((answers) => ({ answers, mine }));
    const inA = await readsOf(s.a, s.clients.a.other, s.a);
    const inB = await readsOf(s.b, s.clients.b.other, s.b);
    const tokens = (workspace: 'a' | 'b') => [
      s[workspace],
      ...Object.values(s.clients[workspace]),
      ...accountTokens(accountsOf(s, workspace)),
    ];

    // Not by looking at nothing: B’s team route and listing do hold B’s own data.
    expect(inB.answers[1]?.text).toContain(s.clients.b.other);
    expect(inA.answers[1]?.text).toContain(s.clients.a.other);
    for (const { text } of inB.answers) {
      for (const token of tokens('a')) expect(text).not.toContain(token);
    }
    for (const { text } of inA.answers) {
      for (const token of tokens('b')) expect(text).not.toContain(token);
    }
    // A record of the other workspace, named in the path of this one: as if it didn't exist.
    for (const [workspaceId, clientId] of [
      [s.a, s.clients.b.other],
      [s.b, s.clients.a.other],
    ] as const) {
      const found = await ask(sam(), workspaceId, 'probeFindClient', {
        clientId,
        record: 'foreign-workspace',
      });
      expect(found.expected.status).toBe(404);
      expect(found.body).toEqual({ code: 'not_found' });
    }
  });

  it('in a workspace C where Sam has no place, every route answers 404', async () => {
    const { s, world } = state;
    const routes = [...state.operations.values()].filter(
      (operation) => operation.access.type === 'workspace',
    );
    const before = await clientsOf(world, s.c);
    world.observed.length = 0;

    // The probe routes cover every kind of access, and the call names C's own client.
    expect(routes.map((route) => route.name)).toEqual(
      expect.arrayContaining(['probeOwner', 'probeTeam', 'probeOwn', 'probeFindClient']),
    );
    for (const route of routes) {
      const asked = await ask(sam(), s.c, route.name, {
        clientId: s.clients.c.other,
        record: 'other-client',
      });
      expect(asked.expected.status, route.name).toBe(404);
      expect(asked.body, route.name).toEqual({ code: 'not_found' });
    }
    // No scope was opened for C and nothing in it changed.
    expect(world.observed).toEqual([]);
    expect(await clientsOf(world, s.c)).toEqual(before);
  });
});

describe('AC12: after Sam’s trainer role in A ends', () => {
  const { state, open, ask, lastObserved } = scene();
  let ended: Scenario;
  const sam = () => ended.actors.sam;

  beforeAll(async () => {
    await open();
    ended = await withTeamRoleEnded(state.world, state.s, 'sam', state.s.a);
  });
  afterAll(async () => {
    await state.world?.close();
  });

  it('AC12: after Sam’s trainer role in A ends, team routes in A answer 403', async () => {
    const { world } = state;
    const { a } = ended;
    world.observed.length = 0;
    const before = await clientsOf(world, a);

    for (const name of ['probeOwner', 'probeTeam', 'probeListClients', 'probeCreateClient']) {
      const asked = await ask(sam(), a, name);
      expect(asked.expected.status, name).toBe(403);
      expect(asked.body, name).toEqual({ code: 'forbidden' });
    }
    expect(world.observed).toEqual([]);
    expect(await clientsOf(world, a)).toEqual(before);
    // Nothing else changed: he is still the owner of B.
    expect((await ask(sam(), ended.b, 'probeOwner')).expected.status).toBe('success');
  });

  it('AC12: his client relationship and own client data in A remain', async () => {
    const { world } = state;
    const { a, clients } = ended;

    expect(await clientsOf(world, a)).toContain(clients.a.sam);
    const own = await ask(sam(), a, 'probeOwn');
    expect(own.expected).toEqual({ status: 'success', hat: 'client' });
    expect(lastObserved()?.context).toEqual({
      accountId: sam().account?.id,
      workspaceIds: [a],
      clientId: clients.a.sam,
      actingAs: 'client',
    });
    const list = await ask(sam(), a, 'probeOwnListClients');
    expect(list.body.clients.map((client) => client.id)).toEqual([clients.a.sam]);
    for (const foreign of [clients.a.own, clients.a.other])
      expect(list.text).not.toContain(foreign);
    // The places of his account: a client of A, a team member only where the route asks for it.
    const places = await world.request(sam().account, '/v1/probe/places');
    expect(
      ((await places.json()) as { places: { workspaceId: string }[] }).places.map(
        (place) => place.workspaceId,
      ),
    ).toEqual(expect.arrayContaining([a]));
    const team = await world.request(sam().account, '/v1/probe/team-places');
    expect(
      ((await team.json()) as { places: { workspaceId: string }[] }).places.map(
        (place) => place.workspaceId,
      ),
    ).toEqual([ended.b]);
  });

  it('AC12: every route answers Sam by his places as they are now', async () => {
    const result = await runIsolationSuite(state.world, ISOLATION_CASES, {
      scenario: ended,
      only: (actor) => actor === sam(),
    });

    expect(result.failures).toEqual([]);
    expect(result.operations.toSorted()).toEqual(Object.keys(ISOLATION_CASES).toSorted());
    expect(result.calls).toBe(callsAsSam(state.operations));
  });
});

describe('AC12: every route, called as Sam', () => {
  const { state, open } = scene();

  beforeAll(open);
  afterAll(async () => {
    await state.world?.close();
  });

  it('AC12: gets the status his place gives, sees no other workspace’s data and changes only what he may', async () => {
    const { s, world } = state;
    const result = await runIsolationSuite(world, ISOLATION_CASES, {
      scenario: s,
      only: (actor) => actor === s.actors.sam,
    });

    expect(result.failures).toEqual([]);
    expect(result.operations.toSorted()).toEqual(Object.keys(ISOLATION_CASES).toSorted());
    expect(result.calls).toBe(callsAsSam(state.operations));
  });
});
