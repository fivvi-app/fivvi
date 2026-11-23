import { readFileSync } from 'node:fs';
import {
  authUsers,
  classSeries,
  createDatabase,
  type DatabaseClient,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import {
  addClient,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '@fivvi/database/testing';
import { createMemoryTransport, createSendEmail, createTrainerChangeSender } from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { zonedTime } from '@fivvi/testing/clock';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiDependencies } from '../src/index.ts';
import {
  type CreatedClassBody,
  call,
  createClass,
  groupClassWorld,
  kracht,
  readSession,
  type SessionBody,
  scheduleClass,
  setupGroupClassApi,
} from './group-classes-world.ts';

// F023 (spec #459): the isolation and the events of the double-booking check (ticket #535). Synthetic
// people: John (Owner of John's Gym, also trains), Sarah and Tom (Trainers), Sarah also Owner of
// "Sarah Personal Training", the clients Anna de Vries and Mark Jansen. Europe/Amsterdam; "now" is
// Monday 28 September 2026.

const amsterdam = (local: string) => zonedTime(local);

describe('F023 trainer assignment: the double-booking check', () => {
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

  async function world(overrides = {}) {
    const people = await groupClassWorld(admin);
    const anna = await addClient(admin.db, { workspaceId: people.gym.id, name: 'Anna de Vries' });
    const mark = await addClient(admin.db, { workspaceId: people.gym.id, name: 'Mark Jansen' });
    const profileOf = async (teamMemberId: string) => {
      const [profile] = await admin.db
        .select({ id: trainerProfiles.id })
        .from(trainerProfiles)
        .where(eq(trainerProfiles.teamMemberId, teamMemberId));
      if (!profile) throw new Error('No trainer profile.');
      return profile.id;
    };
    return {
      ...people,
      anna,
      mark,
      profileOf,
      ...setupGroupClassApi(admin, app, overrides),
    };
  }

  const plan = (
    w: Awaited<ReturnType<typeof world>>,
    who: { id: string },
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) =>
    call(
      w.server,
      'POST',
      `/v1/workspaces/${w.gym.id}/sessions/private`,
      who,
      {
        clientId: w.anna.id,
        trainerId: w.sarahRole.id,
        localDate: '2026-10-06',
        localStart: '18:00',
        durationMinutes: 60,
        notify: false,
        ...body,
      },
      headers,
    );

  it('AC4: Sarah’s session in Sarah Personal Training never shows up in John’s Gym: no 409, no name, no ID', async () => {
    const w = await world();
    // Sarah is also the Owner of her own business, with a client and a session at 18:00.
    const businessId = (await createWorkspace(admin.db, { label: 'sarah-personal-training' })).id;
    const sarahsOwnRole = await addTeamRole(admin.db, {
      workspaceId: businessId,
      accountId: w.sarah.id,
      role: 'owner',
      trainsHere: true,
    });
    const secret = await addClient(admin.db, { workspaceId: businessId, name: 'Geheime Klant' });
    const hers = await addSession(admin.db, {
      workspaceId: businessId,
      clientId: secret.id,
      trainerProfileId: await w.profileOf(sarahsOwnRole.id),
      startsAt: amsterdam('2026-10-06T18:00'),
    });

    // John plans Anna with Sarah at the same time: nothing in John's Gym overlaps.
    const response = await plan(w, w.john, {});
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toContain(hers.id);
    expect(text).not.toContain('Geheime Klant');

    // With a real overlap in John's Gym, the 409 names only John's Gym's session.
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: await w.profileOf(w.sarahRole.id),
      startsAt: amsterdam('2026-10-06T18:30'),
    });
    const refused = await plan(w, w.john, { localStart: '18:15' });
    expect(refused.status).toBe(409);
    const body = await refused.text();
    expect(body).toContain('Mark Jansen');
    expect(body).not.toContain(hers.id);
    expect(body).not.toContain('Geheime Klant');
    expect((JSON.parse(body) as { conflicts: unknown[] }).conflicts).toHaveLength(2);
  });

  describe('AC16: events carry no personal data', () => {
    it('AC16: double_booking_warned has the workspace ID and the surface only; a save that is allowed or does not overlap records nothing', async () => {
      const logs = (['log', 'info', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
      );
      const posthog = createProductEventCaptureTransport();
      const productEvents = createProductEvents({
        env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
        transport: posthog,
        errorReporter: createErrorReporter({ env: {} }),
      });
      const w = await world({ productEvents });
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: w.mark.id,
        trainerProfileId: await w.profileOf(w.sarahRole.id),
        startsAt: amsterdam('2026-10-06T18:00'),
      });
      const bearer = { authorization: 'Bearer synthetic-token' };

      // No overlap, and an overlap that is allowed: nothing is recorded.
      await plan(w, w.john, { localStart: '19:00' });
      await plan(w, w.john, { allowConflicts: true });
      const warnings = () =>
        posthog.events.filter(({ event }) => event === 'double_booking_warned');
      expect(warnings()).toEqual([]);

      // The web (no bearer token), an app that names its surface, and an app that names none.
      expect((await plan(w, w.john, {})).status).toBe(409);
      expect((await plan(w, w.john, { surface: 'ios' }, bearer)).status).toBe(409);
      expect((await plan(w, w.john, { surface: 'android' }, bearer)).status).toBe(409);
      expect((await plan(w, w.john, {}, bearer)).status).toBe(409);

      expect(warnings()).toHaveLength(3);
      const properties = warnings().map((event) =>
        Object.fromEntries(
          Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
        ),
      );
      expect(properties).toEqual([
        { workspace_id: w.gym.id, surface: 'web' },
        { workspace_id: w.gym.id, surface: 'ios' },
        { workspace_id: w.gym.id, surface: 'android' },
      ]);
      expect(warnings()[0]?.distinct_id).toBe(w.john.id);
      const sent = JSON.stringify(warnings());
      for (const personal of [
        'Mark Jansen',
        'Anna de Vries',
        w.sarah.email,
        w.anna.id,
        '2026-10-06',
      ]) {
        expect(sent).not.toContain(personal);
      }
      for (const log of logs) log.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Ticket #536: assigning and changing a trainer through the API (AC1 to AC4, AC8, AC12 to AC16).
// Synthetic people as in the spec: John (Owner of John's Gym, also trains), Sarah, Tom and Mike
// (Trainers), the clients Anna de Vries and Mark Jansen, Lisa (Owner of Fit Studio, `mike` of the
// shared world). "Kracht" every Tuesday 18:00 with Sarah from 29 September 2026, "Boxing" on
// Thursday 24 September 2026 19:15 without a trainer.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface TrainerBody {
  session: SessionBody & { series?: { changedFields: string[] } };
  clientsNotified: number;
  keptDates: number;
}

interface CandidatesBody {
  sessionId: string;
  trainers: {
    id: string;
    name: string;
    conflicts: { sessionId: string; type: string; displayName: string }[];
    laterConflictingDates: number;
  }[];
  participantsToNotify: { forThisDate: number; forFollowingDates: number };
}

describe('F023 assigning and changing a trainer through the API', () => {
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
  const stored = (workspaceId: string) =>
    admin.db
      .select()
      .from(sessions)
      .where(eq(sessions.organizationId, workspaceId))
      .orderBy(asc(sessions.startsAt));
  const dateOn = async (workspaceId: string, day: string) => {
    const row = (await stored(workspaceId)).find((r) => r.occurrenceDate === day);
    if (!row) throw new Error(`no date on ${day}`);
    return row;
  };

  async function world(overrides: Partial<ApiDependencies> = {}) {
    const people = await groupClassWorld(admin);
    const mikeAccount = await createAccount(admin.db, { label: 'mike-trainer' });
    await admin.db.update(authUsers).set({ name: 'Mike' }).where(eq(authUsers.id, mikeAccount.id));
    const mikeTrainer = await addTeamRole(admin.db, {
      workspaceId: people.gym.id,
      accountId: mikeAccount.id,
    });
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
    const api = setupGroupClassApi(admin, app, {
      sendTrainerChange: createTrainerChangeSender({
        sendEmail: createSendEmail({
          transport,
          sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
          replyTo: { email: 'support@example.com' },
          sleep: () => Promise.resolve(),
          random: () => 0,
        }),
      }),
      ...overrides,
    });
    return { ...people, mikeTrainer, anna, mark, transport, ...api };
  }
  type World = Awaited<ReturnType<typeof world>>;

  /** Kracht with Sarah, every Tuesday 18:00 from 29 September (dates for 12 weeks). */
  async function kracht_(w: World, trainerId: string | null = w.sarahRole.id) {
    const { groupClass } = (await (
      await createClass(w.server, w.gym.id, w.john, kracht(trainerId ?? undefined))
    ).json()) as CreatedClassBody;
    await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
      localDate: '2026-09-29',
      localStart: '18:00',
      repeat: 'weekly',
    });
    return groupClass;
  }

  /** Boxing on Thursday 24 September 2026 19:15, no trainer; "now" is Tuesday 22 September. */
  async function boxing(w: World) {
    w.clock.set('2026-09-22T08:00:00.000Z');
    const made = await createClass(w.server, w.gym.id, w.john, {
      ...kracht(),
      nameNl: 'Boxing',
      nameEn: 'Boxing',
    });
    const created = (await made.json()) as CreatedClassBody;
    if (!created.groupClass) throw new Error(JSON.stringify([made.status, created]));
    const date = await scheduleClass(w.server, w.gym.id, created.groupClass.id, w.john, {
      localDate: '2026-09-24',
      localStart: '19:15',
    });
    return (await date.json()) as SessionBody;
  }

  const assign = (
    w: World,
    sessionId: string,
    who: { id: string } | undefined,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) =>
    call(
      w.server,
      'POST',
      `/v1/workspaces/${w.gym.id}/sessions/${sessionId}/trainer`,
      who,
      body,
      headers,
    );
  const candidates = (w: World, sessionId: string, who: { id: string } | undefined) =>
    call(
      w.server,
      'GET',
      `/v1/workspaces/${w.gym.id}/sessions/${sessionId}/trainer-candidates`,
      who,
    );
  const onDay = (w: World, date: string) =>
    call(w.server, 'GET', `/v1/workspaces/${w.gym.id}/day?date=${date}`, w.john);

  it('AC1: Tom is assigned to Boxing on 24 September; Aandacht nodig no longer lists it', async () => {
    const w = await world();
    const date = await boxing(w);
    const before = (await (await onDay(w, '2026-09-24')).json()) as { attention: { id: string }[] };
    expect(before.attention.map((item) => item.id)).toEqual([date.id]);

    const response = await assign(w, date.id, w.john, { trainerId: w.tomRole.id, version: 1 });

    expect(response.status).toBe(200);
    const body = (await response.json()) as TrainerBody;
    expect(body.session).toMatchObject({
      id: date.id,
      trainer: { id: w.tomRole.id, name: 'Tom' },
      version: 2,
    });
    const after = (await (await onDay(w, '2026-09-24')).json()) as { attention: unknown[] };
    expect(after.attention).toEqual([]);
    const read = (await (
      await readSession(w.server, w.gym.id, date.id, w.john)
    ).json()) as SessionBody;
    expect(read.trainer).toEqual({ id: w.tomRole.id, name: 'Tom' });
    // Until F024, a date that has a trainer takes no "only this date" change.
    const again = await assign(w, date.id, w.john, {
      trainerId: w.sarahRole.id,
      scope: 'this',
      version: 2,
    });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({
      issues: [{ path: 'scope', code: 'has_trainer' }],
    });
  });

  it('AC1: a date of a series without a trainer gets one as a change of its own; nothing else is refused wrongly', async () => {
    const w = await world();
    const groupClass = await kracht_(w, null);
    const date = await dateOn(w.gym.id, '2026-10-06');

    const response = await assign(w, date.id, w.john, { trainerId: w.tomRole.id, version: 1 });

    expect(response.status).toBe(200);
    const stored6 = await dateOn(w.gym.id, '2026-10-06');
    expect(stored6.trainerProfileId).toBe(await profileOf(w.tomRole.id));
    expect(stored6.detachedFields).toContain('trainer');
    expect((await dateOn(w.gym.id, '2026-10-13')).trainerProfileId).toBeNull();
    expect(groupClass.id).toBeTruthy();
    // Same trainer again, an unknown trainer, a cancelled date and a date outside a series.
    expect((await assign(w, date.id, w.john, { trainerId: w.tomRole.id, version: 2 })).status).toBe(
      400,
    );
    expect(
      (await assign(w, date.id, w.john, { trainerId: w.mikeRole.id, version: 2 })).status,
    ).toBe(404);
    const lonely = await boxing(w);
    expect(
      (
        await assign(w, lonely.id, w.john, {
          trainerId: w.tomRole.id,
          scope: 'following',
          version: 1,
        })
      ).status,
    ).toBe(400);
  });

  it('AC2: Mike becomes Kracht’s regular trainer from 6 October; dates with their own trainer keep theirs, earlier dates keep Sarah', async () => {
    const w = await world();
    await kracht_(w);
    const mike = await profileOf(w.mikeTrainer.id);
    const sarah = await profileOf(w.sarahRole.id);
    // 20 October was given to Tom on its own (F024's substitution, written as the data F022 reads).
    const twentieth = await dateOn(w.gym.id, '2026-10-20');
    await admin.db
      .update(sessions)
      .set({ trainerProfileId: await profileOf(w.tomRole.id), detachedFields: ['trainer'] })
      .where(eq(sessions.id, twentieth.id));
    const sixth = await dateOn(w.gym.id, '2026-10-06');

    const response = await assign(w, sixth.id, w.john, {
      trainerId: w.mikeTrainer.id,
      scope: 'following',
      version: 1,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as TrainerBody;
    expect(body.keptDates).toBe(1);
    expect(body.session.trainer).toEqual({ id: w.mikeTrainer.id, name: 'Mike' });
    const byDay = new Map((await stored(w.gym.id)).map((row) => [row.occurrenceDate, row]));
    expect(byDay.get('2026-09-29')?.trainerProfileId).toBe(sarah);
    for (const day of ['2026-10-06', '2026-10-13', '2026-10-27', '2026-11-03']) {
      expect(byDay.get(day)?.trainerProfileId, day).toBe(mike);
    }
    expect(byDay.get('2026-10-20')?.trainerProfileId).toBe(await profileOf(w.tomRole.id));
    // The series from 6 October runs with Mike, so dates the calendar fills later get him too.
    const series = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.organizationId, w.gym.id))
      .orderBy(asc(classSeries.startsOn));
    expect(series.map((row) => [row.startsOn, row.trainerProfileId])).toEqual([
      ['2026-09-29', sarah],
      ['2026-10-06', mike],
    ]);
  });

  it('AC3: the candidates show Mike’s private session at 18:30 and count later conflicting dates', async () => {
    const w = await world();
    await kracht_(w);
    const mike = await profileOf(w.mikeTrainer.id);
    const private630 = await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.anna.id,
      trainerProfileId: mike,
      startsAt: amsterdam('2026-10-06T18:30'),
    });
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: mike,
      startsAt: amsterdam('2026-10-13T18:30'),
    });
    // The back-to-back session at 19:00 and a cancelled one at 18:00 never count.
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.anna.id,
      trainerProfileId: mike,
      startsAt: amsterdam('2026-10-20T19:00'),
    });
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.anna.id,
      trainerProfileId: mike,
      status: 'cancelled',
      startsAt: amsterdam('2026-10-27T18:00'),
    });
    const sixth = await dateOn(w.gym.id, '2026-10-06');

    const response = await candidates(w, sixth.id, w.john);

    expect(response.status).toBe(200);
    const body = (await response.json()) as CandidatesBody;
    expect(body.trainers.map((trainer) => trainer.name)).toEqual(['John', 'Mike', 'Tom']);
    const mikeRow = body.trainers.find((trainer) => trainer.name === 'Mike');
    expect(mikeRow?.conflicts).toMatchObject([
      { sessionId: private630.id, type: 'private', displayName: 'Anna de Vries' },
    ]);
    expect(mikeRow?.laterConflictingDates).toBe(1);
    expect(body.trainers.find((trainer) => trainer.name === 'Tom')).toMatchObject({
      conflicts: [],
      laterConflictingDates: 0,
    });
    // Sarah is the session's trainer, not a candidate.
    expect(body.trainers.map((trainer) => trainer.id)).not.toContain(w.sarahRole.id);
  });

  it('AC4: another workspace’s sessions never count or show', async () => {
    const w = await world();
    await kracht_(w);
    const businessId = (await createWorkspace(admin.db, { label: 'tom-personal-training' })).id;
    const toms = await addTeamRole(admin.db, {
      workspaceId: businessId,
      accountId: w.tom.id,
      role: 'owner',
      trainsHere: true,
    });
    const secret = await addClient(admin.db, { workspaceId: businessId, name: 'Geheime Klant' });
    const hers = await addSession(admin.db, {
      workspaceId: businessId,
      clientId: secret.id,
      trainerProfileId: await profileOf(toms.id),
      startsAt: amsterdam('2026-10-06T18:00'),
    });
    const sixth = await dateOn(w.gym.id, '2026-10-06');

    const listed = await candidates(w, sixth.id, w.john);
    const text = await listed.text();

    expect(text).not.toContain(hers.id);
    expect(text).not.toContain('Geheime Klant');
    expect(
      (JSON.parse(text) as CandidatesBody).trainers.find((trainer) => trainer.name === 'Tom'),
    ).toMatchObject({ conflicts: [], laterConflictingDates: 0 });
    const assigned = await assign(w, sixth.id, w.john, {
      trainerId: w.tomRole.id,
      scope: 'following',
      version: 1,
    });
    expect(assigned.status).toBe(200);
  });

  it('a trainer who already has something then gets 409 trainer_conflict, unless allowed; a stale version gets 409 session_changed', async () => {
    const w = await world();
    const date = await boxing(w);
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: await profileOf(w.tomRole.id),
      startsAt: amsterdam('2026-09-24T19:00'),
    });

    const refused = await assign(w, date.id, w.john, { trainerId: w.tomRole.id, version: 1 });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: 'trainer_conflict',
      conflicts: [{ type: 'private', displayName: 'Mark Jansen' }],
    });
    const unchanged = (await (
      await readSession(w.server, w.gym.id, date.id, w.john)
    ).json()) as SessionBody;
    expect(unchanged.version).toBe(1);

    const allowed = await assign(w, date.id, w.john, {
      trainerId: w.tomRole.id,
      version: 1,
      allowConflicts: true,
    });
    expect(allowed.status).toBe(200);
    const stale = await assign(w, date.id, w.john, { trainerId: w.sarahRole.id, version: 1 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'session_changed',
      session: { id: date.id, version: 2 },
    });
  });

  it('AC8: John changes Mark’s private session from Sarah to Tom; Mark gets the English email, only when asked and before the start', async () => {
    const w = await world();
    w.clock.set('2026-09-22T08:00:00.000Z');
    const sarah = await profileOf(w.sarahRole.id);
    const session = await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: sarah,
      startsAt: amsterdam('2026-09-24T09:00'),
    });

    const response = await assign(w, session.id, w.john, { trainerId: w.tomRole.id, version: 1 });

    expect(response.status).toBe(200);
    expect(((await response.json()) as TrainerBody).clientsNotified).toBe(1);
    expect(w.transport.sent).toHaveLength(1);
    expect(w.transport.sent[0]).toMatchObject({
      to: { email: 'mark@example.com' },
      locale: 'en',
      subject: 'New trainer: your session on Thursday 24 September',
    });
    expect(w.transport.sent[0]?.text).toContain("You'll now train with Tom.");
    expect(w.transport.sent[0]?.text).not.toContain('Anna');
    expect((await stored(w.gym.id))[0]?.trainerProfileId).toBe(await profileOf(w.tomRole.id));

    // Unchecked: nothing is sent.
    const unchecked = await assign(w, session.id, w.john, {
      trainerId: w.sarahRole.id,
      version: 2,
      notifyClients: false,
    });
    expect(unchecked.status).toBe(200);
    expect(((await unchecked.json()) as TrainerBody).clientsNotified).toBe(0);
    // After the start: nothing is sent, whatever the box says.
    w.clock.set('2026-09-24T07:30:00.000Z');
    const started = await assign(w, session.id, w.john, { trainerId: w.tomRole.id, version: 3 });
    expect(started.status).toBe(200);
    expect(((await started.json()) as TrainerBody).clientsNotified).toBe(0);
    expect(w.transport.sent).toHaveLength(1);
  });

  it('AC12: Sarah (Trainer) gets 403 on the assignment routes and cannot assign herself to Boxing', async () => {
    const w = await world();
    const date = await boxing(w);

    const assigned = await assign(w, date.id, w.sarah, { trainerId: w.sarahRole.id, version: 1 });
    const listed = await candidates(w, date.id, w.sarah);

    expect(assigned.status).toBe(403);
    expect(listed.status).toBe(403);
    const read = (await (
      await readSession(w.server, w.gym.id, date.id, w.john)
    ).json()) as SessionBody;
    expect(read.trainer).toBeUndefined();
    expect(read.version).toBe(1);
  });

  it('AC13: a former assignee’s save gets 403; a stale form of John gets F020’s 409', async () => {
    const w = await world();
    w.clock.set('2026-09-22T08:00:00.000Z');
    const session = await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: await profileOf(w.tomRole.id),
      createdByTeamMemberId: w.tomRole.id,
      startsAt: amsterdam('2026-09-24T09:00'),
    });
    const move = (who: { id: string }) =>
      call(w.server, 'POST', `/v1/workspaces/${w.gym.id}/sessions/${session.id}/reschedule`, who, {
        localDate: '2026-09-24',
        localStart: '10:30',
        durationMinutes: 60,
        notify: false,
        allowConflicts: true,
        version: 1,
      });
    expect(
      (await assign(w, session.id, w.john, { trainerId: w.sarahRole.id, version: 1 })).status,
    ).toBe(200);

    expect((await move(w.tom)).status).toBe(403);
    const john = await move(w.john);
    expect(john.status).toBe(409);
    expect(await john.json()).toMatchObject({ code: 'session_changed', session: { version: 2 } });
  });

  it('AC14: Lisa (Fit Studio) gets 404 on John’s Gym’s assignment routes and nobody signed in gets 401', async () => {
    const w = await world();
    const date = await boxing(w);

    expect((await assign(w, date.id, w.mike, { trainerId: w.tomRole.id, version: 1 })).status).toBe(
      404,
    );
    expect((await candidates(w, date.id, w.mike)).status).toBe(404);
    expect(
      (await assign(w, date.id, undefined, { trainerId: w.tomRole.id, version: 1 })).status,
    ).toBe(401);
    expect((await candidates(w, date.id, undefined)).status).toBe(401);
    // A client of the workspace is no team member.
    expect((await candidates(w, date.id, w.annaAccount)).status).toBe(403);
  });

  it('AC15: the contract has both routes for the Owner only, with the 409 and the clients name them', () => {
    const base = '/v1/workspaces/{workspaceId}/sessions/{sessionId}';
    const post = contract.paths[`${base}/trainer`].post;
    const get = contract.paths[`${base}/trainer-candidates`].get;
    expect(post.operationId).toBe('assignTrainer');
    expect(get.operationId).toBe('listTrainerCandidates');
    for (const operation of [post, get]) {
      expect(operation['x-access']).toMatchObject({
        capability: 'session.assign',
        roles: ['owner'],
      });
    }
    expect(Object.keys(post.responses)).toEqual(expect.arrayContaining(['200', '400', '409']));
    expect(Object.keys(get.responses)).toEqual(expect.arrayContaining(['200', '403', '404']));
  });

  it('AC16: trainer_assigned has the workspace ID, the platform, the scope and the kind only', async () => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const w = await world({ productEvents });
    const date = await boxing(w);
    const privateSession = await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: await profileOf(w.sarahRole.id),
      startsAt: amsterdam('2026-09-26T09:00'),
    });
    const bearer = { authorization: 'Bearer synthetic-token' };
    const events = () => posthog.events.filter(({ event }) => event === 'trainer_assigned');

    // A stale version and a refusal record nothing.
    await assign(w, date.id, w.john, { trainerId: w.tomRole.id, version: 9 });
    await assign(w, date.id, w.john, { trainerId: w.tomRole.id, scope: 'following', version: 1 });
    expect(events()).toEqual([]);

    expect((await assign(w, date.id, w.john, { trainerId: w.tomRole.id, version: 1 })).status).toBe(
      200,
    );
    expect(
      (
        await assign(
          w,
          privateSession.id,
          w.john,
          { trainerId: w.tomRole.id, version: 1, surface: 'ios' },
          bearer,
        )
      ).status,
    ).toBe(200);
    // An app that names no surface records nothing.
    expect(
      (
        await assign(
          w,
          privateSession.id,
          w.john,
          { trainerId: w.sarahRole.id, version: 2 },
          bearer,
        )
      ).status,
    ).toBe(200);

    const properties = events().map((event) =>
      Object.fromEntries(
        Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
      ),
    );
    expect(properties).toEqual([
      { workspace_id: w.gym.id, platform: 'web', scope: 'this', kind: 'class' },
      { workspace_id: w.gym.id, platform: 'ios', scope: 'this', kind: 'private' },
    ]);
    expect(events()[0]?.distinct_id).toBe(w.john.id);
    const sent = JSON.stringify(events());
    for (const personal of ['Mark Jansen', 'Tom', w.mark.id, date.id, '2026-09-24', 'Boxing']) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });
});
