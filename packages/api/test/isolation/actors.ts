import type { Place } from '@fivvi/database';
import {
  addClient,
  addTeamRole,
  createAccount,
  createWorkspace,
  endTeamRole,
} from '@fivvi/database/testing';
import type { World } from './harness.ts';

// The standard actors of the isolation suite (E011, spec #145) and the data they stand on: three
// workspaces, A (the one under test), B (the attacker's) and C (where Sam has no place). Sam is
// the one actor with a place in two workspaces (#257, AC12): trainer in A, owner of B and client
// of A. Every other actor has a place in one, so a token of A's data is A's and nobody else's;
// only Sam's own account tokens (id, email, marker) are in both A's and B's rows.

export interface Account {
  id: string;
  email: string;
  marker: string;
}

export interface Actor {
  name: string;
  /** Undefined for the anonymous caller. */
  account: Account | undefined;
  /** What the actor is in each workspace it has a place in. */
  places: Readonly<Record<string, Place>>;
}

export interface Scenario {
  a: string;
  b: string;
  /** A workspace where Sam, and every other standard actor, has no place. */
  c: string;
  /** Short names for the workspaces in messages. */
  labels: Readonly<Record<string, string>>;
  actors: Readonly<
    Record<
      | 'ownerA'
      | 'trainerA'
      | 'clientA'
      | 'ownerB'
      | 'trainerB'
      | 'clientB'
      | 'sam'
      | 'outsider'
      | 'anonymous',
      Actor
    >
  >;
  /**
   * The clients of each workspace: the one with the `client` actor's account, and another. A also
   * has Sam's client row; C has one client, of nobody the suite calls as.
   */
  clients: Readonly<{
    a: { own: string; other: string; sam: string };
    b: { own: string; other: string };
    c: { other: string };
  }>;
  /** Every account created, to search a response for their emails and markers. */
  accounts: readonly Account[];
}

/**
 * Sam (`PRODUCT.md §9`, E011 AC12): a trainer in A, the owner of B and a client of A, the same
 * account with three separate rows. Reusable by any case that must run as someone with a
 * different place in each workspace.
 */
export async function createSam(
  world: World,
  workspaces: { a: string; b: string },
): Promise<{ sam: Actor & { account: Account }; clientInA: string }> {
  const { db } = world.admin;
  const account = await createAccount(db, { label: 'sam' });
  await addTeamRole(db, { workspaceId: workspaces.a, accountId: account.id });
  await addTeamRole(db, { workspaceId: workspaces.b, accountId: account.id, role: 'owner' });
  const client = await addClient(db, { workspaceId: workspaces.a, accountId: account.id });
  return {
    clientInA: client.id,
    sam: {
      name: 'Sam',
      account,
      places: {
        [workspaces.a]: { teamRole: 'trainer', clientId: client.id },
        [workspaces.b]: { teamRole: 'owner' },
      },
    },
  };
}

/**
 * Ends the team role of an actor in a workspace and returns the scenario with the actor's places
 * as they are now: the client relationship, if any, stays. Used for "after the role ends".
 */
export async function withTeamRoleEnded(
  world: World,
  scenario: Scenario,
  actorKey: keyof Scenario['actors'],
  workspaceId: string,
): Promise<Scenario> {
  const actor = scenario.actors[actorKey];
  if (!actor.account) throw new Error(`${actor.name} has no account.`);
  await endTeamRole(world.admin.db, { workspaceId, accountId: actor.account.id });
  const place = actor.places[workspaceId];
  const { teamRole: _ended, ...rest } = place ?? {};
  const places = { ...actor.places };
  if (rest.clientId) places[workspaceId] = rest;
  else delete places[workspaceId];
  return {
    ...scenario,
    actors: {
      ...scenario.actors,
      [actorKey]: {
        ...actor,
        name: `${actor.name} once the team role in ${scenario.labels[workspaceId] ?? workspaceId} ended`,
        places,
      },
    },
  };
}

export async function seedActors(world: World): Promise<Scenario> {
  const { db } = world.admin;
  const a = (await createWorkspace(db)).id;
  const b = (await createWorkspace(db)).id;
  const c = (await createWorkspace(db)).id;
  const accounts: Account[] = [];
  const person = async (label: string) => {
    const account = await createAccount(db, { label });
    accounts.push(account);
    return account;
  };
  const [
    ownerA,
    trainerA,
    clientA,
    otherClientA,
    ownerB,
    trainerB,
    clientB,
    otherClientB,
    outsider,
  ] = await Promise.all(
    [
      'owner-a',
      'trainer-a',
      'client-a',
      'other-client-a',
      'owner-b',
      'trainer-b',
      'client-b',
      'other-client-b',
      'outsider',
    ].map(person),
  );
  if (!ownerA || !trainerA || !clientA || !otherClientA) throw new Error('no accounts');
  if (!ownerB || !trainerB || !clientB || !otherClientB || !outsider)
    throw new Error('no accounts');

  await addTeamRole(db, { workspaceId: a, accountId: ownerA.id, role: 'owner' });
  await addTeamRole(db, { workspaceId: a, accountId: trainerA.id });
  await addTeamRole(db, { workspaceId: b, accountId: ownerB.id, role: 'owner' });
  await addTeamRole(db, { workspaceId: b, accountId: trainerB.id });
  const ownA = await addClient(db, { workspaceId: a, accountId: clientA.id });
  const otherA = await addClient(db, { workspaceId: a, accountId: otherClientA.id });
  const ownB = await addClient(db, { workspaceId: b, accountId: clientB.id });
  const otherB = await addClient(db, { workspaceId: b, accountId: otherClientB.id });

  const { sam, clientInA: samClient } = await createSam(world, { a, b });
  accounts.push(sam.account);
  const otherC = await addClient(db, { workspaceId: c });

  const actor = (name: string, account: Account | undefined, places: Record<string, Place>) => ({
    name,
    account,
    places,
  });
  return {
    a,
    b,
    c,
    labels: { [a]: 'A', [b]: 'B', [c]: 'C' },
    actors: {
      ownerA: actor('A’s owner', ownerA, { [a]: { teamRole: 'owner' } }),
      trainerA: actor('A’s trainer', trainerA, { [a]: { teamRole: 'trainer' } }),
      clientA: actor('A’s client', clientA, { [a]: { clientId: ownA.id } }),
      ownerB: actor('B’s owner', ownerB, { [b]: { teamRole: 'owner' } }),
      trainerB: actor('B’s trainer', trainerB, { [b]: { teamRole: 'trainer' } }),
      clientB: actor('B’s client', clientB, { [b]: { clientId: ownB.id } }),
      sam,
      outsider: actor('an account with no place in A', outsider, {}),
      anonymous: actor('anonymous', undefined, {}),
    },
    clients: {
      a: { own: ownA.id, other: otherA.id, sam: samClient },
      b: { own: ownB.id, other: otherB.id },
      c: { other: otherC.id },
    },
    accounts,
  };
}
