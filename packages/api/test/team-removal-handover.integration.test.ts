import { readFileSync } from 'node:fs';
import {
  authUsers,
  classSeries,
  clients,
  createDatabase,
  type DatabaseClient,
  groupClasses,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClassSeries,
  addClient,
  addGroupClass,
  addParticipants,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import {
  createMemoryTransport,
  createPrivateSessionSender,
  createSendEmail,
  createTrainerChangeSender,
} from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, NO_DEPENDENCIES } from '../src/index.ts';
import { call, groupClassWorld, setupGroupClassApi } from './group-classes-world.ts';

// F023 (spec #459, ticket #537): removing a trainer who still has future sessions hands them over
// through the API, in one transaction. Synthetic people: John (Owner of John's Gym, also trains),
// Sarah (Trainer, leaving), Tom (Trainer, takes over), the clients Anna de Vries (emails in Dutch)
// and Mark Jansen (emails in English), Mike (Owner of Fit Studio, a trainer of another workspace).
// Sarah is also Owner of "Sarah Personal Training". Europe/Amsterdam; "now" is Monday 28 September
// 2026 at 12:00, so *the next 2 weeks* end on Monday 12 October at 12:00.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const amsterdam = (local: string) => zonedTime(local);

interface HandedOver {
  nextTwoWeeks: {
    privateHandedOver: number;
    privateCancelled: number;
    classesHandedOver: number;
    classesTrainerNeeded: number;
  };
  later: { privateTrainerNeeded: number; classesTrainerNeeded: number };
}

