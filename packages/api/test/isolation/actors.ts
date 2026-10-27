import type { Place } from '@fivvi/database';
import { addClient, addTeamRole, createAccount, createWorkspace } from '@fivvi/database/testing';
import type { World } from './harness.ts';

// The standard actors of the isolation suite (E011, spec #145) and the data they stand on: two
// workspaces, A (the one under test) and B (the attacker's). Sam, who has a place in both, is the
// scenario of #257; none of these actors has a place in two workspaces, so a token of A's data is
// A's and nobody else's.

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
      | 'outsider'
      | 'anonymous',
      Actor
    >
  >;
  /** The clients of each workspace: the one with the `client` actor's account, and another. */
  clients: Readonly<Record<'a' | 'b', { own: string; other: string }>>;
  /** Every account created, to search a response for their emails and markers. */
  accounts: readonly Account[];
}

export async function seedActors(world: World): Promise<Scenario> {
  const { db } = world.admin;
  const a = (await createWorkspace(db)).id;
  const b = (await createWorkspace(db)).id;
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

  const actor = (name: string, account: Account | undefined, places: Record<string, Place>) => ({
    name,
    account,
    places,
  });
  return {
    a,
    b,
    labels: { [a]: 'A', [b]: 'B' },
    actors: {
      ownerA: actor('A’s owner', ownerA, { [a]: { teamRole: 'owner' } }),
      trainerA: actor('A’s trainer', trainerA, { [a]: { teamRole: 'trainer' } }),
      clientA: actor('A’s client', clientA, { [a]: { clientId: ownA.id } }),
      ownerB: actor('B’s owner', ownerB, { [b]: { teamRole: 'owner' } }),
      trainerB: actor('B’s trainer', trainerB, { [b]: { teamRole: 'trainer' } }),
      clientB: actor('B’s client', clientB, { [b]: { clientId: ownB.id } }),
      outsider: actor('an account with no place in A', outsider, {}),
      anonymous: actor('anonymous', undefined, {}),
    },
    clients: { a: { own: ownA.id, other: otherA.id }, b: { own: ownB.id, other: otherB.id } },
    accounts,
  };
}
