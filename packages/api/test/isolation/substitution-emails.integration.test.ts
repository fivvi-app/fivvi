import { organizations, sessions, teamMembers, trainerProfiles } from '@fivvi/database';
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
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Scenario, seedActors } from './actors.ts';
import { createWorld, type World } from './harness.ts';
import { buildLedger, businessTables, readRows } from './suite.ts';

// The isolation suite for the emails of a substitution (F024, ticket #1635, bug #1638): the sweep
// of `suite.ts` calls `assignTrainer` on a private session with `notifyClients: false`, so it never
// reaches the substitution path. This is its case for the other path: `scope: 'this'` on a class
// date that has a trainer and a booked client, with both boxes left on, for a date that has not
// started. It reads what the harness's memory transports kept (EM-10 to the substitute and EM-13 to
// the participant) and holds it against the ids and markers of the other workspace, and it calls
// the route from the other workspace to see that nothing is sent. What an email must not hold is
// everything the other workspace has: the index of every record's ids and markers that the sweep
// builds (`buildLedger`), plus what the hand-made records of this file add.

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

  /**
   * A class date with a trainer (the one of `trainerAccountId`) and a booked client, and another
   * trainer who will cover it. `markers` hold only what this side made; `pair` adds the rest.
   */
  async function sideOf(workspaceId: string, trainerAccountId: string): Promise<Side> {
    const { db } = world.admin;
    const [workspace] = await db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, workspaceId));
    // The profile of this trainer, not whichever the database returns first: A has two (Sam's too).
    const [profile] = await db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .innerJoin(
        teamMembers,
        and(
          eq(teamMembers.organizationId, trainerProfiles.organizationId),
          eq(teamMembers.id, trainerProfiles.teamMemberId),
        ),
      )
      .where(
        and(
          eq(trainerProfiles.organizationId, workspaceId),
          eq(teamMembers.accountId, trainerAccountId),
        ),
      );
    if (!workspace || !profile) throw new Error('The workspace has no such trainer.');
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

  /**
   * A fresh class date in each workspace, each with the markers of everything the other workspace
   * holds now: every id and marker of every one of its rows (its owner, its other clients, its
   * accounts), read after both dates exist. A token both workspaces hold (Sam's account) is no
   * mark of either.
   */
  async function pair(): Promise<{ a: Side; b: Side }> {
    const sideA = await sideOf(scenario.a, scenario.actors.trainerA.account?.id ?? '');
    const sideB = await sideOf(scenario.b, scenario.actors.trainerB.account?.id ?? '');
    const ledger = buildLedger(await readRows(world, await businessTables(world)), scenario);
    const tokensOf = (workspaceId: string) =>
      [...ledger]
        .filter(([, owners]) => owners.length === 1 && owners[0]?.workspaceId === workspaceId)
        .map(([token]) => token);
    sideA.markers = [...new Set([...sideA.markers, ...tokensOf(sideA.workspaceId)])];
    sideB.markers = [...new Set([...sideB.markers, ...tokensOf(sideB.workspaceId)])];
    return { a: sideA, b: sideB };
  }

  beforeAll(async () => {
    world = await createWorld({ observe: false });
    scenario = await seedActors(world);
    ({ a, b } = await pair());
  });

  afterAll(async () => {
    await world?.close();
  });

  const sent = () => [...world.outbox.substitution.sent, ...world.outbox.trainerChange.sent];
  /** What went out since `before` was taken, so a case holds when it runs alone or after another. */
  const sentSince = (before: readonly CapturedEmail[]) =>
    sent().filter((email) => !before.includes(email));

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
    // The index reaches what the hand-made markers do not: B's owner and its other client.
    const { ownerB } = scenario.actors;
    const others = {
      to: { email: 'x@example.com' },
      text: `${ownerB.account?.email} ${scenario.clients.b.other}`,
    };
    expect(leaksOf([others as unknown as CapturedEmail], b.markers)).toEqual(
      expect.arrayContaining([ownerB.account?.email, scenario.clients.b.other]),
    );
    expect(leaksOf([others as unknown as CapturedEmail], a.markers)).toEqual([]);
  });

  it('a caller from another workspace gets 404 and nothing is sent, and the date stays as it was', async () => {
    const { ownerB, outsider, clientA, anonymous } = scenario.actors;
    const before = await dateOf(a.session);
    const emailsBefore = sent();

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

    expect(sentSince(emailsBefore)).toEqual([]);
    expect(await dateOf(a.session)).toEqual(before);
    expect(await dateOf(b.session)).toMatchObject({ version: 1 });
  });

  it('A’s owner substitutes on A’s class date: EM-10 and the participant’s email go out, and hold nothing of B', async () => {
    const owner = scenario.actors.ownerA.account;
    const emailsBefore = sent();

    const response = await substitute(owner, a.workspaceId, a);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ clientsNotified: 1 });
    // The substitute gets EM-10 and the booked client the trainer-change email: one each, no more.
    const fresh = sentSince(emailsBefore);
    expect(
      fresh.filter((email) => email.template === 'substitution').map((email) => email.to.email),
    ).toEqual([a.substitute.account.email]);
    expect(
      fresh.filter((email) => email.template === 'trainer-change').map((email) => email.to.email),
    ).toEqual([a.client.email]);
    expect(fresh).toHaveLength(2);
    // They are about A's class, A's workspace, A's substitute and the trainer being replaced.
    const em10 = fresh.find((email) => email.template === 'substitution');
    const em13 = fresh.find((email) => email.template === 'trainer-change');
    expect(em10?.text).toContain(a.className);
    expect(em10?.text).toContain(a.workspaceName);
    expect(em10?.text).toContain(a.trainer.account.marker);
    expect(em13?.text).toContain(a.className);
    expect(em13?.text).toContain(a.substitute.account.marker);
    // Nothing of B's is in any part of any email: not an id, a name, an address or the class.
    expect(leaksOf(fresh, b.markers)).toEqual([]);
  });

  it('B’s owner substitutes on B’s date next: B’s people get theirs, and A’s emails stay A’s', async () => {
    // Its own two dates, so it holds when it runs alone: A's first, then B's.
    const { a: sideA, b: sideB } = await pair();
    const start = sent();
    const responseA = await substitute(scenario.actors.ownerA.account, sideA.workspaceId, sideA);
    expect(responseA.status).toBe(200);
    const aEmails = sentSince(start);
    expect(aEmails).toHaveLength(2);

    const response = await substitute(scenario.actors.ownerB.account, sideB.workspaceId, sideB);

    expect(response.status).toBe(200);
    const fresh = sentSince([...start, ...aEmails]);
    expect(fresh.map((email) => email.to.email).toSorted()).toEqual(
      [sideB.substitute.account.email, sideB.client.email].toSorted(),
    );
    expect(fresh.find((email) => email.template === 'substitution')?.text).toContain(
      sideB.trainer.account.marker,
    );
    // What B's call sent holds nothing of A, and what A's call sent still holds nothing of B.
    expect(leaksOf(fresh, sideA.markers)).toEqual([]);
    expect(leaksOf(aEmails, sideB.markers)).toEqual([]);
  });
});