describe('F023 hand over a removed trainer’s future sessions', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 12 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const profileOf = async (teamMemberId: string) => {
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, teamMemberId));
    if (!profile) throw new Error('No trainer profile.');
    return profile.id;
  };

  /**
   * John's Gym with Sarah's whole future. In the next 2 weeks: 3 private sessions (Anna on 30
   * September and 8 October, Mark on 2 October) and 4 Kracht dates (29 September and 6 October of
   * the weekly series, 1 and 9 October on their own). Later: 2 private sessions (Anna 20 October,
   * Mark 3 November) and 6 Kracht dates of the series (13 October to 17 November). Before now: a
   * private session and a Kracht date. Anna is booked on Kracht 29 September, 6 and 13 October,
   * Mark on 6 October.
   */
  async function world(overrides: Partial<ApiDependencies> = {}) {
    const people = await groupClassWorld(admin);
    const sarahProfile = await profileOf(people.sarahRole.id);
    const tomProfile = await profileOf(people.tomRole.id);
    const anna = await addClient(admin.db, {
      workspaceId: people.gym.id,
      name: 'Anna de Vries',
      email: 'anna@example.com',
      emailLocale: 'nl-NL',
    });
    const mark = await addClient(admin.db, {
      workspaceId: people.gym.id,
      name: 'Mark Jansen',
      email: 'mark@example.com',
      emailLocale: 'en',
    });
    const transport = createMemoryTransport();
    const sendEmail = createSendEmail({
      transport,
      sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
      replyTo: { email: 'support@example.com' },
      sleep: () => Promise.resolve(),
      random: () => 0,
    });
    const api = setupGroupClassApi(admin, app, {
      sendPrivateSession: createPrivateSessionSender({ sendEmail }),
      sendTrainerChange: createTrainerChangeSender({ sendEmail }),
      ...overrides,
    });

    const workspaceId = people.gym.id;
    const privateSession = (clientId: string, local: string) =>
      addSession(admin.db, {
        workspaceId,
        clientId,
        trainerProfileId: sarahProfile,
        startsAt: amsterdam(local),
      });
    const past = await privateSession(anna.id, '2026-09-21T18:00');
    const near = [
      await privateSession(anna.id, '2026-09-30T18:00'),
      await privateSession(mark.id, '2026-10-02T18:00'),
      await privateSession(anna.id, '2026-10-08T18:00'),
    ];
    const farPrivate = [
      await privateSession(anna.id, '2026-10-20T18:00'),
      await privateSession(mark.id, '2026-11-03T18:00'),
    ];

    const kracht = await addGroupClass(admin.db, {
      workspaceId,
      nameNl: 'Kracht',
      nameEn: 'Strength',
      defaultTrainerProfileId: sarahProfile,
    });
    const series = await addClassSeries(admin.db, {
      workspaceId,
      groupClassId: kracht.id,
      trainerProfileId: sarahProfile,
      startsOn: '2026-09-22',
      materializedUntil: '2026-12-28',
    });
    const date = (local: string, inSeries: boolean) =>
      addSession(admin.db, {
        workspaceId,
        type: 'group',
        groupClassId: kracht.id,
        trainerProfileId: sarahProfile,
        participant: false,
        startsAt: amsterdam(local),
        ...(inSeries ? { series: { id: series.id, occurrenceDate: local.slice(0, 10) } } : {}),
      });
    const pastClass = await date('2026-09-22T18:00', true);
    const nearDates = [
      await date('2026-09-29T18:00', true),
      await date('2026-10-01T18:00', false),
      await date('2026-10-06T18:00', true),
      await date('2026-10-09T18:00', false),
    ];
    const farDates = [];
    for (const day of [
      '2026-10-13',
      '2026-10-20',
      '2026-10-27',
      '2026-11-03',
      '2026-11-10',
      '2026-11-17',
    ]) {
      farDates.push(await date(`${day}T18:00`, true));
    }
    const [firstNear, , thirdNear] = nearDates;
    const [firstFar] = farDates;
    if (!firstNear || !thirdNear || !firstFar) throw new Error('fixture');
    await addParticipants(admin.db, { workspaceId, session: firstNear, clients: [anna] });
    await addParticipants(admin.db, { workspaceId, session: thirdNear, clients: [anna, mark] });
    await addParticipants(admin.db, { workspaceId, session: firstFar, clients: [anna] });

    return {
      ...people,
      ...api,
      transport,
      anna,
      mark,
      sarahProfile,
      tomProfile,
      kracht,
      series,
      past,
      pastClass,
      near,
      farPrivate,
      nearDates,
      farDates,
    };
  }
  type World = Awaited<ReturnType<typeof world>>;

  const teamPath = (w: World, teamMemberId: string) =>
    `/v1/workspaces/${w.gym.id}/team-members/${teamMemberId}`;

  const remove = (
    w: World,
    who: { id: string } | undefined,
    body?: Record<string, unknown>,
    headers?: Record<string, string>,
    teamMemberId: string = w.sarahRole.id,
  ) => call(w.server, 'DELETE', teamPath(w, teamMemberId), who, body, headers);

  const futureSessions = (w: World, who: { id: string } | undefined, teamMemberId?: string) =>
    call(w.server, 'GET', `${teamPath(w, teamMemberId ?? w.sarahRole.id)}/future-sessions`, who);

  const sessionRows = async (workspaceId: string) =>
    new Map(
      (
        await admin.db
          .select()
          .from(sessions)
          .where(eq(sessions.organizationId, workspaceId))
          .orderBy(asc(sessions.startsAt))
      ).map((row) => [row.id, row]),
    );

  const rowOf = async (w: World, id: string) => {
    const row = (await sessionRows(w.gym.id)).get(id);
    if (!row) throw new Error('no such session');
    return row;
  };

  const sarahStillOnTheTeam = async (w: World) =>
    (
      await admin.db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.id, w.sarahRole.id))
    ).length === 1;

  it('AC11: the future sessions of a trainer are counted for the next 2 weeks and for later, this workspace only', async () => {
    const w = await world();
    // Her own business: a session there never counts here (AC4's rule).
    const business = await createWorkspace(admin.db, { label: 'sarah-personal-training' });
    const ownRole = await addTeamRole(admin.db, {
      workspaceId: business.id,
      accountId: w.sarah.id,
      role: 'owner',
      trainsHere: true,
    });
    await addSession(admin.db, {
      workspaceId: business.id,
      trainerProfileId: await profileOf(ownRole.id),
      startsAt: amsterdam('2026-10-01T18:00'),
    });
    // A cancelled session and a session that started never count.
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      trainerProfileId: w.sarahProfile,
      status: 'cancelled',
      startsAt: amsterdam('2026-10-03T18:00'),
    });

    const response = await futureSessions(w, w.john);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      teamMemberId: w.sarahRole.id,
      nextTwoWeeks: { privateSessions: 3, classDates: 4 },
      later: { privateSessions: 2, classDates: 6 },
      regularTrainerOfSeries: true,
      hasFutureSessions: true,
    });
  });

  it('AC11: a trainer with nothing to hand over has zero counts', async () => {
    const w = await world();
    const empty = (teamMemberId: string) => ({
      teamMemberId,
      nextTwoWeeks: { privateSessions: 0, classDates: 0 },
      later: { privateSessions: 0, classDates: 0 },
      regularTrainerOfSeries: false,
      hasFutureSessions: false,
    });

    expect(await (await futureSessions(w, w.john, w.tomRole.id)).json()).toEqual(
      empty(w.tomRole.id),
    );
    // John trains too, and has nothing.
    expect(await (await futureSessions(w, w.john, w.johnRole.id)).json()).toEqual(
      empty(w.johnRole.id),
    );
  });

  it('AC11: a Trainer gets 403, another workspace’s Owner 404, an unknown team member 404, anonymous 401', async () => {
    const w = await world();

    expect((await futureSessions(w, w.tom)).status).toBe(403);
    expect((await futureSessions(w, w.mike)).status).toBe(404);
    expect((await futureSessions(w, w.john, crypto.randomUUID())).status).toBe(404);
    expect((await futureSessions(w, undefined)).status).toBe(401);
    // A team member of another workspace is out of John's reach.
    expect((await futureSessions(w, w.john, w.mikeRole.id)).status).toBe(404);
  });

  it('AC11: removing a trainer with future sessions and no handover answers 409 has_future_sessions with the counts, and nothing changes', async () => {
    const w = await world();
    const before = await sessionRows(w.gym.id);

    const response = await remove(w, w.john);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'has_future_sessions',
      nextTwoWeeks: { privateSessions: 3, classDates: 4 },
      later: { privateSessions: 2, classDates: 6 },
      regularTrainerOfSeries: true,
    });
    expect(await sarahStillOnTheTeam(w)).toBe(true);
    expect(await sessionRows(w.gym.id)).toEqual(before);
    expect(w.transport.sent).toEqual([]);
  });

  it('AC11: being the regular trainer of a series is enough to need a handover, with zero counts', async () => {
    const w = await world();
    // Only the series is left: no date comes after now.
    await admin.db
      .delete(sessionParticipants)
      .where(eq(sessionParticipants.organizationId, w.gym.id));
    await admin.db.delete(sessions).where(eq(sessions.organizationId, w.gym.id));

    const response = await remove(w, w.john);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'has_future_sessions',
      nextTwoWeeks: { privateSessions: 0, classDates: 0 },
      later: { privateSessions: 0, classDates: 0 },
      regularTrainerOfSeries: true,
    });
  });

  it('AC11: a handover to a trainer of another workspace answers 422 and changes nothing', async () => {
    const w = await world();
    const before = await sessionRows(w.gym.id);

    const toMike = await remove(w, w.john, { privateTo: w.mikeRole.id, classesTo: null });
    const classesToMike = await remove(w, w.john, {
      privateTo: w.tomRole.id,
      classesTo: w.mikeRole.id,
    });

    for (const response of [toMike, classesToMike]) {
      expect(response.status).toBe(422);
    }
    expect(await toMike.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'privateTo', code: 'unknown_trainer' }],
    });
    expect(await classesToMike.json()).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'classesTo', code: 'unknown_trainer' }],
    });
    expect(await sarahStillOnTheTeam(w)).toBe(true);
    expect(await sessionRows(w.gym.id)).toEqual(before);
  });

  it('AC11: a handover to the person who is leaving, or to someone who does not train, answers 422', async () => {
    const w = await world();
    const nobodyTrains = await addTeamRole(admin.db, {
      workspaceId: w.gym.id,
      accountId: (await createAccount(admin.db, { label: 'receptionist' })).id,
      role: 'owner',
      trainsHere: false,
    });

    const toSelf = await remove(w, w.john, { privateTo: w.sarahRole.id, classesTo: null });
    const toNonTrainer = await remove(w, w.john, { privateTo: nobodyTrains.id, classesTo: null });

    expect(toSelf.status).toBe(422);
    expect(toNonTrainer.status).toBe(422);
    expect(await sarahStillOnTheTeam(w)).toBe(true);
  });

  it('AC11: a handover body without both targets is a 400, a Trainer’s removal a 403', async () => {
    const w = await world();

    expect((await remove(w, w.john, { privateTo: w.tomRole.id })).status).toBe(400);
    expect((await remove(w, w.tom, { privateTo: w.tomRole.id, classesTo: null })).status).toBe(403);
    expect(await sarahStillOnTheTeam(w)).toBe(true);
  });

  it('AC9: the 3 private sessions go to Tom, the dates and the later sessions get Trainer nodig, the series has no trainer, Sarah is removed and her past stays', async () => {
    const w = await world();

    const response = await remove(w, w.john, { privateTo: w.tomRole.id, classesTo: null });

    expect(response.status).toBe(200);
    expect((await response.json()) as HandedOver).toEqual({
      nextTwoWeeks: {
        privateHandedOver: 3,
        privateCancelled: 0,
        classesHandedOver: 0,
        classesTrainerNeeded: 4,
      },
      later: { privateTrainerNeeded: 2, classesTrainerNeeded: 6 },
    });
    const rows = await sessionRows(w.gym.id);
    const trainerOf = (id: string) => rows.get(id)?.trainerProfileId;
    for (const session of w.near) expect(trainerOf(session.id)).toBe(w.tomProfile);
    for (const session of w.nearDates) expect(trainerOf(session.id)).toBeNull();
    // Later sessions get Trainer nodig and are never cancelled.
    for (const session of [...w.farPrivate, ...w.farDates]) {
      expect(trainerOf(session.id)).toBeNull();
      expect(rows.get(session.id)?.status).toBe('scheduled');
    }
    expect([...rows.values()].filter((row) => row.status === 'cancelled')).toEqual([]);
    // The series has no regular trainer, and neither has the class: dates made later show Trainer nodig.
    const [stored] = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.id, w.series.id));
    expect(stored?.trainerProfileId).toBeNull();
    const [kracht] = await admin.db
      .select()
      .from(groupClasses)
      .where(eq(groupClasses.id, w.kracht.id));
    expect(kracht?.defaultTrainerProfileId).toBeNull();
    // A date of the series that went to Trainer nodig matches its series: nothing marked on it.
    expect(rows.get(w.nearDates[0]?.id ?? '')?.detachedFields).toEqual([]);

    // Sarah is off the team, her account stays; her past sessions still show Sarah.
    expect(await sarahStillOnTheTeam(w)).toBe(false);
    expect(
      await admin.db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.id, w.sarah.id)),
    ).toHaveLength(1);
    expect(trainerOf(w.past.id)).toBe(w.sarahProfile);
    expect(trainerOf(w.pastClass.id)).toBe(w.sarahProfile);
    const shown = await call(
      w.server,
      'GET',
      `/v1/workspaces/${w.gym.id}/sessions/${w.past.id}`,
      w.john,
    );
    expect(shown.status).toBe(200);
    expect(((await shown.json()) as { trainer?: { id: string; name: string } }).trainer).toEqual({
      id: w.sarahRole.id,
      name: 'Sarah',
    });
    // She is no trainer to pick any more.
    const trainers = await call(w.server, 'GET', `/v1/workspaces/${w.gym.id}/trainers`, w.john);
    expect(((await trainers.json()) as { id: string }[]).map(({ id }) => id)).not.toContain(
      w.sarahRole.id,
    );
  });

  it('AC9: the changed sessions raise their version and say who changed them', async () => {
    const w = await world();
    const before = await rowOf(w, w.near[0]?.id ?? '');

    await remove(w, w.john, { privateTo: w.tomRole.id, classesTo: null });

    const after = await rowOf(w, w.near[0]?.id ?? '');
    expect(after.version).toBe(before.version + 1);
    expect(after.updatedByTeamMemberId).toBe(w.johnRole.id);
  });

  it('AC9: the next 2 weeks’ class dates go to a trainer; a date of the series is marked as having its own trainer, one on its own is not', async () => {
    const w = await world();

    const response = await remove(w, w.john, { privateTo: w.tomRole.id, classesTo: w.tomRole.id });

    expect(response.status).toBe(200);
    expect(((await response.json()) as HandedOver).nextTwoWeeks).toEqual({
      privateHandedOver: 3,
      privateCancelled: 0,
      classesHandedOver: 4,
      classesTrainerNeeded: 0,
    });
    const rows = await sessionRows(w.gym.id);
    const [first, own, third, ownToo] = w.nearDates;
    for (const date of w.nearDates) expect(rows.get(date.id)?.trainerProfileId).toBe(w.tomProfile);
    expect(rows.get(first?.id ?? '')?.detachedFields).toEqual(['trainer']);
    expect(rows.get(third?.id ?? '')?.detachedFields).toEqual(['trainer']);
    expect(rows.get(own?.id ?? '')?.detachedFields).toEqual([]);
    expect(rows.get(ownToo?.id ?? '')?.detachedFields).toEqual([]);
    // Later dates still get Trainer nodig, whatever the body says.
    for (const date of w.farDates) expect(rows.get(date.id)?.trainerProfileId).toBeNull();
  });

  it('AC9: handover and removal are one transaction: a failure on the way leaves everything as it was', async () => {
    // The removal tracks `team_member_removed` as its last step before the commit: failing there
    // fails the request after every session was handed over.
    const failing = await world({
      productEvents: {
        ...NO_DEPENDENCIES.productEvents,
        track: () => {
          throw new Error('the product events are down');
        },
      },
    });
    const before = await sessionRows(failing.gym.id);

    const response = await remove(failing, failing.john, {
      privateTo: failing.tomRole.id,
      classesTo: failing.tomRole.id,
    });

    expect(response.status).toBe(500);
    expect(await sarahStillOnTheTeam(failing)).toBe(true);
    expect(await sessionRows(failing.gym.id)).toEqual(before);
    const [stored] = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.id, failing.series.id));
    expect(stored?.trainerProfileId).toBe(failing.sarahProfile);
    const [profile] = await admin.db
      .select()
      .from(trainerProfiles)
      .where(eq(trainerProfiles.id, failing.sarahProfile));
    expect(profile?.removedAt).toBeNull();
    expect(failing.transport.sent).toEqual([]);
  });

  it('AC9a: with Niemand the next 2 weeks’ private sessions are cancelled with the email in each client’s language, the later ones get Trainer nodig and stay', async () => {
    const w = await world();

    const response = await remove(w, w.john, { privateTo: null, classesTo: null });

    expect(response.status).toBe(200);
    const body = (await response.json()) as HandedOver;
    expect(body.nextTwoWeeks).toEqual({
      privateHandedOver: 0,
      privateCancelled: 3,
      classesHandedOver: 0,
      classesTrainerNeeded: 4,
    });
    expect(body.later).toEqual({ privateTrainerNeeded: 2, classesTrainerNeeded: 6 });
    const rows = await sessionRows(w.gym.id);
    for (const session of w.near) {
      const row = rows.get(session.id);
      expect(row?.status).toBe('cancelled');
      expect(row?.cancellationInitiator).toBe('workspace');
      expect(row?.cancelledAt).toEqual(new Date('2026-09-28T10:00:00.000Z'));
      expect(row?.cancelledByTeamMemberId).toBe(w.johnRole.id);
    }
    for (const session of w.farPrivate) {
      expect(rows.get(session.id)?.status).toBe('scheduled');
      expect(rows.get(session.id)?.trainerProfileId).toBeNull();
    }
    // The places of the cancelled sessions are cancelled too.
    const places = await admin.db
      .select()
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, w.near[0]?.id ?? ''));
    expect(places.map((place) => place.attendanceStatus)).toEqual(['cancelled']);
    // F026's email, one for each cancelled session and client, in their language.
    expect(w.transport.sent.map((email) => [email.to.email, email.locale]).sort()).toEqual([
      ['anna@example.com', 'nl-NL'],
      ['anna@example.com', 'nl-NL'],
      ['mark@example.com', 'en'],
    ]);
    const toMark = w.transport.sent.find((email) => email.to.email === 'mark@example.com');
    expect(toMark?.subject).toBe('Your session on Friday 2 October at 18:00 has been cancelled');
    const toAnna = w.transport.sent.find(
      (email) =>
        email.to.email === 'anna@example.com' && email.subject.includes('woensdag 30 september'),
    );
    expect(toAnna?.subject).toBe('Je sessie op woensdag 30 september om 18:00 is geannuleerd');
    // Nobody is told about a Trainer nodig session.
    expect(w.transport.sent.filter((email) => email.subject.includes('20 oktober'))).toEqual([]);
  });

  it('AC9a: with the box unchecked a cancelled session is cancelled without a word', async () => {
    const w = await world();

    const response = await remove(w, w.john, {
      privateTo: null,
      classesTo: null,
      notifyClients: false,
    });

    expect(response.status).toBe(200);
    expect((await rowOf(w, w.near[0]?.id ?? '')).status).toBe('cancelled');
    expect(w.transport.sent).toEqual([]);
  });

  it('AC18: with Klanten informeren Anna and Mark get one trainer-change email each for their handed-over sessions, Trainer nodig dates send nothing', async () => {
    const w = await world();

    const response = await remove(w, w.john, { privateTo: w.tomRole.id, classesTo: null });

    expect(response.status).toBe(200);
    expect(w.transport.sent).toHaveLength(2);
    const toAnna = w.transport.sent.find((email) => email.to.email === 'anna@example.com');
    const toMark = w.transport.sent.find((email) => email.to.email === 'mark@example.com');
    expect(toAnna).toMatchObject({
      locale: 'nl-NL',
      subject: 'Andere trainer: je sessie op woensdag 30 september',
    });
    expect(toAnna?.text).toContain('woensdag 30 september 2026, 18:00 tot 19:00');
    expect(toAnna?.text).toContain('donderdag 8 oktober 2026, 18:00 tot 19:00');
    expect(toAnna?.text).toContain('Je traint nu met Tom.');
    expect(toAnna?.text).not.toContain('20 oktober');
    expect(toMark).toMatchObject({
      locale: 'en',
      subject: 'New trainer: your session on Friday 2 October',
    });
    expect(toMark?.text).toContain("You'll now train with Tom.");
    // Neither names the other, and each is sent once: a key of its own.
    expect(toAnna?.text).not.toContain('Mark');
    expect(toMark?.text).not.toContain('Anna');
    expect(new Set(w.transport.sent.map((email) => email.idempotencyKey)).size).toBe(2);
  });

  it('AC18: handing the classes to a trainer emails the booked participants of those dates, not those of the later dates', async () => {
    const w = await world();

    const response = await remove(w, w.john, { privateTo: w.tomRole.id, classesTo: w.tomRole.id });

    expect(response.status).toBe(200);
    // Anna: her private sessions and, apart, Kracht 29 September and 6 October; Mark: his private
    // session and Kracht 6 October. Anna's place on 13 October (later: Trainer nodig) sends nothing.
    const classEmails = w.transport.sent.filter((email) => /Kracht|Strength/.test(email.subject));
    expect(classEmails.map((email) => email.to.email).sort()).toEqual([
      'anna@example.com',
      'mark@example.com',
    ]);
    const classToAnna = classEmails.find((email) => email.to.email === 'anna@example.com');
    expect(classToAnna?.text).toContain('dinsdag 29 september 2026');
    expect(classToAnna?.text).toContain('dinsdag 6 oktober 2026');
    expect(classToAnna?.text).not.toContain('13 oktober');
    expect(w.transport.sent).toHaveLength(4);
    expect(new Set(w.transport.sent.map((email) => email.idempotencyKey)).size).toBe(4);
  });

  it('AC18: unchecked, nothing is sent', async () => {
    const w = await world();

    const response = await remove(w, w.john, {
      privateTo: w.tomRole.id,
      classesTo: w.tomRole.id,
      notifyClients: false,
    });

    expect(response.status).toBe(200);
    expect(w.transport.sent).toEqual([]);
    expect((await rowOf(w, w.near[0]?.id ?? '')).trainerProfileId).toBe(w.tomProfile);
  });

  it('AC18: a duo session handed over emails both clients once', async () => {
    const w = await world();
    const eva = await addClient(admin.db, {
      workspaceId: w.gym.id,
      name: 'Eva Bakker',
      email: 'eva@example.com',
      emailLocale: 'nl-NL',
    });
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.anna.id,
      secondClientId: eva.id,
      trainerProfileId: w.sarahProfile,
      startsAt: amsterdam('2026-10-07T09:00'),
    });

    await remove(w, w.john, { privateTo: w.tomRole.id, classesTo: null });

    expect(w.transport.sent.filter((email) => email.to.email === 'eva@example.com')).toHaveLength(
      1,
    );
    expect(w.transport.sent.filter((email) => email.to.email === 'anna@example.com')).toHaveLength(
      1,
    );
  });

  it('AC9: her sessions in another workspace stay: only John’s Gym’s are handed over', async () => {
    const w = await world();
    const business = await createWorkspace(admin.db, { label: 'sarah-personal-training' });
    const ownRole = await addTeamRole(admin.db, {
      workspaceId: business.id,
      accountId: w.sarah.id,
      role: 'owner',
      trainsHere: true,
    });
    const ownProfile = await profileOf(ownRole.id);
    const hers = await addSession(admin.db, {
      workspaceId: business.id,
      trainerProfileId: ownProfile,
      startsAt: amsterdam('2026-10-01T18:00'),
    });

    await remove(w, w.john, { privateTo: w.tomRole.id, classesTo: null });

    expect((await sessionRows(business.id)).get(hers.id)?.trainerProfileId).toBe(ownProfile);
    expect(
      await admin.db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.id, ownRole.id)),
    ).toHaveLength(1);
  });

  it('AC9: a trainer with only past sessions is removed at once and the past keeps their name', async () => {
    const w = await world();
    await admin.db
      .delete(sessionParticipants)
      .where(eq(sessionParticipants.organizationId, w.gym.id));
    await admin.db.delete(sessions).where(eq(sessions.organizationId, w.gym.id));
    const earlier = await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.anna.id,
      trainerProfileId: w.sarahProfile,
      startsAt: amsterdam('2026-09-21T18:00'),
    });
    await admin.db
      .update(classSeries)
      .set({ endsOn: '2026-09-25' })
      .where(eq(classSeries.id, w.series.id));

    const response = await remove(w, w.john);

    expect(response.status).toBe(204);
    expect((await rowOf(w, earlier.id)).trainerProfileId).toBe(w.sarahProfile);
    const [profile] = await admin.db
      .select()
      .from(trainerProfiles)
      .where(eq(trainerProfiles.id, w.sarahProfile));
    expect(profile).toMatchObject({
      teamMemberId: null,
      removedTeamMemberId: w.sarahRole.id,
      removedName: 'Sarah',
    });
    expect(profile?.removedAt).toBeInstanceOf(Date);
  });

  it('AC9: a person who is not a trainer is removed with or without a handover body, with zero counts', async () => {
    const w = await world();
    const plain = await addTeamRole(admin.db, {
      workspaceId: w.gym.id,
      accountId: (await createAccount(admin.db, { label: 'plain-owner' })).id,
      role: 'owner',
      trainsHere: false,
    });

    const response = await remove(
      w,
      w.john,
      { privateTo: w.tomRole.id, classesTo: null },
      undefined,
      plain.id,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      nextTwoWeeks: {
        privateHandedOver: 0,
        privateCancelled: 0,
        classesHandedOver: 0,
        classesTrainerNeeded: 0,
      },
      later: { privateTrainerNeeded: 0, classesTrainerNeeded: 0 },
    });
    expect(
      await admin.db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.id, plain.id)),
    ).toEqual([]);
  });

  it('AC9: a client who is also Sarah keeps their client record after the removal', async () => {
    const w = await world();
    const asClient = await addClient(admin.db, {
      workspaceId: w.gym.id,
      accountId: w.sarah.id,
      name: 'Sarah als klant',
    });

    await remove(w, w.john, { privateTo: w.tomRole.id, classesTo: null });

    expect(
      await admin.db.select({ id: clients.id }).from(clients).where(eq(clients.id, asClient.id)),
    ).toHaveLength(1);
  });

  it('AC16: trainer_handover has the workspace ID and the platform only; a plain removal and a refusal record no handover', async () => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const bearer = { authorization: 'Bearer synthetic-token' };
    const handovers = () => posthog.events.filter(({ event }) => event === 'trainer_handover');
    const properties = () =>
      handovers().map((event) =>
        Object.fromEntries(
          Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
        ),
      );

    // From the web: no bearer token.
    const web = await world({ productEvents });
    await remove(web, web.john);
    await remove(web, web.john, { privateTo: web.mikeRole.id, classesTo: null });
    expect(handovers()).toEqual([]);
    expect(
      (await remove(web, web.john, { privateTo: web.tomRole.id, classesTo: null })).status,
    ).toBe(200);
    // From the iOS app, naming its surface; from an app that names none: nothing.
    const ios = await world({ productEvents });
    expect(
      (
        await remove(
          ios,
          ios.john,
          { privateTo: ios.tomRole.id, classesTo: null, surface: 'ios' },
          bearer,
        )
      ).status,
    ).toBe(200);
    const silent = await world({ productEvents });
    expect(
      (await remove(silent, silent.john, { privateTo: silent.tomRole.id, classesTo: null }, bearer))
        .status,
    ).toBe(200);

    expect(properties()).toEqual([
      { workspace_id: web.gym.id, platform: 'web' },
      { workspace_id: ios.gym.id, platform: 'ios' },
    ]);
    expect(handovers()[0]?.distinct_id).toBe(web.john.id);
    const sent = JSON.stringify(handovers());
    for (const personal of ['Anna', 'Mark', 'Sarah', 'Tom', web.sarahRole.id, web.tomRole.id]) {
      expect(sent).not.toContain(personal);
    }
    // The removal's own event is unchanged: the workspace ID only.
    const removed = posthog.events.filter(({ event }) => event === 'team_member_removed');
    expect(removed.length).toBeGreaterThan(0);
    for (const log of logs) log.mockRestore();
  });

  it('AC15: the routes, the handover body and the codes are in the committed contract with their access', () => {
    const futureSessionsOperation =
      contract.paths['/v1/workspaces/{workspaceId}/team-members/{teamMemberId}/future-sessions']
        ?.get;
    const removeOperation =
      contract.paths['/v1/workspaces/{workspaceId}/team-members/{teamMemberId}']?.delete;

    expect(futureSessionsOperation['x-access']).toMatchObject({ type: 'workspace' });
    expect(removeOperation['x-access']).toMatchObject({ type: 'workspace' });
    expect(removeOperation.requestBody.required).toBeFalsy();
    expect(Object.keys(removeOperation.responses)).toEqual(
      expect.arrayContaining(['200', '204', '400', '409', '422']),
    );
    const schemas = contract.components.schemas;
    expect(schemas.RemoveTeamMemberRefusal.properties.code.enum).toEqual([
      'last_owner',
      'has_future_sessions',
    ]);
    expect(Object.keys(schemas.TeamMemberHandover.properties)).toEqual(['nextTwoWeeks', 'later']);
  });
});
