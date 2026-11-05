import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createPrivateSession,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  findSession,
  findTrainer,
  locations,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerProfiles,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addClient,
  addGroupClass,
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

  it('AC9: a group session needs its class; the other kinds do not', async () => {
    const { gym } = await gymWithSarah();
    const insert = (type: 'private' | 'group' | 'open_gym', groupClassId: string | null) =>
      violated((tx) =>
        addSession(tx, { workspaceId: gym.id, type, groupClassId, participant: false }),
      );

    expect(await insert('group', null)).toBe('sessions_group_has_class');
    expect(
      await violated(async (tx) => {
        const kracht = await addGroupClass(tx, { workspaceId: gym.id });
        await addSession(tx, {
          workspaceId: gym.id,
          type: 'group',
          groupClassId: kracht.id,
          participant: false,
        });
      }),
    ).toBeUndefined();
    expect(await insert('private', null)).toBeUndefined();
    expect(await insert('open_gym', null)).toBeUndefined();
  });

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
    // A group class holds more than one, and is a class on a date (F021).
    expect(
      await violated(async (tx) =>
        insert({
          type: 'group',
          capacity: 12,
          groupClassId: (await addGroupClass(tx, { workspaceId: gym.id })).id,
        })(tx),
      ),
    ).toBeUndefined();
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
});
