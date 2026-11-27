import { readFileSync } from 'node:fs';
import {
  authUsers,
  classSeries,
  createDatabase,
  type DatabaseClient,
  organizations,
  sessionParticipants,
  sessions,
  trainerProfiles,
} from '@fivvi/database';
import { addClient, addSession, addTeamRole, createAccount } from '@fivvi/database/testing';
import {
  createMemoryTransport,
  createSendEmail,
  createSubstitutionSender,
  createTrainerChangeSender,
  emailIdempotencyKey,
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
import type { ApiDependencies } from '../src/index.ts';
import { substitutionEmailEvent } from '../src/sessions/email-event.ts';
import {
  type CreatedClassBody,
  call,
  createClass,
  groupClassWorld,
  kracht,
  myDay,
  mySessions,
  type SessionBody,
  scheduleClass,
  setupGroupClassApi,
} from './group-classes-world.ts';

// F024 (spec #461), ticket #552: substituting a trainer on one class date through the API. Synthetic
// people as in the spec: John (Owner of John's Gym, also trains), Sarah (Trainer), Mike (Trainer, his
// communication language is English), Lisa (Trainer, no language of her own), Tom (Owner of Fit
// Studio, the shared world's `mike`), the participants Anna de Vries and Mark Jansen. "Kracht" every
// Tuesday 18:00 with Sarah from 6 October 2026, 12 weeks of dates; "now" is Monday 28 September.
// Europe/Amsterdam, summer time until 25 October.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface SubstitutedBody {
  session: SessionBody & {
    substituteFor?: { id: string; trainerProfileId: string; name: string };
    series?: { changedFields: string[] };
  };
  clientsNotified: number;
  keptDates: number;
}

interface PersonalItem {
  sessionId: string;
  className?: string;
  substituteFor?: { name: string };
  takenOverBy?: { name: string };
  attendanceOpen?: boolean;
  attendance?: unknown;
}

interface DayBody {
  items: PersonalItem[];
  summary: { count: number; done: number };
  next?: { sessionId: string };
}

