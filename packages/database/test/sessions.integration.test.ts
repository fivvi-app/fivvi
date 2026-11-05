import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authUsers,
  createDatabase,
  createPrivateSession,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  findSession,
  findTrainer,
  listUpcomingSessionsOfClient,
  locations,
  rescheduleSession,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerProfiles,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addClient,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The tables of the session engine (F020, spec #425): what the database holds the line on, so no
// route can write what the rules forbid. Row-level security is covered by the RLS suite, which
// has a factory for each table (`rls.integration.test.ts`).

describe('F020 sessions and session participants tables', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 4 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  /** Runs as a team member of the workspace, as the app role where RLS applies. */
  async function asTeam<T>(
    accountId: string,
    workspaceId: string,
    run: (scope: WorkspaceScope) => Promise<T>,
  ): Promise<T> {
    const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
      { accountId, workspaceId, admit: () => 'team' },
      run,
    );
    if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
    return entry.value;
  }

  /** The constraint a statement violates, or `undefined` when it succeeds (rolled back either way). */
  async function violated(insert: (db: DatabaseExecutor) => Promise<unknown>) {
    try {
      await admin.db.transaction(async (tx) => {
        await insert(tx);
        throw new Error('rollback');
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
      if (cause?.code) return cause.constraint ?? cause.code;
      if ((error as Error).message !== 'rollback') throw error;
    }
    return undefined;
  }

  async function gymWithSarah() {
    const gym = await createWorkspace(admin.db);
    const sarah = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: (await createAccount(admin.db, { label: 'sarah' })).id,
    });
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, sarah.id));
    if (!profile) throw new Error('Sarah has no trainer profile.');
    return { gym, sarah, profileId: profile.id };
  }

  it('AC12: a session has a type, a status, a version and its UTC instants; a participant is booked by default', async () => {
    const { gym, profileId } = await gymWithSarah();
    const anna = await addClient(admin.db, { workspaceId: gym.id });
    const startsAt = new Date('2026-09-24T07:00:00.000Z');

    const session = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: anna.id,
      trainerProfileId: profileId,
      startsAt,
    });

    const [stored] = await admin.db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(stored).toMatchObject({
      organizationId: gym.id,
      type: 'private',
      status: 'scheduled',
      trainerProfileId: profileId,
      startsAt,
      endsAt: new Date('2026-09-24T08:00:00.000Z'),
      capacity: 1,
      seriesId: null,
      version: 1,
      createdByTeamMemberId: null,
    });
    const participants = await admin.db
      .select()
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, session.id));
    expect(participants).toEqual([
      expect.objectContaining({
        clientId: anna.id,
        attendanceStatus: 'booked',
        agreementId: null,
      }),
    ]);
  });

  it('AC12: knows the three session types, two statuses and four attendance statuses, and no other', async () => {
    const { gym } = await gymWithSarah();
    for (const type of ['private', 'group', 'open_gym'] as const) {
      expect(
        await violated((tx) => addSession(tx, { workspaceId: gym.id, type, participant: false })),
      ).toBeUndefined();
    }
    expect(
      await violated((tx) =>
        addSession(tx, { workspaceId: gym.id, status: 'cancelled', participant: false }),
      ),
    ).toBeUndefined();

    const enums = await admin.db.execute(
      sql`select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
          from pg_type t join pg_enum e on e.enumtypid = t.oid
          where t.typname in ('session_type', 'session_status', 'attendance_status')
          group by t.typname`,
    );
    expect(Object.fromEntries(enums.rows.map((row) => [row.name, row.labels]))).toEqual({
      session_type: ['private', 'group', 'open_gym'],
      session_status: ['scheduled', 'cancelled'],
      attendance_status: ['booked', 'attended', 'cancelled', 'no_show'],
    });
  });

  it('AC12: refuses an end that is not after the start, and a private session that is not for one', async () => {
    const { gym } = await gymWithSarah();
    const startsAt = new Date('2026-09-24T07:00:00.000Z');
    const insert =
      (values: Partial<typeof sessions.$inferInsert>) => async (tx: DatabaseExecutor) => {
        const [location] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.organizationId, gym.id));
        await tx.insert(sessions).values({
          organizationId: gym.id,
          type: 'private',
          locationId: location?.id ?? '',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
          capacity: 1,
          ...values,
        });
      };

    expect(await violated(insert({ endsAt: startsAt }))).toBe('sessions_ends_after_starts');
    expect(await violated(insert({ endsAt: new Date(startsAt.getTime() - 1) }))).toBe(
      'sessions_ends_after_starts',
    );
    expect(await violated(insert({ capacity: 2 }))).toBe('sessions_private_has_capacity_one');
    expect(await violated(insert({ capacity: 0, type: 'group' }))).toBe(
      'sessions_capacity_positive',
    );
    expect(await violated(insert({ version: 0 }))).toBe('sessions_version_positive');
    // A group class holds more than one.
    expect(await violated(insert({ type: 'group', capacity: 12 }))).toBeUndefined();
  });

  it('AC12: a client has one place per session', async () => {
    const { gym } = await gymWithSarah();
    const anna = await addClient(admin.db, { workspaceId: gym.id });
    const session = await addSession(admin.db, {
      workspaceId: gym.id,
      clientId: anna.id,
      type: 'group',
    });

    expect(
      await violated((tx) =>
        tx.insert(sessionParticipants).values({
          organizationId: gym.id,
          sessionId: session.id,
          clientId: anna.id,
        }),
      ),
    ).toBe('session_participants_session_id_client_id_unique');
    // Another client may join the same group class.
    expect(
      await violated(async (tx) =>
        tx.insert(sessionParticipants).values({
          organizationId: gym.id,
          sessionId: session.id,
          clientId: (await addClient(tx, { workspaceId: gym.id })).id,
        }),
      ),
    ).toBeUndefined();
  });

  it('AC12: the foreign keys keep the trainer, the location, the creator and the client inside the session’s workspace', async () => {
    const { gym, sarah, profileId } = await gymWithSarah();
    const { gym: other, profileId: otherProfileId, sarah: otherSarah } = await gymWithSarah();
    const [otherLocation] = await admin.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, other.id));
    const otherClient = await addClient(admin.db, { workspaceId: other.id });
    const mine = await addSession(admin.db, { workspaceId: gym.id, participant: false });

    expect(
      await violated((tx) =>
        addSession(tx, {
          workspaceId: gym.id,
          trainerProfileId: otherProfileId,
          participant: false,
        }),
      ),
    ).toBe('sessions_trainer_profile_fk');
    expect(
      await violated((tx) =>
        addSession(tx, {
          workspaceId: gym.id,
          locationId: otherLocation?.id ?? '',
          participant: false,
        }),
      ),
    ).toBe('sessions_location_fk');
    expect(
      await violated((tx) =>
        addSession(tx, {
          workspaceId: gym.id,
          createdByTeamMemberId: otherSarah.id,
          participant: false,
        }),
      ),
    ).toBe('sessions_created_by_fk');
    expect(
      await violated((tx) =>
        tx.insert(sessionParticipants).values({
          organizationId: gym.id,
          sessionId: mine.id,
          clientId: otherClient.id,
        }),
      ),
    ).toBe('session_participants_client_fk');
    expect(
      await violated(async (tx) => {
        const theirs = await addSession(tx, { workspaceId: other.id, participant: false });
        await tx.insert(sessionParticipants).values({
          organizationId: gym.id,
          sessionId: theirs.id,
          clientId: (await addClient(tx, { workspaceId: gym.id })).id,
        });
      }),
    ).toBe('session_participants_session_fk');
    // The same workspace is fine for all of them.
    expect(
      await violated((tx) =>
        addSession(tx, {
          workspaceId: gym.id,
          trainerProfileId: profileId,
          createdByTeamMemberId: sarah.id,
        }),
      ),
    ).toBeUndefined();
  });

  it('AC12: removing a team member clears the trainer and the creator of their sessions and keeps the sessions', async () => {
    const { gym, sarah, profileId } = await gymWithSarah();
    const session = await addSession(admin.db, {
      workspaceId: gym.id,
      trainerProfileId: profileId,
      createdByTeamMemberId: sarah.id,
    });

    await admin.db.delete(teamMembers).where(eq(teamMembers.id, sarah.id));

    const [stored] = await admin.db.select().from(sessions).where(eq(sessions.id, session.id));
    // Only the two columns are cleared: the session is still the workspace's.
    expect(stored).toMatchObject({
      organizationId: gym.id,
      trainerProfileId: null,
      createdByTeamMemberId: null,
    });
    expect(
      await admin.db
        .select()
        .from(sessionParticipants)
        .where(eq(sessionParticipants.sessionId, session.id)),
    ).toHaveLength(1);
  });

  it('AC12: switching off training clears the trainer the same way', async () => {
    const { gym, profileId } = await gymWithSarah();
    const session = await addSession(admin.db, {
      workspaceId: gym.id,
      trainerProfileId: profileId,
    });

    await admin.db.delete(trainerProfiles).where(eq(trainerProfiles.id, profileId));

    const [stored] = await admin.db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(stored).toMatchObject({ organizationId: gym.id, trainerProfileId: null });
  });

  it('AC12: a client with a place in a session is not removed from under it, and a session takes its places with it', async () => {
    const { gym } = await gymWithSarah();
    const anna = await addClient(admin.db, { workspaceId: gym.id });
    const session = await addSession(admin.db, { workspaceId: gym.id, clientId: anna.id });

    // Neither the client nor the session is deleted by any route; the database refuses the client's.
    expect(await violated((tx) => tx.execute(sql`delete from clients where id = ${anna.id}`))).toBe(
      'session_participants_client_fk',
    );
    // Deleting a session (no route does) takes its places with it, not a client.
    await admin.db.execute(sql`delete from sessions where id = ${session.id}`);
    expect(
      await admin.db
        .select()
        .from(sessionParticipants)
        .where(eq(sessionParticipants.sessionId, session.id)),
    ).toEqual([]);
  });

  describe('the repository, as the app role', () => {
    it('stores a private session with its one booked client and reads it back with the trainer, the location and the client', async () => {
      const { gym, sarah } = await gymWithSarah();
      const john = await createAccount(admin.db, { label: 'john' });
      const johnRole = await addTeamRole(admin.db, {
        workspaceId: gym.id,
        accountId: john.id,
        role: 'owner',
      });
      const anna = await addClient(admin.db, { workspaceId: gym.id, name: 'Anna de Vries' });
      const [location] = await admin.db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(eq(locations.organizationId, gym.id));

      const created = await asTeam(john.id, gym.id, async (scope) => {
        const trainer = await findTrainer(scope, sarah.id);
        if (!trainer) throw new Error('Sarah does not train.');
        return createPrivateSession(scope, {
          trainerProfileId: trainer.trainerProfileId,
          locationId: location?.id ?? '',
          startsAt: new Date('2026-09-24T07:00:00.000Z'),
          endsAt: new Date('2026-09-24T08:00:00.000Z'),
          capacity: 1,
          clientId: anna.id,
          createdByTeamMemberId: johnRole.id,
        });
      });

      expect(created).toMatchObject({
        type: 'private',
        status: 'scheduled',
        startsAt: new Date('2026-09-24T07:00:00.000Z'),
        endsAt: new Date('2026-09-24T08:00:00.000Z'),
        capacity: 1,
        version: 1,
        location: { id: location?.id, name: location?.name, isDefault: true },
        trainer: { id: sarah.id },
        participants: [{ clientId: anna.id, name: 'Anna de Vries', attendanceStatus: 'booked' }],
      });
      expect(await asTeam(john.id, gym.id, (scope) => findSession(scope, created.id))).toEqual(
        created,
      );
      const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.id));
      expect(row?.createdByTeamMemberId).toBe(johnRole.id);
    });

    it('does not find a session of another workspace, and finds a trainer only where they train', async () => {
      const { gym, sarah } = await gymWithSarah();
      const { gym: other } = await gymWithSarah();
      const session = await addSession(admin.db, { workspaceId: other.id });
      const mike = await createAccount(admin.db, { label: 'mike' });
      await addTeamRole(admin.db, { workspaceId: gym.id, accountId: mike.id, role: 'owner' });

      await asTeam(mike.id, gym.id, async (scope) => {
        expect(await findSession(scope, session.id)).toBeUndefined();
        expect(await findTrainer(scope, sarah.id)).toMatchObject({ id: sarah.id });
        // An Owner who does not train has no trainer profile: not a trainer of the workspace.
        const [mikeRole] = await admin.db
          .select({ id: teamMembers.id })
          .from(teamMembers)
          .where(eq(teamMembers.accountId, mike.id));
        expect(await findTrainer(scope, mikeRole?.id ?? '')).toBeUndefined();
      });
    });

    it('shows a session whose trainer has gone with no trainer', async () => {
      const { gym, profileId } = await gymWithSarah();
      const john = await createAccount(admin.db, { label: 'john' });
      await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
      const session = await addSession(admin.db, {
        workspaceId: gym.id,
        trainerProfileId: profileId,
      });
      await admin.db.delete(trainerProfiles).where(eq(trainerProfiles.id, profileId));

      const found = await asTeam(john.id, gym.id, (scope) => findSession(scope, session.id));

      expect(found).toMatchObject({ trainer: null, participants: [expect.anything()] });
    });
  });
  describe('rescheduling and upcoming sessions, as the app role', () => {
    async function gymWithJohnAndSarah() {
      const { gym, sarah, profileId } = await gymWithSarah();
      const john = await createAccount(admin.db, { label: 'john' });
      await admin.db.update(authUsers).set({ name: 'John' }).where(eq(authUsers.id, john.id));
      const johnRole = await addTeamRole(admin.db, {
        workspaceId: gym.id,
        accountId: john.id,
        role: 'owner',
      });
      const anna = await addClient(admin.db, { workspaceId: gym.id, name: 'Anna de Vries' });
      return { gym, sarah, profileId, john, johnRole, anna };
    }

    const FRIDAY = {
      startsAt: new Date('2026-09-25T08:00:00.000Z'),
      endsAt: new Date('2026-09-25T09:00:00.000Z'),
    };

    it('AC6: moves the session, raises the version, keeps the location, trainer and client, and records who did it', async () => {
      const { gym, profileId, john, johnRole, anna, sarah } = await gymWithJohnAndSarah();
      const session = await addSession(admin.db, {
        workspaceId: gym.id,
        clientId: anna.id,
        trainerProfileId: profileId,
        startsAt: new Date('2026-09-24T07:00:00.000Z'),
        createdByTeamMemberId: sarah.id,
      });

      const moved = await asTeam(john.id, gym.id, (scope) =>
        rescheduleSession(scope, {
          sessionId: session.id,
          expectedVersion: 1,
          ...FRIDAY,
          changedByTeamMemberId: johnRole.id,
        }),
      );

      expect(moved).toMatchObject({
        id: session.id,
        ...FRIDAY,
        version: 2,
        status: 'scheduled',
        location: { id: session.locationId },
        trainer: { id: sarah.id },
        participants: [{ clientId: anna.id, attendanceStatus: 'booked' }],
        lastChangedBy: { id: johnRole.id, name: 'John' },
      });
      const found = await asTeam(john.id, gym.id, (scope) => findSession(scope, session.id));
      expect(found).toEqual(moved);
    });

    it('AC8: a stale version changes nothing and answers undefined; a session of another workspace too', async () => {
      const { gym, profileId, john, johnRole, anna } = await gymWithJohnAndSarah();
      const { gym: other } = await gymWithSarah();
      const session = await addSession(admin.db, {
        workspaceId: gym.id,
        clientId: anna.id,
        trainerProfileId: profileId,
        version: 3,
      });
      const foreign = await addSession(admin.db, { workspaceId: other.id });
      const change = (sessionId: string, expectedVersion: number) =>
        asTeam(john.id, gym.id, (scope) =>
          rescheduleSession(scope, {
            sessionId,
            expectedVersion,
            ...FRIDAY,
            changedByTeamMemberId: johnRole.id,
          }),
        );

      expect(await change(session.id, 2)).toBeUndefined();
      expect(await change(foreign.id, 1)).toBeUndefined();

      const rows = await admin.db
        .select()
        .from(sessions)
        .where(eq(sessions.organizationId, gym.id));
      expect(rows).toEqual([expect.objectContaining({ startsAt: session.startsAt, version: 3 })]);
      const [foreignRow] = await admin.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, foreign.id));
      expect(foreignRow).toMatchObject({ startsAt: foreign.startsAt, version: 1 });
    });

    it('AC8: of two changes from the same version at the same time, one wins and the other changes nothing', async () => {
      const { gym, profileId, john, johnRole, anna } = await gymWithJohnAndSarah();
      const session = await addSession(admin.db, {
        workspaceId: gym.id,
        clientId: anna.id,
        trainerProfileId: profileId,
      });
      const change = (hours: number) =>
        asTeam(john.id, gym.id, (scope) =>
          rescheduleSession(scope, {
            sessionId: session.id,
            expectedVersion: 1,
            startsAt: new Date(FRIDAY.startsAt.getTime() + hours * 3_600_000),
            endsAt: new Date(FRIDAY.endsAt.getTime() + hours * 3_600_000),
            changedByTeamMemberId: johnRole.id,
          }),
        );

      const results = await Promise.all([change(0), change(1)]);

      expect(results.filter((result) => result !== undefined)).toHaveLength(1);
      const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, session.id));
      expect(row?.version).toBe(2);
    });

    it('names who planned the session until someone else changes it, and no one once they are gone', async () => {
      const { gym, john, johnRole, anna, sarah, profileId } = await gymWithJohnAndSarah();
      const [location] = await admin.db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.organizationId, gym.id));
      const planned = await asTeam(john.id, gym.id, (scope) =>
        createPrivateSession(scope, {
          trainerProfileId: profileId,
          locationId: location?.id ?? '',
          startsAt: new Date('2026-09-24T07:00:00.000Z'),
          endsAt: new Date('2026-09-24T08:00:00.000Z'),
          capacity: 1,
          clientId: anna.id,
          createdByTeamMemberId: sarah.id,
        }),
      );
      expect(planned.lastChangedBy).toMatchObject({ id: sarah.id });

      const moved = await asTeam(john.id, gym.id, (scope) =>
        rescheduleSession(scope, {
          sessionId: planned.id,
          expectedVersion: 1,
          ...FRIDAY,
          changedByTeamMemberId: johnRole.id,
        }),
      );
      expect(moved?.lastChangedBy).toEqual({ id: johnRole.id, name: 'John' });

      await admin.db.delete(teamMembers).where(eq(teamMembers.id, johnRole.id));
      const gone = await admin.db.select().from(sessions).where(eq(sessions.id, planned.id));
      expect(gone[0]).toMatchObject({ updatedByTeamMemberId: null, version: 2 });
    });

    it('AC9: lists the next sessions of a client in order, from now, private and scheduled only', async () => {
      const { gym, profileId, john, anna } = await gymWithJohnAndSarah();
      const mark = await addClient(admin.db, { workspaceId: gym.id });
      const now = new Date('2026-09-17T10:00:00.000Z');
      const at = (days: number, hours = 0) =>
        new Date(now.getTime() + days * 86_400_000 + hours * 3_600_000);
      const plan = (clientId: string, startsAt: Date, extra: Record<string, unknown> = {}) =>
        addSession(admin.db, {
          workspaceId: gym.id,
          clientId,
          trainerProfileId: profileId,
          startsAt,
          ...extra,
        });
      const third = await plan(anna.id, at(9));
      const first = await plan(anna.id, at(2));
      const second = await plan(anna.id, at(5));
      await plan(anna.id, at(-1)); // past
      await plan(anna.id, at(3), { status: 'cancelled' });
      await plan(anna.id, at(4), { type: 'group' });
      // A scheduled session whose place Anna cancelled is not one she is coming to.
      const placeCancelled = await plan(anna.id, at(6));
      await admin.db
        .update(sessionParticipants)
        .set({ attendanceStatus: 'cancelled' })
        .where(eq(sessionParticipants.sessionId, placeCancelled.id));
      await plan(mark.id, at(1)); // another client's
      const startsNow = await plan(anna.id, now);

      const upcoming = await asTeam(john.id, gym.id, (scope) =>
        listUpcomingSessionsOfClient(scope, anna.id, { now, limit: 5 }),
      );

      expect(upcoming.map(({ id }) => id)).toEqual([startsNow.id, first.id, second.id, third.id]);
      expect(upcoming[1]).toMatchObject({
        startsAt: first.startsAt,
        endsAt: first.endsAt,
        trainer: { name: expect.any(String) },
      });
    });

    it('lists at most the limit, and an empty list for a client without sessions', async () => {
      const { gym, profileId, john, anna } = await gymWithJohnAndSarah();
      const lonely = await addClient(admin.db, { workspaceId: gym.id });
      const now = new Date('2026-09-17T10:00:00.000Z');
      for (const days of [1, 2, 3, 4, 5, 6, 7]) {
        await addSession(admin.db, {
          workspaceId: gym.id,
          clientId: anna.id,
          trainerProfileId: profileId,
          startsAt: new Date(now.getTime() + days * 86_400_000),
        });
      }

      await asTeam(john.id, gym.id, async (scope) => {
        expect(await listUpcomingSessionsOfClient(scope, anna.id, { now, limit: 5 })).toHaveLength(
          5,
        );
        expect(await listUpcomingSessionsOfClient(scope, lonely.id, { now, limit: 5 })).toEqual([]);
      });
    });

    it('does not list the sessions of a client of another workspace', async () => {
      const { gym, john } = await gymWithJohnAndSarah();
      const { gym: other } = await gymWithSarah();
      const foreignClient = await addClient(admin.db, { workspaceId: other.id });
      await addSession(admin.db, {
        workspaceId: other.id,
        clientId: foreignClient.id,
        startsAt: new Date('2026-09-20T10:00:00.000Z'),
      });

      const upcoming = await asTeam(john.id, gym.id, (scope) =>
        listUpcomingSessionsOfClient(scope, foreignClient.id, {
          now: new Date('2026-09-17T10:00:00.000Z'),
          limit: 5,
        }),
      );

      expect(upcoming).toEqual([]);
    });
  });
});
