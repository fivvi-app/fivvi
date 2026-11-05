import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createGroupClass,
  createGroupSession,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  findGroupClass,
  findSession,
  findTrainer,
  groupClasses,
  listGroupClasses,
  locations,
  sessions,
  trainerProfiles,
  updateGroupClass,
  updateGroupSession,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addGroupClass,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The class tables and their repository (F021, spec #427): what the database holds the line on, and
// what the repository stores and reads as the app role. Row-level security is covered by the RLS
// suite, which has a factory for `group_classes` (`rls.integration.test.ts`).

describe('F021 group classes', () => {
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

  async function gym() {
    const workspace = await createWorkspace(admin.db);
    const john = await createAccount(admin.db, { label: 'john' });
    const johnRole = await addTeamRole(admin.db, {
      workspaceId: workspace.id,
      accountId: john.id,
      role: 'owner',
    });
    const sarahAccount = await createAccount(admin.db, { label: 'sarah' });
    const sarah = await addTeamRole(admin.db, {
      workspaceId: workspace.id,
      accountId: sarahAccount.id,
    });
    const [profile] = await admin.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.teamMemberId, sarah.id));
    if (!profile) throw new Error('Sarah has no trainer profile.');
    const [location] = await admin.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, workspace.id));
    return {
      workspace,
      john,
      johnRole,
      sarah,
      sarahAccount,
      profileId: profile.id,
      locationId: location?.id ?? '',
    };
  }

  describe('the tables', () => {
    it('AC9: a group session needs its class; the other kinds do not', async () => {
      const { workspace } = await gym();
      const insert = (type: 'private' | 'group' | 'open_gym', groupClassId: string | null) =>
        violated((tx) =>
          addSession(tx, { workspaceId: workspace.id, type, groupClassId, participant: false }),
        );

      expect(await insert('group', null)).toBe('sessions_group_has_class');
      expect(
        await violated(async (tx) => {
          const kracht = await addGroupClass(tx, { workspaceId: workspace.id });
          await addSession(tx, {
            workspaceId: workspace.id,
            type: 'group',
            groupClassId: kracht.id,
            participant: false,
          });
        }),
      ).toBeUndefined();
      expect(await insert('private', null)).toBeUndefined();
      expect(await insert('open_gym', null)).toBeUndefined();
    });

    it('a class on a date points at a class of its own workspace only', async () => {
      const { workspace } = await gym();
      const other = await gym();
      const theirs = await addGroupClass(admin.db, { workspaceId: other.workspace.id });

      expect(
        await violated((tx) =>
          addSession(tx, {
            workspaceId: workspace.id,
            type: 'group',
            groupClassId: theirs.id,
            participant: false,
          }),
        ),
      ).toBe('sessions_group_class_fk');
    });

    it('a class holds the limits of the spec: a Dutch name up to 80, capacity 1 to 100, 15 to 240 minutes in steps of 5', async () => {
      const { workspace } = await gym();
      const add = (values: Partial<Parameters<typeof addGroupClass>[1]>) =>
        violated((tx) => addGroupClass(tx, { workspaceId: workspace.id, ...values }));

      expect(await add({})).toBeUndefined();
      expect(await add({ nameNl: '' })).toBe('group_classes_name_nl_valid');
      expect(await add({ nameNl: '   ' })).toBe('group_classes_name_nl_valid');
      expect(await add({ nameNl: 'x'.repeat(81) })).toBe('group_classes_name_nl_valid');
      expect(await add({ nameNl: 'x'.repeat(80) })).toBeUndefined();
      expect(await add({ nameEn: '' })).toBe('group_classes_name_en_valid');
      expect(await add({ nameEn: 'x'.repeat(81) })).toBe('group_classes_name_en_valid');
      expect(await add({ descriptionNl: 'x'.repeat(501) })).toBe(
        'group_classes_descriptions_valid',
      );
      expect(await add({ descriptionEn: 'x'.repeat(500) })).toBeUndefined();
      expect(await add({ descriptionEn: ' ' })).toBe('group_classes_descriptions_valid');
      expect(await add({ capacity: 0 })).toBe('group_classes_capacity_valid');
      expect(await add({ capacity: 101 })).toBe('group_classes_capacity_valid');
      expect(await add({ capacity: 100 })).toBeUndefined();
      expect(await add({ durationMinutes: 10 })).toBe('group_classes_duration_valid');
      expect(await add({ durationMinutes: 7 })).toBe('group_classes_duration_valid');
      expect(await add({ durationMinutes: 245 })).toBe('group_classes_duration_valid');
      expect(await add({ durationMinutes: 15 })).toBeUndefined();
      expect(await add({ durationMinutes: 240 })).toBeUndefined();
    });

    it('the usual trainer is a trainer of the class’s workspace; losing the profile makes it Trainer nodig and keeps the class', async () => {
      const { workspace, profileId } = await gym();
      const other = await gym();

      expect(
        await violated((tx) =>
          addGroupClass(tx, {
            workspaceId: workspace.id,
            defaultTrainerProfileId: other.profileId,
          }),
        ),
      ).toBe('group_classes_default_trainer_fk');

      const kracht = await addGroupClass(admin.db, {
        workspaceId: workspace.id,
        defaultTrainerProfileId: profileId,
      });
      await admin.db.delete(trainerProfiles).where(eq(trainerProfiles.id, profileId));

      const [stored] = await admin.db
        .select()
        .from(groupClasses)
        .where(eq(groupClasses.id, kracht.id));
      expect(stored).toMatchObject({
        organizationId: workspace.id,
        defaultTrainerProfileId: null,
        archivedAt: null,
      });
    });
  });

  describe('the repository, as the app role', () => {
    it('AC1: stores a class and reads it back with the usual trainer, in the list sorted by Dutch name', async () => {
      const { workspace, john, sarah, profileId } = await gym();
      await addGroupClass(admin.db, { workspaceId: workspace.id, nameNl: 'Yoga' });

      const created = await asTeam(john.id, workspace.id, async (scope) => {
        const trainer = await findTrainer(scope, sarah.id);
        return createGroupClass(scope, {
          nameNl: 'Kracht',
          nameEn: 'Strength',
          descriptionNl: 'Een uur trainen met gewichten',
          descriptionEn: null,
          defaultTrainerProfileId: trainer?.trainerProfileId ?? null,
          capacity: 8,
          durationMinutes: 60,
        });
      });

      expect(created).toMatchObject({
        nameNl: 'Kracht',
        nameEn: 'Strength',
        descriptionNl: 'Een uur trainen met gewichten',
        descriptionEn: null,
        capacity: 8,
        durationMinutes: 60,
        defaultTrainer: { id: sarah.id },
        defaultTrainerProfileId: profileId,
      });
      const [row] = await admin.db
        .select()
        .from(groupClasses)
        .where(eq(groupClasses.id, created.id));
      expect(row?.organizationId).toBe(workspace.id);
      expect(
        (await asTeam(john.id, workspace.id, (scope) => listGroupClasses(scope))).map(
          (each) => each.nameNl,
        ),
      ).toEqual(['Kracht', 'Yoga']);
      expect(
        await asTeam(john.id, workspace.id, (scope) => findGroupClass(scope, created.id)),
      ).toEqual(created);
    });

    it('does not find, list or change a class of another workspace', async () => {
      const { workspace, john } = await gym();
      const other = await gym();
      const theirs = await addGroupClass(admin.db, { workspaceId: other.workspace.id });

      await asTeam(john.id, workspace.id, async (scope) => {
        expect(await findGroupClass(scope, theirs.id)).toBeUndefined();
        expect(await listGroupClasses(scope)).toEqual([]);
        expect(await updateGroupClass(scope, theirs.id, { nameNl: 'Gekaapt' })).toBeUndefined();
      });
      const [stored] = await admin.db
        .select({ nameNl: groupClasses.nameNl })
        .from(groupClasses)
        .where(eq(groupClasses.id, theirs.id));
      expect(stored?.nameNl).toBe(theirs.nameNl);
    });

    it('changes the fields it is given, clears an optional text or the trainer with null, and keeps the rest', async () => {
      const { workspace, john, profileId } = await gym();
      const kracht = await addGroupClass(admin.db, {
        workspaceId: workspace.id,
        nameNl: 'Kracht',
        nameEn: 'Strength',
        descriptionEn: 'Heavy',
        defaultTrainerProfileId: profileId,
      });

      const updated = await asTeam(john.id, workspace.id, (scope) =>
        updateGroupClass(scope, kracht.id, {
          nameEn: null,
          capacity: 10,
          defaultTrainerProfileId: null,
        }),
      );

      expect(updated).toMatchObject({
        nameNl: 'Kracht',
        nameEn: null,
        descriptionEn: 'Heavy',
        capacity: 10,
        durationMinutes: 60,
        defaultTrainer: null,
      });
    });

    it('AC3: stores a group session with the class, the trainer, the capacity and the UTC instants, and reads it back with its class', async () => {
      const { workspace, john, johnRole, sarah, profileId, locationId } = await gym();
      const kracht = await addGroupClass(admin.db, {
        workspaceId: workspace.id,
        nameNl: 'Kracht',
        nameEn: 'Strength',
        defaultTrainerProfileId: profileId,
      });

      const created = await asTeam(john.id, workspace.id, (scope) =>
        createGroupSession(scope, {
          groupClassId: kracht.id,
          trainerProfileId: profileId,
          locationId,
          startsAt: new Date('2026-10-06T16:00:00.000Z'),
          endsAt: new Date('2026-10-06T17:00:00.000Z'),
          capacity: 8,
          createdByTeamMemberId: johnRole.id,
        }),
      );

      expect(created).toMatchObject({
        type: 'group',
        status: 'scheduled',
        capacity: 8,
        version: 1,
        trainer: { id: sarah.id },
        groupClass: { id: kracht.id, nameNl: 'Kracht', nameEn: 'Strength' },
        participants: [],
      });
      expect(
        await asTeam(john.id, workspace.id, (scope) => findSession(scope, created.id)),
      ).toEqual(created);
      // A private session has no class.
      const privateSession = await addSession(admin.db, { workspaceId: workspace.id });
      expect(
        await asTeam(john.id, workspace.id, (scope) => findSession(scope, privateSession.id)),
      ).toMatchObject({ groupClass: null });
    });

    it('AC5: a date without a trainer reads back with no trainer', async () => {
      const { workspace, john, locationId } = await gym();
      const kracht = await addGroupClass(admin.db, { workspaceId: workspace.id });

      const created = await asTeam(john.id, workspace.id, (scope) =>
        createGroupSession(scope, {
          groupClassId: kracht.id,
          trainerProfileId: null,
          locationId,
          startsAt: new Date('2026-10-06T16:00:00.000Z'),
          endsAt: new Date('2026-10-06T17:00:00.000Z'),
          capacity: 8,
          createdByTeamMemberId: null,
        }),
      );

      expect(created.trainer).toBeNull();
    });

    describe('updateGroupSession', () => {
      async function aDate() {
        const world = await gym();
        const kracht = await addGroupClass(admin.db, {
          workspaceId: world.workspace.id,
          capacity: 8,
        });
        const date = await addSession(admin.db, {
          workspaceId: world.workspace.id,
          type: 'group',
          groupClassId: kracht.id,
          participant: false,
          startsAt: new Date('2026-10-06T16:00:00.000Z'),
          capacity: 8,
        });
        return { ...world, kracht, date };
      }

      it('AC4: changes the start, end and capacity of the date, raises the version and leaves the class alone', async () => {
        const { workspace, john, kracht, date } = await aDate();

        const result = await asTeam(john.id, workspace.id, (scope) =>
          updateGroupSession(scope, date.id, {
            version: 1,
            startsAt: new Date('2026-10-06T16:30:00.000Z'),
            endsAt: new Date('2026-10-06T17:00:00.000Z'),
            capacity: 10,
          }),
        );

        expect(result).toMatchObject({
          outcome: 'updated',
          session: {
            startsAt: new Date('2026-10-06T16:30:00.000Z'),
            endsAt: new Date('2026-10-06T17:00:00.000Z'),
            capacity: 10,
            version: 2,
            groupClass: { id: kracht.id },
          },
        });
        const [stored] = await admin.db
          .select({ capacity: groupClasses.capacity })
          .from(groupClasses)
          .where(eq(groupClasses.id, kracht.id));
        expect(stored?.capacity).toBe(8);
      });

      it('a save from an old version changes nothing and says so', async () => {
        const { workspace, john, date } = await aDate();
        const change = (version: number, capacity: number) =>
          asTeam(john.id, workspace.id, (scope) =>
            updateGroupSession(scope, date.id, {
              version,
              startsAt: date.startsAt,
              endsAt: date.endsAt,
              capacity,
            }),
          );

        expect(await change(1, 9)).toMatchObject({ outcome: 'updated' });
        expect(await change(1, 12)).toEqual({ outcome: 'stale' });

        const [stored] = await admin.db.select().from(sessions).where(eq(sessions.id, date.id));
        expect(stored).toMatchObject({ capacity: 9, version: 2 });
      });

      it('finds only a group session of its own workspace', async () => {
        const { workspace, john } = await aDate();
        const other = await aDate();
        const privateSession = await addSession(admin.db, { workspaceId: workspace.id });
        const attempt = (sessionId: string) =>
          asTeam(john.id, workspace.id, (scope) =>
            updateGroupSession(scope, sessionId, {
              version: 1,
              startsAt: new Date('2026-10-06T16:00:00.000Z'),
              endsAt: new Date('2026-10-06T17:00:00.000Z'),
              capacity: 5,
            }),
          );

        expect(await attempt(other.date.id)).toEqual({ outcome: 'not-found' });
        expect(await attempt(privateSession.id)).toEqual({ outcome: 'not-found' });
        const [stored] = await admin.db
          .select({ capacity: sessions.capacity, version: sessions.version })
          .from(sessions)
          .where(eq(sessions.id, other.date.id));
        expect(stored).toEqual({ capacity: 8, version: 1 });
      });
    });
  });
});
