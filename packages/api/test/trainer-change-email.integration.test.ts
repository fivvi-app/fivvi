import {
  authUsers,
  createDatabase,
  type DatabaseClient,
  sessionParticipants,
  sessions,
} from '@fivvi/database';
import { addClient, addTeamRole, createAccount } from '@fivvi/database/testing';
import { createMemoryTransport, createSendEmail, createTrainerChangeSender } from '@fivvi/email';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CreatedClassBody,
  call,
  createClass,
  groupClassWorld,
  kracht,
  type SessionBody,
  scheduleClass,
  setupGroupClassApi,
} from './group-classes-world.ts';

// F023 (spec #459, ticket #536), AC17: the trainer-change email to clients. Synthetic people:
// John (Owner of John's Gym), Sarah (Trainer), Mike (Trainer), Anna de Vries (emails in Dutch) and
// Mark Jansen (emails in English). Kracht every Tuesday 18:00 from 6 October 2026; participants
// are inserted directly until M5's booking exists. "Now" is Monday 28 September.

interface Assigned {
  clientsNotified: number;
  keptDates: number;
  session: SessionBody;
}

describe('F023 the trainer-change email', () => {
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

  async function world() {
    const people = await groupClassWorld(admin);
    const mikeAccount = await createAccount(admin.db, { label: 'mike-trainer' });
    await admin.db.update(authUsers).set({ name: 'Mike' }).where(eq(authUsers.id, mikeAccount.id));
    const mike = await addTeamRole(admin.db, {
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
    });
    const { groupClass } = (await (
      await createClass(api.server, people.gym.id, people.john, kracht(people.sarahRole.id))
    ).json()) as CreatedClassBody;
    await scheduleClass(api.server, people.gym.id, groupClass.id, people.john, {
      localDate: '2026-10-06',
      localStart: '18:00',
      repeat: 'weekly',
    });
    const dateOn = async (day: string) => {
      const [row] = (
        await admin.db.select().from(sessions).where(eq(sessions.organizationId, people.gym.id))
      ).filter((candidate) => candidate.occurrenceDate === day);
      if (!row) throw new Error(`no date on ${day}`);
      return row;
    };
    const book = async (clientId: string, day: string) => {
      const date = await dateOn(day);
      await admin.db.insert(sessionParticipants).values({
        organizationId: people.gym.id,
        sessionId: date.id,
        clientId,
      });
    };
    // Anna on 13 and 20 October, Mark on 20 October only.
    await book(anna.id, '2026-10-13');
    await book(anna.id, '2026-10-20');
    await book(mark.id, '2026-10-20');
    return { ...people, ...api, groupClass, mike, anna, mark, transport, dateOn };
  }
  type World = Awaited<ReturnType<typeof world>>;

  const assign = (w: World, sessionId: string, body: Record<string, unknown>) =>
    call(
      w.server,
      'POST',
      `/v1/workspaces/${w.gym.id}/sessions/${sessionId}/trainer`,
      w.john,
      body,
    );

  it('AC17: Anna gets one Dutch email for 13 and 20 October, Mark one English for 20 October, neither names the other', async () => {
    const w = await world();
    const thirteenth = await w.dateOn('2026-10-13');
    const dialog = await call(
      w.server,
      'GET',
      `/v1/workspaces/${w.gym.id}/sessions/${thirteenth.id}/trainer-candidates`,
      w.john,
    );
    expect(
      ((await dialog.json()) as { participantsToNotify: unknown }).participantsToNotify,
    ).toEqual({
      forThisDate: 1,
      forFollowingDates: 2,
    });

    const response = await assign(w, thirteenth.id, {
      trainerId: w.mike.id,
      scope: 'following',
      version: 1,
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Assigned).clientsNotified).toBe(2);
    expect(w.transport.sent).toHaveLength(2);
    const toAnna = w.transport.sent.find((email) => email.to.email === 'anna@example.com');
    const toMark = w.transport.sent.find((email) => email.to.email === 'mark@example.com');
    expect(toAnna).toMatchObject({
      locale: 'nl-NL',
      subject: 'Andere trainer: Kracht vanaf dinsdag 13 oktober',
    });
    expect(toAnna?.text).toContain('dinsdag 13 oktober 2026, 18:00 tot 19:00');
    expect(toAnna?.text).toContain('dinsdag 20 oktober 2026, 18:00 tot 19:00');
    expect(toAnna?.text).toContain('Je traint nu met Mike.');
    expect(toMark).toMatchObject({
      locale: 'en',
      subject: 'New trainer: Strength on Tuesday 20 October',
    });
    expect(toMark?.text).toContain('Tuesday, 20 October 2026, 18:00 to 19:00');
    expect(toMark?.text).not.toContain('13 October');
    // Neither names the other, and no email address of the trainer or of the other client.
    expect(toAnna?.text).not.toContain('Mark');
    expect(toMark?.text).not.toContain('Anna');
    for (const email of w.transport.sent) {
      expect(email.text).not.toContain('@example.com');
      expect(email.html).not.toContain('@example.com');
    }
    // Each email is its own event: a key per recipient.
    expect(new Set(w.transport.sent.map((email) => email.idempotencyKey)).size).toBe(2);
  });

  it('AC17: unchecked, nothing is sent', async () => {
    const w = await world();
    const thirteenth = await w.dateOn('2026-10-13');

    const response = await assign(w, thirteenth.id, {
      trainerId: w.mike.id,
      scope: 'following',
      version: 1,
      notifyClients: false,
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Assigned).clientsNotified).toBe(0);
    expect(w.transport.sent).toEqual([]);
  });

  it('AC17: Trainer toewijzen on a date that had Trainer nodig sends the same email to its participants', async () => {
    const w = await world();
    const { groupClass } = (await (
      await createClass(w.server, w.gym.id, w.john, {
        ...kracht(),
        nameNl: 'Boxing',
        nameEn: 'Boxing',
      })
    ).json()) as CreatedClassBody;
    const date = (await (
      await scheduleClass(w.server, w.gym.id, groupClass.id, w.john, {
        localDate: '2026-10-08',
        localStart: '19:15',
      })
    ).json()) as SessionBody;
    await admin.db.insert(sessionParticipants).values({
      organizationId: w.gym.id,
      sessionId: date.id,
      clientId: w.mark.id,
    });

    const response = await assign(w, date.id, { trainerId: w.mike.id, version: 1 });

    expect(response.status).toBe(200);
    expect(w.transport.sent).toHaveLength(1);
    expect(w.transport.sent[0]).toMatchObject({
      to: { email: 'mark@example.com' },
      subject: 'New trainer: Boxing on Thursday 8 October',
    });
  });

  it('a cancelled place gets nothing, and a client booked on dates the change does not reach gets nothing', async () => {
    const w = await world();
    const thirteenth = await w.dateOn('2026-10-13');
    await admin.db
      .update(sessionParticipants)
      .set({ attendanceStatus: 'cancelled' })
      .where(eq(sessionParticipants.clientId, w.anna.id));

    // From 20 October on: Anna's cancelled places do not count, Mark is on 20 October.
    const twentieth = await w.dateOn('2026-10-20');
    const response = await assign(w, twentieth.id, {
      trainerId: w.mike.id,
      scope: 'following',
      version: 1,
    });

    expect(response.status).toBe(200);
    expect(thirteenth.id).not.toBe(twentieth.id);
    expect(w.transport.sent.map((email) => email.to.email)).toEqual(['mark@example.com']);
  });
});