describe('F024 substituting a trainer through the API', () => {
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

  async function world(
    overrides: Partial<ApiDependencies> = {},
    spy?: ApiDependencies['sendSubstitution'],
  ) {
    const people = await groupClassWorld(admin);
    const trainer = async (label: string, name: string, locale?: 'en') => {
      const account = await createAccount(admin.db, { label });
      await admin.db
        .update(authUsers)
        .set({ name, ...(locale ? { preferredLocale: locale } : {}) })
        .where(eq(authUsers.id, account.id));
      const role = await addTeamRole(admin.db, {
        workspaceId: people.gym.id,
        accountId: account.id,
      });
      return { account, role };
    };
    const mikeTrainer = await trainer('mike-trainer', 'Mike', 'en');
    const lisaTrainer = await trainer('lisa-trainer', 'Lisa');
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
      sendSubstitution: async (mail) => {
        await spy?.(mail);
        await createSubstitutionSender({ sendEmail })(mail);
      },
      sendTrainerChange: createTrainerChangeSender({ sendEmail }),
      ...overrides,
    });
    return {
      ...people,
      mikeTrainer: mikeTrainer.role,
      mikeTrainerAccount: mikeTrainer.account,
      lisaTrainer: lisaTrainer.role,
      lisaTrainerAccount: lisaTrainer.account,
      // "Tom (Fit Studio)" of the spec: the Owner of the other workspace.
      tomOfFitStudio: people.mike,
      anna,
      mark,
      transport,
      ...api,
    };
  }
  type World = Awaited<ReturnType<typeof world>>;

  /**
   * Kracht with Sarah every Tuesday 18:00 from 6 October, with no English name (so the subject is
   * "Kracht" in both languages, as the spec writes it); Anna and Mark booked on 20 October.
   */
  async function krachtWorld(
    overrides: Partial<ApiDependencies> = {},
    spy?: ApiDependencies['sendSubstitution'],
  ) {
    const w = await world(overrides, spy);
    const { nameEn: _nameEn, ...dutchOnly } = kracht(w.sarahRole.id);
    const { groupClass } = (await (
      await createClass(w.server, w.gym.id, w.john, dutchOnly)
    ).json()) as CreatedClassBody;
    await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
      localDate: '2026-10-06',
      localStart: '18:00',
      repeat: 'weekly',
    });
    const twentieth = await dateOn(w.gym.id, '2026-10-20');
    for (const client of [w.anna, w.mark]) {
      await admin.db.insert(sessionParticipants).values({
        organizationId: w.gym.id,
        sessionId: twentieth.id,
        clientId: client.id,
      });
    }
    return { ...w, groupClass, twentieth };
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
  /**
   * John substitutes `who` on the date, as CO-02 with *Alleen deze les* does. The participants'
   * box is unchecked unless a test says otherwise, so the tests of EM-10 see only EM-10 (the
   * participants' notice is AC16 and AC17, which check the box itself and its default).
   */
  const substitute = (
    w: World,
    sessionId: string,
    who: { id: string },
    version: number,
    extra: Record<string, unknown> = {},
  ) =>
    assign(w, sessionId, w.john, {
      trainerId: who.id,
      scope: 'this',
      version,
      notifyParticipants: false,
      ...extra,
    });

  const read = async (w: World, sessionId: string) =>
    (await (
      await call(w.server, 'GET', `/v1/workspaces/${w.gym.id}/sessions/${sessionId}`, w.john)
    ).json()) as SessionBody & { substituteFor?: { id: string; name: string } };

  it('AC1: only 20 October gets Mike, with Sarah recorded; the series, the other dates and the participants stay', async () => {
    const w = await krachtWorld();
    const sarah = await profileOf(w.sarahRole.id);
    const mike = await profileOf(w.mikeTrainer.id);
    const before = await stored(w.gym.id);
    const [seriesBefore] = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.organizationId, w.gym.id));

    const response = await substitute(w, w.twentieth.id, w.mikeTrainer, 1);

    expect(response.status).toBe(200);
    const body = (await response.json()) as SubstitutedBody;
    expect(body.session).toMatchObject({
      id: w.twentieth.id,
      trainer: { id: w.mikeTrainer.id, name: 'Mike' },
      substituteFor: { id: w.sarahRole.id, trainerProfileId: sarah, name: 'Sarah' },
      version: 2,
      participants: [{ name: 'Anna de Vries' }, { name: 'Mark Jansen' }],
    });
    // The date is its own in the trainer: a later change of the series leaves it alone.
    expect(body.session.series?.changedFields).toEqual(['trainer']);
    const after = await stored(w.gym.id);
    for (const row of after) {
      if (row.id === w.twentieth.id) {
        expect(row.trainerProfileId).toBe(mike);
        expect(row.substituteForTrainerProfileId).toBe(sarah);
        continue;
      }
      // Every other date is as it was.
      expect(row).toEqual(before.find((candidate) => candidate.id === row.id));
      expect(row.trainerProfileId).toBe(sarah);
      expect(row.substituteForTrainerProfileId).toBeNull();
    }
    const [seriesAfter] = await admin.db
      .select()
      .from(classSeries)
      .where(eq(classSeries.organizationId, w.gym.id));
    expect(seriesAfter).toEqual(seriesBefore);
    // The participants are unchanged, and the session answers what it says.
    const places = await admin.db
      .select({ status: sessionParticipants.attendanceStatus })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, w.twentieth.id));
    expect(places).toEqual([{ status: 'booked' }, { status: 'booked' }]);
    expect(await read(w, w.twentieth.id)).toMatchObject({
      trainer: { name: 'Mike' },
      substituteFor: { name: 'Sarah' },
    });
    expect(await read(w, (await dateOn(w.gym.id, '2026-10-13')).id)).not.toHaveProperty(
      'substituteFor',
    );
  });

  it('AC1: the workspace calendar says whom Mike replaces', async () => {
    const w = await krachtWorld();
    await substitute(w, w.twentieth.id, w.mikeTrainer, 1, { notifySubstitute: false });

    const day = (await (
      await call(w.server, 'GET', `/v1/workspaces/${w.gym.id}/day?date=2026-10-20`, w.john)
    ).json()) as { items: { id: string; trainer?: { name: string }; substituteFor?: unknown }[] };

    expect(day.items.find((item) => item.id === w.twentieth.id)).toMatchObject({
      trainer: { name: 'Mike' },
      substituteFor: { name: 'Sarah' },
    });
    const week = (await (
      await call(
        w.server,
        'GET',
        `/v1/workspaces/${w.gym.id}/calendar?from=2026-10-13&to=2026-10-27`,
        w.john,
      )
    ).json()) as { items: { id: string; substituteFor?: unknown }[] };
    expect(week.items.filter((item) => item.substituteFor !== undefined)).toHaveLength(1);
  });

  it('AC2: EM-10 goes to Mike in English with the time, location and "you’re covering for Sarah", without a participant name; with the box unchecked nothing is sent', async () => {
    const w = await krachtWorld();

    expect((await substitute(w, w.twentieth.id, w.mikeTrainer, 1)).status).toBe(200);

    // Only Mike is mailed: the participants' box is unchecked here (their notice is AC16, with a box of its own).
    expect(w.transport.sent.map((email) => email.to.email)).toEqual([w.mikeTrainerAccount.email]);
    const toMike = w.transport.sent;
    expect(toMike[0]).toMatchObject({
      locale: 'en',
      template: 'substitution',
      subject: "You're covering: Kracht on Tuesday 20 October",
    });
    expect(toMike[0]?.text).toContain("You're covering for Sarah");
    expect(toMike[0]?.text).toContain('Tuesday, 20 October 2026, 18:00 to 19:00');
    const [workspace] = await admin.db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, w.gym.id));
    expect(toMike[0]?.text).toContain(`You're covering for Sarah: Kracht at ${workspace?.name}.`);
    expect(toMike[0]?.text).toContain(`Where: ${workspace?.name}`);
    expect(toMike[0]?.text).toContain('View in Fivvi');
    for (const part of [toMike[0]?.text, toMike[0]?.html]) {
      expect(part).not.toContain('Anna');
      expect(part).not.toContain('Mark');
    }
    // The button opens the class date.
    expect(toMike[0]?.links).toContain(
      `https://fivvi.app/w/${workspace?.slug}/sessions/${w.twentieth.id}`,
    );

    // The box unchecked: the 27 October date is recorded and nothing is sent.
    w.transport.clear();
    const twentySeventh = await dateOn(w.gym.id, '2026-10-27');
    const quiet = await substitute(w, twentySeventh.id, w.mikeTrainer, 1, {
      notifySubstitute: false,
    });
    expect(quiet.status).toBe(200);
    expect(w.transport.sent).toEqual([]);
  });

  it('AC2: a substitute with no language of their own gets the workspace’s default (Dutch)', async () => {
    const w = await krachtWorld();

    expect((await substitute(w, w.twentieth.id, w.lisaTrainer, 1)).status).toBe(200);

    expect(
      w.transport.sent.filter((email) => email.to.email === w.lisaTrainerAccount.email)[0],
    ).toMatchObject({ locale: 'nl-NL', subject: 'Je valt in: Kracht op dinsdag 20 oktober' });
  });

  it('AC4: Mike’s day says he covers for Sarah; Sarah’s keeps 20 October, taken over by Mike, outside her summary and without attendance', async () => {
    const w = await krachtWorld();
    await substitute(w, w.twentieth.id, w.mikeTrainer, 1, { notifySubstitute: false });
    // Tuesday 20 October, 10:00 in Amsterdam: Kracht at 18:00 is still to come.
    w.clock.set('2026-10-20T08:00:00.000Z');

    const mikes = (await (
      await myDay(w.server, '2026-10-20', w.mikeTrainerAccount)
    ).json()) as DayBody;
    expect(mikes.items).toHaveLength(1);
    expect(mikes.next?.sessionId).toBe(w.twentieth.id);
    expect(mikes.items[0]).toMatchObject({
      sessionId: w.twentieth.id,
      className: 'Kracht',
      substituteFor: { name: 'Sarah' },
    });
    expect(mikes.items[0]).not.toHaveProperty('takenOverBy');
    expect(mikes.summary.count).toBe(1);

    const sarahs = (await (await myDay(w.server, '2026-10-20', w.sarah)).json()) as DayBody;
    expect(sarahs.items).toHaveLength(1);
    expect(sarahs.items[0]).toMatchObject({
      sessionId: w.twentieth.id,
      className: 'Kracht',
      takenOverBy: { name: 'Mike' },
    });
    expect(sarahs.items[0]).not.toHaveProperty('substituteFor');
    // Dimmed and without actions: no attendance, not counted, not Straks.
    expect(sarahs.items[0]).not.toHaveProperty('attendanceOpen');
    expect(sarahs.items[0]).not.toHaveProperty('attendance');
    expect(sarahs.summary.count).toBe(0);
    expect(sarahs.next).toBeUndefined();

    // Agenda: the same on both sides.
    const range = async (who: { id: string }) =>
      (await (await mySessions(w.server, '2026-10-19', '2026-10-25', who)).json()) as {
        items: PersonalItem[];
      };
    expect(
      (await range(w.mikeTrainerAccount)).items.map((item) => item.substituteFor?.name),
    ).toEqual(['Sarah']);
    expect((await range(w.sarah)).items.map((item) => item.takenOverBy?.name)).toEqual(['Mike']);
    // The other dates stay Sarah's.
    const other = (await (
      await mySessions(w.server, '2026-10-26', '2026-11-01', w.sarah)
    ).json()) as { items: PersonalItem[] };
    expect(other.items).toHaveLength(1);
    expect(other.items[0]).not.toHaveProperty('takenOverBy');
  });

  it('AC5: back to Sarah ends it without an email; Lisa instead keeps Sarah as the original and mails Lisa', async () => {
    const w = await krachtWorld();
    const sarah = await profileOf(w.sarahRole.id);
    await substitute(w, w.twentieth.id, w.mikeTrainer, 1);
    w.transport.clear();

    const ended = await substitute(w, w.twentieth.id, w.sarahRole, 2);

    expect(ended.status).toBe(200);
    const body = (await ended.json()) as SubstitutedBody;
    expect(body.session).toMatchObject({ trainer: { id: w.sarahRole.id }, version: 3 });
    expect(body.session).not.toHaveProperty('substituteFor');
    expect(body.session.series?.changedFields).toEqual([]);
    expect(w.transport.sent).toEqual([]);
    const row = await dateOn(w.gym.id, '2026-10-20');
    expect(row).toMatchObject({
      trainerProfileId: sarah,
      substituteForTrainerProfileId: null,
      detachedFields: [],
    });
    // Sarah's day has it back, as hers.
    const sarahs = (await (await myDay(w.server, '2026-10-20', w.sarah)).json()) as DayBody;
    expect(sarahs.items[0]).not.toHaveProperty('takenOverBy');
    expect(sarahs.summary.count).toBe(1);

    // Mike again, then Lisa instead of Mike: Sarah stays the original.
    await substitute(w, w.twentieth.id, w.mikeTrainer, 3, { notifySubstitute: false });
    w.transport.clear();
    const replaced = await substitute(w, w.twentieth.id, w.lisaTrainer, 4);
    expect(replaced.status).toBe(200);
    expect(((await replaced.json()) as SubstitutedBody).session).toMatchObject({
      trainer: { id: w.lisaTrainer.id, name: 'Lisa' },
      substituteFor: { id: w.sarahRole.id, name: 'Sarah' },
    });
    expect(w.transport.sent.map((email) => email.to.email)).toEqual([w.lisaTrainerAccount.email]);
    expect(w.transport.sent[0]?.text).toContain('Je valt in voor Sarah');
  });

  it('AC5: a later substitute keeps the stored original, also when that profile names nobody any more (a purged account)', async () => {
    const w = await krachtWorld();
    const sarah = await profileOf(w.sarahRole.id);
    await substitute(w, w.twentieth.id, w.mikeTrainer, 1, { notifySubstitute: false });
    // Sarah's account is purged: her profile no longer says who she was, the date still points at it.
    await admin.db
      .update(trainerProfiles)
      .set({ teamMemberId: null, removedTeamMemberId: null, removedName: null })
      .where(eq(trainerProfiles.id, sarah));

    const replaced = await substitute(w, w.twentieth.id, w.lisaTrainer, 2, {
      notifySubstitute: false,
    });

    expect(replaced.status).toBe(200);
    // Lisa is for Sarah, not for Mike.
    expect(await dateOn(w.gym.id, '2026-10-20')).toMatchObject({
      trainerProfileId: await profileOf(w.lisaTrainer.id),
      substituteForTrainerProfileId: sarah,
    });
  });

  it('AC6: Lisa becomes the regular trainer from 13 October: 20 October keeps Mike and “vervangt Sarah”, the other dates from 13 October get Lisa', async () => {
    const w = await krachtWorld();
    const lisa = await profileOf(w.lisaTrainer.id);
    const mike = await profileOf(w.mikeTrainer.id);
    const sarah = await profileOf(w.sarahRole.id);
    await substitute(w, w.twentieth.id, w.mikeTrainer, 1, { notifySubstitute: false });
    const thirteenth = await dateOn(w.gym.id, '2026-10-13');

    const response = await assign(w, thirteenth.id, w.john, {
      trainerId: w.lisaTrainer.id,
      scope: 'following',
      version: 1,
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as SubstitutedBody).keptDates).toBe(1);
    const byDay = new Map((await stored(w.gym.id)).map((row) => [row.occurrenceDate, row]));
    expect(byDay.get('2026-10-06')?.trainerProfileId).toBe(sarah);
    expect(byDay.get('2026-10-20')).toMatchObject({
      trainerProfileId: mike,
      substituteForTrainerProfileId: sarah,
    });
    for (const day of ['2026-10-13', '2026-10-27', '2026-11-03']) {
      expect(byDay.get(day)?.trainerProfileId, day).toBe(lisa);
    }
    expect(await read(w, w.twentieth.id)).toMatchObject({
      trainer: { name: 'Mike' },
      substituteFor: { name: 'Sarah' },
    });
  });

  it('AC6: a series change from a substituted date itself gives that date the new trainer and ends its substitution', async () => {
    const w = await krachtWorld();
    await substitute(w, w.twentieth.id, w.mikeTrainer, 1, { notifySubstitute: false });

    const response = await assign(w, w.twentieth.id, w.john, {
      trainerId: w.lisaTrainer.id,
      scope: 'following',
      version: 2,
    });

    expect(response.status).toBe(200);
    expect(await dateOn(w.gym.id, '2026-10-20')).toMatchObject({
      trainerProfileId: await profileOf(w.lisaTrainer.id),
      substituteForTrainerProfileId: null,
    });
  });

  it('AC8: a past date is recorded with the substitute and no email, even with the box checked', async () => {
    const w = await krachtWorld();
    const sixth = await dateOn(w.gym.id, '2026-10-06');
    w.clock.set('2026-10-10T08:00:00.000Z');

    const response = await substitute(w, sixth.id, w.mikeTrainer, 1, { notifySubstitute: true });

    expect(response.status).toBe(200);
    expect(((await response.json()) as SubstitutedBody).session).toMatchObject({
      trainer: { name: 'Mike' },
      substituteFor: { name: 'Sarah' },
    });
    expect(w.transport.sent).toEqual([]);
    expect(await dateOn(w.gym.id, '2026-10-06')).toMatchObject({
      trainerProfileId: await profileOf(w.mikeTrainer.id),
      substituteForTrainerProfileId: await profileOf(w.sarahRole.id),
    });
  });

  it('AC16: participants get the trainer-change email in their language; independent of EM-10', async () => {
    const w = await krachtWorld();
    const mikeAddress = w.mikeTrainerAccount.email;

    // Both boxes left at their default (checked): the participants, Mike's EM-10, nobody else.
    const response = await assign(w, w.twentieth.id, w.john, {
      trainerId: w.mikeTrainer.id,
      scope: 'this',
      version: 1,
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as SubstitutedBody).clientsNotified).toBe(2);
    expect(w.transport.sent.map((email) => email.to.email).toSorted()).toEqual(
      [mikeAddress, 'anna@example.com', 'mark@example.com'].toSorted(),
    );
    const toAnna = w.transport.sent.find((email) => email.to.email === 'anna@example.com');
    const toMark = w.transport.sent.find((email) => email.to.email === 'mark@example.com');
    expect(toAnna).toMatchObject({
      locale: 'nl-NL',
      template: 'trainer-change',
      subject: 'Andere trainer: Kracht op dinsdag 20 oktober',
    });
    expect(toAnna?.text).toContain('Je traint nu met Mike.');
    expect(toAnna?.text).toContain('dinsdag 20 oktober 2026, 18:00 tot 19:00');
    expect(toMark).toMatchObject({
      locale: 'en',
      template: 'trainer-change',
      subject: 'New trainer: Kracht on Tuesday 20 October',
    });
    expect(toMark?.text).toContain("You'll now train with Mike.");
    expect(w.transport.sent.find((email) => email.to.email === mikeAddress)).toMatchObject({
      template: 'substitution',
    });
    // No email names another participant, nor the trainer they replace, and none carries an address.
    for (const email of [toAnna, toMark]) {
      expect(email?.text).not.toContain('Sarah');
      expect(email?.text).not.toContain('@example.com');
      expect(email?.html).not.toContain('@example.com');
    }
    for (const email of w.transport.sent) {
      expect(email.text).not.toContain(email.to.email === 'anna@example.com' ? 'Mark' : 'Anna');
      expect(email.text).not.toContain(email.to.email === 'mark@example.com' ? 'Anna' : 'Mark');
    }
    // One email for each participant, keyed by the date, its version and the participant.
    expect(new Set(w.transport.sent.map((email) => email.idempotencyKey)).size).toBe(
      w.transport.sent.length,
    );

    // The two boxes are independent: participants only, then the substitute only.
    for (const iso of ['2026-10-27', '2026-11-03']) {
      const date = await dateOn(w.gym.id, iso);
      for (const client of [w.anna, w.mark]) {
        await admin.db.insert(sessionParticipants).values({
          organizationId: w.gym.id,
          sessionId: date.id,
          clientId: client.id,
        });
      }
    }
    w.transport.clear();
    const onlyParticipants = await substitute(
      w,
      (await dateOn(w.gym.id, '2026-10-27')).id,
      w.mikeTrainer,
      1,
      { notifySubstitute: false, notifyParticipants: true },
    );
    expect(((await onlyParticipants.json()) as SubstitutedBody).clientsNotified).toBe(2);
    expect(w.transport.sent.map((email) => email.to.email).toSorted()).toEqual([
      'anna@example.com',
      'mark@example.com',
    ]);

    w.transport.clear();
    const onlySubstitute = await assign(w, (await dateOn(w.gym.id, '2026-11-03')).id, w.john, {
      trainerId: w.mikeTrainer.id,
      scope: 'this',
      version: 1,
      notifyParticipants: false,
    });
    expect(((await onlySubstitute.json()) as SubstitutedBody).clientsNotified).toBe(0);
    expect(w.transport.sent.map((email) => email.to.email)).toEqual([mikeAddress]);
    expect(w.transport.sent[0]).toMatchObject({ template: 'substitution' });
  });

  it('AC16: a date that has started tells nobody, with both boxes checked', async () => {
    const w = await krachtWorld();
    // Tuesday 20 October, 19:00 Amsterdam: the class has started.
    w.clock.set('2026-10-20T17:00:00.000Z');

    const response = await assign(w, w.twentieth.id, w.john, {
      trainerId: w.mikeTrainer.id,
      scope: 'this',
      version: 1,
      notifySubstitute: true,
      notifyParticipants: true,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as SubstitutedBody;
    expect(body.clientsNotified).toBe(0);
    expect(body.session).toMatchObject({
      trainer: { name: 'Mike' },
      substituteFor: { name: 'Sarah' },
    });
    expect(w.transport.sent).toEqual([]);
  });

  it('AC16: a request that rolls back (a stale version, a double-booked substitute) tells no participant', async () => {
    const w = await krachtWorld();
    expect(
      (
        await assign(w, w.twentieth.id, w.john, {
          trainerId: w.mikeTrainer.id,
          scope: 'this',
          version: 9,
        })
      ).status,
    ).toBe(409);
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: await profileOf(w.mikeTrainer.id),
      startsAt: zonedTime('2026-10-20T18:30'),
    });
    expect(
      (
        await assign(w, w.twentieth.id, w.john, {
          trainerId: w.mikeTrainer.id,
          scope: 'this',
          version: 1,
        })
      ).status,
    ).toBe(409);
    expect(w.transport.sent).toEqual([]);
  });

  it('AC17: ending a substitution notifies only when asked', async () => {
    const w = await krachtWorld();
    await substitute(w, w.twentieth.id, w.mikeTrainer, 1, { notifySubstitute: false });
    w.transport.clear();

    // Back to Sarah with the box at its default (checked): Anna and Mark, nobody else (no EM-10).
    const ended = await assign(w, w.twentieth.id, w.john, {
      trainerId: w.sarahRole.id,
      scope: 'this',
      version: 2,
    });

    expect(ended.status).toBe(200);
    expect(((await ended.json()) as SubstitutedBody).clientsNotified).toBe(2);
    expect(w.transport.sent.map((email) => email.to.email).toSorted()).toEqual([
      'anna@example.com',
      'mark@example.com',
    ]);
    const toAnna = w.transport.sent.find((email) => email.to.email === 'anna@example.com');
    const toMark = w.transport.sent.find((email) => email.to.email === 'mark@example.com');
    expect(toAnna).toMatchObject({ locale: 'nl-NL', template: 'trainer-change' });
    expect(toAnna?.text).toContain('Je traint nu met Sarah.');
    expect(toMark).toMatchObject({ locale: 'en', template: 'trainer-change' });
    expect(toMark?.text).toContain("You'll now train with Sarah.");
    for (const email of w.transport.sent) expect(email.text).not.toContain('Mike');

    // The same, with the box unchecked: nothing goes out.
    await substitute(w, w.twentieth.id, w.mikeTrainer, 3, { notifySubstitute: false });
    w.transport.clear();
    const quiet = await assign(w, w.twentieth.id, w.john, {
      trainerId: w.sarahRole.id,
      scope: 'this',
      version: 4,
      notifyParticipants: false,
    });
    expect(quiet.status).toBe(200);
    expect(((await quiet.json()) as SubstitutedBody).clientsNotified).toBe(0);
    expect(w.transport.sent).toEqual([]);
  });

  it('AC10: Trainers get 403 and nothing changes', async () => {
    const w = await krachtWorld();

    for (const who of [w.sarah, w.mikeTrainerAccount]) {
      const response = await assign(w, w.twentieth.id, who, {
        trainerId: w.lisaTrainer.id,
        scope: 'this',
        version: 1,
      });
      expect(response.status).toBe(403);
    }
    const row = await dateOn(w.gym.id, '2026-10-20');
    expect(row.trainerProfileId).toBe(await profileOf(w.sarahRole.id));
    expect(row).toMatchObject({ substituteForTrainerProfileId: null, version: 1 });
    expect(w.transport.sent).toEqual([]);
  });

  it('AC11: Tom of Fit Studio gets 404, anonymous 401, a private session 422 and keeps its trainer', async () => {
    const w = await krachtWorld();
    const body = { trainerId: w.lisaTrainer.id, scope: 'this', version: 1 };

    expect((await assign(w, w.twentieth.id, w.tomOfFitStudio, body)).status).toBe(404);
    expect((await assign(w, w.twentieth.id, undefined, body)).status).toBe(401);
    expect(await dateOn(w.gym.id, '2026-10-20')).toMatchObject({ version: 1 });

    const privateSession = await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: await profileOf(w.sarahRole.id),
      startsAt: zonedTime('2026-10-08T09:00'),
    });
    const refused = await substitute(w, privateSession.id, w.mikeTrainer, 1);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ code: 'private_session' });
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, privateSession.id));
    expect(row).toMatchObject({
      trainerProfileId: await profileOf(w.sarahRole.id),
      substituteForTrainerProfileId: null,
      version: 1,
    });
    expect(w.transport.sent).toEqual([]);
    // *Trainer wijzigen* (F023), which sends no scope, still changes it, and it is no substitution.
    const changed = await assign(w, privateSession.id, w.john, {
      trainerId: w.mikeTrainer.id,
      version: 1,
      notifyClients: false,
    });
    expect(changed.status).toBe(200);
    expect(((await changed.json()) as SubstitutedBody).session).not.toHaveProperty('substituteFor');
    expect(w.transport.sent).toEqual([]);
  });

  it('AC12: EM-10 is sent once, after the commit, with one idempotency key for the date and the substitute', async () => {
    // At the moment of sending the substitution has been committed: a read on another connection sees it.
    let seenAtSend: { trainer: string | null; substituteFor: string | null } | undefined;
    const w = await krachtWorld({}, async (mail) => {
      const [row] = await admin.db
        .select({
          trainer: sessions.trainerProfileId,
          substituteFor: sessions.substituteForTrainerProfileId,
        })
        .from(sessions)
        .where(eq(sessions.id, mail.session.id));
      seenAtSend = row;
    });
    const key = emailIdempotencyKey(
      'EM-10',
      substitutionEmailEvent(w.twentieth.id, w.mikeTrainer.id),
    );

    expect((await substitute(w, w.twentieth.id, w.mikeTrainer, 1)).status).toBe(200);

    expect(seenAtSend).toEqual({
      trainer: await profileOf(w.mikeTrainer.id),
      substituteFor: await profileOf(w.sarahRole.id),
    });
    expect(w.transport.sent).toHaveLength(1);
    expect(w.transport.sent[0]?.idempotencyKey).toBe(key);

    // A refused request (a stale version) is rolled back and sends nothing.
    w.transport.clear();
    seenAtSend = undefined;
    expect((await substitute(w, w.twentieth.id, w.lisaTrainer, 1)).status).toBe(409);
    expect(w.transport.sent).toEqual([]);
    expect(seenAtSend).toBeUndefined();
    // Ending it and choosing Mike again is the same date and substitute: the same key, so the
    // provider sends it once.
    await substitute(w, w.twentieth.id, w.sarahRole, 2);
    await substitute(w, w.twentieth.id, w.mikeTrainer, 3);
    expect(w.transport.sent.map((email) => email.idempotencyKey)).toEqual([key]);
  });

  it('AC12: a double-booked substitute is a 409 trainer_conflict and sends nothing; saving anyway substitutes', async () => {
    const w = await krachtWorld();
    await addSession(admin.db, {
      workspaceId: w.gym.id,
      clientId: w.mark.id,
      trainerProfileId: await profileOf(w.mikeTrainer.id),
      startsAt: zonedTime('2026-10-20T18:30'),
    });

    const refused = await substitute(w, w.twentieth.id, w.mikeTrainer, 1);

    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: 'trainer_conflict' });
    expect(w.transport.sent).toEqual([]);
    expect(await dateOn(w.gym.id, '2026-10-20')).toMatchObject({
      trainerProfileId: await profileOf(w.sarahRole.id),
      version: 1,
    });
    expect(
      (await substitute(w, w.twentieth.id, w.mikeTrainer, 1, { allowConflicts: true })).status,
    ).toBe(200);
  });

  it('AC13: the contract has the substitution with x-access, substituteFor and takenOverBy', () => {
    const route = contract.paths['/v1/workspaces/{workspaceId}/sessions/{sessionId}/trainer'].post;
    expect(route['x-access']).toMatchObject({ type: 'workspace', capability: 'session.assign' });
    expect(Object.keys(route.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '409', '422']),
    );
    const body = contract.components.schemas.AssignTrainerRequest.properties;
    expect(body.notifySubstitute.type).toBe('boolean');
    expect(body.notifyParticipants.type).toBe('boolean');
    expect(contract.components.schemas.AssignTrainerRequest.required ?? []).not.toContain(
      'notifyParticipants',
    );
    for (const schema of ['Session', 'WorkspaceCalendarSession', 'PersonalSession']) {
      expect(contract.components.schemas[schema].properties.substituteFor).toBeDefined();
      expect(contract.components.schemas[schema].required ?? []).not.toContain('substituteFor');
    }
    expect(contract.components.schemas.PersonalSession.properties.takenOverBy).toBeDefined();
    expect(Object.keys(contract.components.schemas.SubstituteFor.properties)).toEqual([
      'id',
      'trainerProfileId',
      'name',
    ]);
  });

  it('AC14: the events carry the workspace ID and the platform only, and a refusal or an app without a surface records nothing', async () => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const posthog = createProductEventCaptureTransport();
    const productEvents = createProductEvents({
      env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
      transport: posthog,
      errorReporter: createErrorReporter({ env: {} }),
    });
    const w = await krachtWorld({ productEvents });
    const bearer = { authorization: 'Bearer synthetic-token' };
    const events = () =>
      posthog.events.filter(({ event }) =>
        ['trainer_substituted', 'substitution_ended', 'trainer_assigned'].includes(event),
      );
    const properties = () =>
      events().map((event) => [
        event.event,
        Object.fromEntries(
          Object.entries(event.properties ?? {}).filter(([key]) => !key.startsWith('$')),
        ),
      ]);

    // A refusal and a stale version record nothing.
    await substitute(w, w.twentieth.id, w.sarahRole, 1);
    await substitute(w, w.twentieth.id, w.mikeTrainer, 9);
    expect(events()).toEqual([]);

    await substitute(w, w.twentieth.id, w.mikeTrainer, 1, { notifySubstitute: false });
    // The surface is ignored without a bearer token: the web.
    await substitute(w, w.twentieth.id, w.lisaTrainer, 2, {
      notifySubstitute: false,
      surface: 'ios',
    });
    // The app that names its surface (with a bearer token) is the one that is recorded.
    const viaApp = await assign(
      w,
      w.twentieth.id,
      w.john,
      { trainerId: w.sarahRole.id, scope: 'this', version: 3, surface: 'android' },
      bearer,
    );
    expect(viaApp.status).toBe(200);
    // An app that names no surface records nothing.
    await assign(
      w,
      w.twentieth.id,
      w.john,
      { trainerId: w.mikeTrainer.id, scope: 'this', version: 4, notifySubstitute: false },
      bearer,
    );

    expect(properties()).toEqual([
      ['trainer_substituted', { workspace_id: w.gym.id, platform: 'web' }],
      ['trainer_substituted', { workspace_id: w.gym.id, platform: 'web' }],
      ['substitution_ended', { workspace_id: w.gym.id, platform: 'android' }],
    ]);
    expect(events()[0]?.distinct_id).toBe(w.john.id);
    const sent = JSON.stringify(events());
    for (const personal of [
      'Mike',
      'Sarah',
      'Lisa',
      'Anna',
      'Kracht',
      w.twentieth.id,
      w.mikeTrainer.id,
      '2026-10-20',
      'example.com',
    ]) {
      expect(sent).not.toContain(personal);
    }
    for (const log of logs) log.mockRestore();
  });
});
