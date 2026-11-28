import { organizations, sessions, trainerProfiles } from '@fivvi/database';
import {
  addClient,
  addGroupClass,
  addParticipants,
  addSession,
  addTeamRole,
  createAccount,
  uniqueMarker,
} from '@fivvi/database/testing';
import type { CapturedEmail } from '@fivvi/email';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Scenario, seedActors } from './actors.ts';
import { createWorld, type World } from './harness.ts';

// The isolation suite for the emails of a substitution (F024, ticket #1635, bug #1638): the sweep
// of `suite.ts` calls `assignTrainer` on a private session with `notifyClients: false`, so it never
// reaches the substitution path. This is its case for the other path: `scope: 'this'` on a class
// date that has a trainer and a booked client, with both boxes left on, for a date that has not
// started. It reads what the harness's memory transports kept (EM-10 to the substitute and EM-13 to
// the participant) and holds it against the ids and markers of the other workspace, and it calls
// the route from the other workspace to see that nothing is sent.

interface Side {
  workspaceId: string;
  workspaceName: string;
  slug: string;
  className: string;
  session: string;
  trainer: { account: { id: string; email: string; marker: string } };
  substitute: { id: string; account: { id: string; email: string; marker: string } };
  client: { id: string; name: string; email: string };
  /** Everything a response or an email of another workspace must not hold. */
  markers: string[];
}

/** The markers of `side` that appear in any part of `emails`, for the check below. */
function leaksOf(emails: readonly CapturedEmail[], markers: readonly string[]): string[] {
  const text = JSON.stringify(emails);
  return markers.filter((marker) => text.includes(marker));
}

describe('@isolation F024 the emails of a substitution, in the isolation suite', () => {
  let world: World;
  let scenario: Scenario;
  let a: Side;
  let b: Side;

  /** A class date a week from now with a trainer and a booked client, and the trainer who will cover. */
  async function sideOf(workspaceId: string, trainerAccountId: string): Promise<Side> {
    const { db } = world.admin;
    const [workspace] = await db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, workspaceId));
    const [profile] = await db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.organizationId, workspaceId));
    if (!workspace || !profile) throw new Error('The workspace has no trainer.');
    const groupClass = await addGroupClass(db, { workspaceId });
    const date = await addSession(db, {
      workspaceId,
      type: 'group',
      groupClassId: groupClass.id,
      trainerProfileId: profile.id,
      participant: false,
    });
    const clientMarker = uniqueMarker('participant');
    const client = await addClient(db, {
      workspaceId,
      name: clientMarker,
      email: `${clientMarker}@example.com`,
    });
    await addParticipants(db, { workspaceId, session: date, clients: [client] });
    const account = await createAccount(db, { label: 'substitute' });
    const member = await addTeamRole(db, { workspaceId, accountId: account.id });
    const trainerAccount = scenario.accounts.find(({ id }) => id === trainerAccountId);
    if (!trainerAccount) throw new Error('no trainer account');
    return {
      workspaceId,
      workspaceName: workspace.name,
      slug: workspace.slug,
      className: groupClass.nameNl,
      session: date.id,
      trainer: { account: trainerAccount },
      substitute: { id: member.id, account },
      client: { id: client.id, name: client.name, email: `${clientMarker}@example.com` },
      markers: [
        workspaceId,
        workspace.name,
        workspace.slug,
        groupClass.nameNl,
        date.id,
        client.id,
        client.name,
        `${clientMarker}@example.com`,
        trainerAccount.email,
        trainerAccount.marker,
        account.email,
        account.marker,
      ],
    };
  }

  beforeAll(async () => {
    world = await createWorld({ observe: false });
    scenario = await seedActors(world);
    a = await sideOf(scenario.a, scenario.actors.trainerA.account?.id ?? '');
    b = await sideOf(scenario.b, scenario.actors.trainerB.account?.id ?? '');
  });

  afterAll(async () => {
    await world?.close();
  });

  const sent = () => [...world.outbox.substitution.sent, ...world.outbox.trainerChange.sent];

  /** The Owner substitutes the date's trainer for the other trainer, `scope: this`, both boxes left on. */
  const substitute = (
    caller: { id: string } | undefined,
    inPath: string,
    side: { session: string; substitute: { id: string } },
  ) =>
    world.request(caller, `/v1/workspaces/${inPath}/sessions/${side.session}/trainer`, {
      method: 'POST',
      body: { trainerId: side.substitute.id, scope: 'this', version: 1, allowConflicts: true },
    });

  const dateOf = async (session: string) => {
    const [row] = await world.admin.db
      .select({ trainerProfileId: sessions.trainerProfileId, version: sessions.version })
      .from(sessions)
      .where(eq(sessions.id, session));
    return row;
  };

  it('the check finds a marker of the other workspace in an email', () => {
    const planted = { to: { email: 'x@example.com' }, text: `Hoi ${b.client.name}` };
    expect(leaksOf([planted as unknown as CapturedEmail], b.markers)).toEqual([b.client.name]);
    expect(leaksOf([planted as unknown as CapturedEmail], a.markers)).toEqual([]);
  });

  it('a caller from another workspace gets 404 and nothing is sent, and the date stays as it was', async () => {
    const { ownerB, outsider, clientA, anonymous } = scenario.actors;
    const before = await dateOf(a.session);

    // B's owner names A's date, A's substitute, in A's path and in B's own.
    for (const inPath of [a.workspaceId, b.workspaceId]) {
      const response = await substitute(ownerB.account, inPath, a);
      expect(response.status, `in ${inPath === a.workspaceId ? 'A' : 'B'}`).toBe(404);
    }
    // B's owner on B's own date, naming A's trainer to cover: not a trainer of B's workspace.
    expect(
      (await substitute(ownerB.account, b.workspaceId, { ...b, substitute: a.substitute })).status,
    ).toBe(404);
    // And A's owner names B's date in A's path.
    expect((await substitute(scenario.actors.ownerA.account, a.workspaceId, b)).status).toBe(404);
    // Someone with no place in A, a client of A and the anonymous caller never reach the route's work.
    for (const actor of [outsider, clientA, anonymous]) {
      const response = await substitute(actor.account, a.workspaceId, a);
      expect([401, 403, 404], actor.name).toContain(response.status);
    }

    expect(sent()).toEqual([]);
    expect(await dateOf(a.session)).toEqual(before);
    expect(await dateOf(b.session)).toMatchObject({ version: 1 });
  });

  it('A’s owner substitutes on A’s class date: EM-10 and the participant’s email go out, and hold nothing of B', async () => {
    const owner = scenario.actors.ownerA.account;

    const response = await substitute(owner, a.workspaceId, a);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ clientsNotified: 1 });
    // The substitute gets EM-10 and the booked client the trainer-change email: one each, no more.
    expect(world.outbox.substitution.sent.map((email) => [email.template, email.to.email])).toEqual(
      [['substitution', a.substitute.account.email]],
    );
    expect(
      world.outbox.trainerChange.sent.map((email) => [email.template, email.to.email]),
    ).toEqual([['trainer-change', a.client.email]]);
    // They are about A's class, A's workspace and A's substitute.
    const [em10] = world.outbox.substitution.sent;
    const [em13] = world.outbox.trainerChange.sent;
    expect(em10?.text).toContain(a.className);
    expect(em10?.text).toContain(a.workspaceName);
    expect(em13?.text).toContain(a.className);
    expect(em13?.text).toContain(a.substitute.account.marker);
    // Nothing of B's is in any part of any email: not an id, a name, an address or the class.
    expect(leaksOf(sent(), b.markers)).toEqual([]);
  });

  it('B’s owner substitutes on B’s date next: B’s people get theirs, and A’s emails stay A’s', async () => {
    const aEmails = [...sent()];
    const owner = scenario.actors.ownerB.account;

    const response = await substitute(owner, b.workspaceId, b);

    expect(response.status).toBe(200);
    const fresh = sent().filter((email) => !aEmails.includes(email));
    expect(fresh.map((email) => email.to.email).toSorted()).toEqual(
      [b.substitute.account.email, b.client.email].toSorted(),
    );
    // What B's call sent holds nothing of A, and what A's call sent still holds nothing of B.
    expect(leaksOf(fresh, a.markers)).toEqual([]);
    expect(leaksOf(aEmails, b.markers)).toEqual([]);
  });
});
