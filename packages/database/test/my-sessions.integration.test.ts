import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  findMyNextSessionStart,
  hasMySession,
  inEachWorkspace,
  listMySessions,
  listMyTrainingWorkspaces,
  locations,
  sessionParticipants,
  type TenantScope,
} from '../src/index.ts';
import * as schema from '../src/schema/index.ts';
import {
  addClient,
  addGroupClass,
  addSession,
  addTeamRole,
  addTrainerProfile,
  createAccount,
  createWorkspace,
  endTeamRole,
  readTenantContext,
} from '../src/testing/index.ts';

// The personal read model of a trainer (F013, spec #457, ticket #521): the sessions whose current
// trainer is the account, one workspace at a time. Synthetic people: Sarah is a Trainer at John's
// Gym and the Owner (who trains) of Sarah Personal Training; Tom trains at John's Gym only;
// John owns John's Gym and does not train there; Lisa is a client of John's Gym only.

describe('F013 the personal read model', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;
  const statements: { query: string; params: unknown[] }[] = [];
  let logging: { db: DatabaseClient['db']; close(): Promise<void> };

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 4 });
    const pool = new pg.Pool({ connectionString: database.appUrl, max: 1 });
    logging = {
      db: drizzle({
        client: pool,
        schema,
        logger: { logQuery: (query, params) => statements.push({ query, params }) },
      }),
      close: () => pool.end(),
    };
  });

  afterAll(async () => {
    await logging?.close();
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const inAccountScope = <T>(accountId: string, run: (scope: TenantScope) => Promise<T>) =>
    createTenantScopes(() => app.db).inAccountScope({ accountId, workspaces: 'team' }, run);

  const DAY = { from: new Date('2026-09-21T22:00:00Z'), to: new Date('2026-09-22T22:00:00Z') };

  async function world() {
    const gym = await createWorkspace(admin.db, { label: 'johns-gym' });
    const own = await createWorkspace(admin.db, { label: 'sarah-training' });
    const other = await createWorkspace(admin.db, { label: 'fit-studio' });
    const sarah = await createAccount(admin.db, { label: 'sarah' });
    const tom = await createAccount(admin.db, { label: 'tom' });
    const john = await createAccount(admin.db, { label: 'john' });
    const lisa = await createAccount(admin.db, { label: 'lisa' });
    const sarahInGym = await addTeamRole(admin.db, { workspaceId: gym.id, accountId: sarah.id });
    const sarahOwn = await addTeamRole(admin.db, {
      workspaceId: own.id,
      accountId: sarah.id,
      role: 'owner',
      trainsHere: true,
    });
    const tomInGym = await addTeamRole(admin.db, { workspaceId: gym.id, accountId: tom.id });
    await addTeamRole(admin.db, { workspaceId: gym.id, accountId: john.id, role: 'owner' });
    await addTeamRole(admin.db, { workspaceId: other.id, accountId: john.id, role: 'owner' });
    const profile = async (workspaceId: string, teamMemberId: string) => {
      const rows = await admin.db.query.trainerProfiles.findFirst({
        where: (t, { eq: is }) => is(t.teamMemberId, teamMemberId),
      });
      if (!rows || rows.organizationId !== workspaceId) throw new Error('no profile');
      return rows.id;
    };
    return {
      gym,
      own,
      other,
      sarah,
      tom,
      john,
      lisa,
      profiles: {
        sarahGym: await profile(gym.id, sarahInGym.id),
        sarahOwn: await profile(own.id, sarahOwn.id),
        tomGym: await profile(gym.id, tomInGym.id),
      },
    };
  }

  describe('the workspaces a trainer trains in', () => {
    it('lists the workspaces where the account has a trainer profile, by name, with the zone', async () => {
      const w = await world();

      const entry = await inAccountScope(w.sarah.id, (scope) => listMyTrainingWorkspaces(scope));

      expect(entry).toEqual(
        [
          { id: w.gym.id, name: w.gym.marker, slug: w.gym.marker, timeZone: 'Europe/Amsterdam' },
          { id: w.own.id, name: w.own.marker, slug: w.own.marker, timeZone: 'Europe/Amsterdam' },
        ].toSorted((a, b) => a.name.localeCompare(b.name)),
      );
    });

    it('AC12: leaves out an Owner who does not train, and a client-only account has none', async () => {
      const w = await world();
      await addClient(admin.db, { workspaceId: w.gym.id, accountId: w.lisa.id });

      expect(await inAccountScope(w.john.id, (scope) => listMyTrainingWorkspaces(scope))).toEqual(
        [],
      );
      expect(await inAccountScope(w.lisa.id, (scope) => listMyTrainingWorkspaces(scope))).toEqual(
        [],
      );
    });
  });

  describe('one tenant context per workspace', () => {
    it('AC3: reads each workspace in a context that holds that workspace alone, and puts the account’s context back', async () => {
      const w = await world();

      const seen = await inAccountScope(w.sarah.id, async (scope) => {
        const workspaces = await listMyTrainingWorkspaces(scope);
        const inside = await inEachWorkspace(
          scope,
          workspaces,
          async (workspaceScope, workspace) => ({
            workspace: workspace.id,
            scopeWorkspace: workspaceScope.workspaceId,
            held: workspaceScope.context.workspaceIds,
            stored: (await readTenantContext(workspaceScope)).workspaceIds,
          }),
        );
        return { inside, after: await readTenantContext(scope) };
      });

      expect(seen.inside).toHaveLength(2);
      for (const read of seen.inside) {
        expect(read.held).toEqual([read.workspace]);
        expect(read.stored).toEqual([read.workspace]);
        expect(read.scopeWorkspace).toBe(read.workspace);
      }
      expect(seen.inside.map((read) => read.workspace).sort()).toEqual([w.gym.id, w.own.id].sort());
      // Back to the account's own workspaces, so the rest of the request is as it was.
      expect(seen.after.workspaceIds?.toSorted()).toEqual([w.gym.id, w.own.id].toSorted());
      expect(seen.after.accountId).toBe(w.sarah.id);
    });

    it('AC3: sets the context once for each workspace, never two workspaces together', async () => {
      const w = await world();
      statements.length = 0;

      await createTenantScopes(() => logging.db).inAccountScope(
        { accountId: w.sarah.id, workspaces: 'team' },
        async (scope) => {
          const workspaces = await listMyTrainingWorkspaces(scope);
          await inEachWorkspace(scope, workspaces, async () => undefined);
        },
      );

      // set_config('app.account_id', $1, …), 'app.workspace_ids' = $2, 'app.client_id' = $3, …
      const workspaceIds = statements
        .filter(({ query }) => query.includes('set_config'))
        .map(({ params }) => String(params[1]));
      const both = [w.gym.id, w.own.id].toSorted().join(',');
      const single = workspaceIds.filter((ids) => ids !== '' && !ids.includes(','));
      // The account alone, to find its own places; its workspaces; one workspace at a time; back.
      expect(workspaceIds[0]).toBe('');
      expect(workspaceIds[1]).toBe(both);
      expect(workspaceIds).toHaveLength(5);
      expect(workspaceIds[4]).toBe(both);
      expect(single.toSorted()).toEqual([w.gym.id, w.own.id].toSorted());
    });

    it('does not read a workspace the account has no team role in, even when asked to', async () => {
      const w = await world();

      const read = await inAccountScope(w.sarah.id, (scope) =>
        inEachWorkspace(
          scope,
          [{ id: w.other.id }, { id: w.gym.id }],
          async (workspaceScope) => workspaceScope.workspaceId,
        ),
      );

      expect(read).toEqual([w.gym.id]);
    });

    it('does not read a workspace where the team role has ended since the list was made', async () => {
      const w = await world();

      const read = await inAccountScope(w.sarah.id, async (scope) => {
        const workspaces = await listMyTrainingWorkspaces(scope);
        await endTeamRole(admin.db, { workspaceId: w.gym.id, accountId: w.sarah.id });
        return inEachWorkspace(
          scope,
          workspaces,
          async (workspaceScope) => workspaceScope.workspaceId,
        );
      });

      expect(read).toEqual([w.own.id]);
    });
  });

  describe('the sessions of one trainer in one workspace', () => {
    const at = (iso: string) => new Date(iso);

    it('AC3: lists only the sessions whose current trainer is the account, by time, with what a row shows', async () => {
      const w = await world();
      const anna = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Anna de Vries' });
      const mark = await addClient(admin.db, { workspaceId: w.gym.id, name: 'Mark Jansen' });
      const later = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: mark.id,
        trainerProfileId: w.profiles.sarahGym,
        startsAt: at('2026-09-22T09:00:00Z'),
      });
      const first = await addSession(admin.db, {
        workspaceId: w.gym.id,
        clientId: anna.id,
        trainerProfileId: w.profiles.sarahGym,
        startsAt: at('2026-09-22T07:00:00Z'),
        durationMinutes: 45,
      });
      // Tom's session, a session without a trainer and one the day before are not Sarah's.
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.tomGym,
        startsAt: at('2026-09-22T08:00:00Z'),
      });
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: null,
        startsAt: at('2026-09-22T08:30:00Z'),
      });
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.sarahGym,
        startsAt: at('2026-09-21T07:00:00Z'),
      });

      const rows = await inAccountScope(w.sarah.id, (scope) =>
        inEachWorkspace(scope, [{ id: w.gym.id }], (workspaceScope) =>
          listMySessions(workspaceScope, DAY),
        ),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.map((row) => row.id)).toEqual([first.id, later.id]);
      expect(rows[0]?.[0]).toEqual({
        id: first.id,
        type: 'private',
        status: 'scheduled',
        startsAt: first.startsAt,
        endsAt: first.endsAt,
        capacity: 1,
        location: expect.objectContaining({ name: w.gym.marker, address: null }),
        clientName: 'Anna de Vries',
        classNameNl: null,
        classNameEn: null,
        booked: 1,
      });
    });

    it('AC3: never lists another workspace’s sessions of the same trainer, nor Tom’s or John’s', async () => {
      const w = await world();
      const inGym = await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.sarahGym,
        startsAt: at('2026-09-22T07:00:00Z'),
      });
      const inOwn = await addSession(admin.db, {
        workspaceId: w.own.id,
        trainerProfileId: w.profiles.sarahOwn,
        startsAt: at('2026-09-22T08:00:00Z'),
      });
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.tomGym,
        startsAt: at('2026-09-22T09:00:00Z'),
      });

      const read = await inAccountScope(w.sarah.id, async (scope) => {
        const workspaces = await listMyTrainingWorkspaces(scope);
        return inEachWorkspace(scope, workspaces, async (workspaceScope, workspace) => ({
          workspace: workspace.id,
          ids: (await listMySessions(workspaceScope, DAY)).map((row) => row.id),
        }));
      });

      expect(Object.fromEntries(read.map((entry) => [entry.workspace, entry.ids]))).toEqual({
        [w.gym.id]: [inGym.id],
        [w.own.id]: [inOwn.id],
      });
    });

    it('shows the range as from-inclusive, to-exclusive', async () => {
      const w = await world();
      const atStart = await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.sarahGym,
        startsAt: DAY.from,
      });
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.sarahGym,
        startsAt: DAY.to,
      });

      const [rows] = await inAccountScope(w.sarah.id, (scope) =>
        inEachWorkspace(scope, [{ id: w.gym.id }], (workspaceScope) =>
          listMySessions(workspaceScope, DAY),
        ),
      );

      expect(rows?.map((row) => row.id)).toEqual([atStart.id]);
    });

    it('keeps a cancelled session and its client, and shows booked/capacity for a group class', async () => {
      const w = await world();
      const cancelled = await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.sarahGym,
        status: 'cancelled',
        startsAt: at('2026-09-22T07:00:00Z'),
        clientId: (await addClient(admin.db, { workspaceId: w.gym.id, name: 'Anna de Vries' })).id,
      });
      const kracht = await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.sarahGym,
        type: 'group',
        capacity: 8,
        participant: false,
        startsAt: at('2026-09-22T13:00:00Z'),
      });
      const [booked, attended, gone] = await Promise.all(
        ['A', 'B', 'C'].map((name) => addClient(admin.db, { workspaceId: w.gym.id, name })),
      );
      await admin.db.insert(sessionParticipants).values([
        { organizationId: w.gym.id, sessionId: kracht.id, clientId: booked?.id as string },
        {
          organizationId: w.gym.id,
          sessionId: kracht.id,
          clientId: attended?.id as string,
          attendanceStatus: 'attended',
        },
        {
          organizationId: w.gym.id,
          sessionId: kracht.id,
          clientId: gone?.id as string,
          attendanceStatus: 'cancelled',
        },
      ]);

      const [rows] = await inAccountScope(w.sarah.id, (scope) =>
        inEachWorkspace(scope, [{ id: w.gym.id }], (workspaceScope) =>
          listMySessions(workspaceScope, DAY),
        ),
      );

      expect(rows).toMatchObject([
        { id: cancelled.id, status: 'cancelled', clientName: 'Anna de Vries' },
        // A class names no client; a cancelled place does not count as booked.
        { id: kracht.id, type: 'group', capacity: 8, booked: 2, clientName: null },
      ]);
    });

    it('names the class of a group session in both languages, and a private session no class', async () => {
      const w = await world();
      const kracht = await addGroupClass(admin.db, {
        workspaceId: w.gym.id,
        nameNl: 'Kracht',
        nameEn: 'Strength',
      });
      const dutchOnly = await addGroupClass(admin.db, { workspaceId: w.gym.id, nameNl: 'Yoga' });
      const [privateSession, strength, yoga] = [
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          trainerProfileId: w.profiles.sarahGym,
          startsAt: at('2026-09-22T07:00:00Z'),
        }),
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          trainerProfileId: w.profiles.sarahGym,
          type: 'group',
          groupClassId: kracht.id,
          participant: false,
          startsAt: at('2026-09-22T08:00:00Z'),
        }),
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          trainerProfileId: w.profiles.sarahGym,
          type: 'group',
          groupClassId: dutchOnly.id,
          participant: false,
          startsAt: at('2026-09-22T09:00:00Z'),
        }),
      ];

      const [rows] = await inAccountScope(w.sarah.id, (scope) =>
        inEachWorkspace(scope, [{ id: w.gym.id }], (workspaceScope) =>
          listMySessions(workspaceScope, DAY),
        ),
      );

      expect(rows).toMatchObject([
        { id: privateSession.id, classNameNl: null, classNameEn: null },
        { id: strength.id, classNameNl: 'Kracht', classNameEn: 'Strength' },
        { id: yoga.id, classNameNl: 'Yoga', classNameEn: null },
      ]);
    });

    it('shows the address of a location that has one', async () => {
      const w = await world();
      await admin.db
        .update(locations)
        .set({
          postcode: '1234 AB',
          houseNumber: '1',
          street: 'Voorbeeldstraat',
          city: 'Amsterdam',
        })
        .where(eq(locations.organizationId, w.gym.id));
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.sarahGym,
        startsAt: at('2026-09-22T07:00:00Z'),
      });

      const [rows] = await inAccountScope(w.sarah.id, (scope) =>
        inEachWorkspace(scope, [{ id: w.gym.id }], (workspaceScope) =>
          listMySessions(workspaceScope, DAY),
        ),
      );

      expect(rows?.[0]?.location).toMatchObject({
        name: w.gym.marker,
        address: {
          postcode: '1234 AB',
          houseNumber: '1',
          houseNumberAddition: null,
          street: 'Voorbeeldstraat',
          city: 'Amsterdam',
        },
      });
    });
  });

  describe('what comes next', () => {
    it('finds the start of the next session that takes place, not a cancelled one, the trainer’s own only', async () => {
      const w = await world();
      const after = new Date('2026-09-22T22:00:00Z');
      for (const [status, trainerProfileId, startsAt] of [
        ['cancelled', w.profiles.sarahGym, '2026-09-23T07:00:00Z'],
        ['scheduled', w.profiles.tomGym, '2026-09-23T08:00:00Z'],
        ['scheduled', w.profiles.sarahGym, '2026-10-01T09:00:00Z'],
        ['scheduled', w.profiles.sarahGym, '2026-10-02T09:00:00Z'],
        ['scheduled', w.profiles.sarahGym, '2026-09-22T09:00:00Z'],
      ] as const) {
        await addSession(admin.db, {
          workspaceId: w.gym.id,
          trainerProfileId,
          status,
          startsAt: new Date(startsAt),
        });
      }

      const [next] = await inAccountScope(w.sarah.id, (scope) =>
        inEachWorkspace(scope, [{ id: w.gym.id }], (workspaceScope) =>
          findMyNextSessionStart(workspaceScope, after),
        ),
      );

      expect(next).toEqual(new Date('2026-10-01T09:00:00Z'));
    });

    it('finds none when nothing follows, and tells whether there was ever a session', async () => {
      const w = await world();
      await addSession(admin.db, {
        workspaceId: w.gym.id,
        trainerProfileId: w.profiles.sarahGym,
        startsAt: new Date('2026-01-10T09:00:00Z'),
      });

      const read = await inAccountScope(w.sarah.id, (scope) =>
        inEachWorkspace(scope, [{ id: w.gym.id }, { id: w.own.id }], async (workspaceScope) => ({
          workspace: workspaceScope.workspaceId,
          next: await findMyNextSessionStart(workspaceScope, new Date('2026-09-22T22:00:00Z')),
          any: await hasMySession(workspaceScope),
        })),
      );

      expect(read).toEqual([
        { workspace: w.gym.id, next: undefined, any: true },
        { workspace: w.own.id, next: undefined, any: false },
      ]);
    });
  });

  it('a profile added later is read like the others', async () => {
    const w = await world();
    const johnProfile = await addTrainerProfile(admin.db, {
      workspaceId: w.gym.id,
      teamMemberId: (
        await admin.db.query.teamMembers.findFirst({
          where: (t, { eq: is }) => is(t.accountId, w.john.id),
        })
      )?.id as string,
    });
    const session = await addSession(admin.db, {
      workspaceId: w.gym.id,
      trainerProfileId: johnProfile.id,
      startsAt: new Date('2026-09-22T07:00:00Z'),
    });

    const read = await inAccountScope(w.john.id, async (scope) => {
      const workspaces = await listMyTrainingWorkspaces(scope);
      return inEachWorkspace(scope, workspaces, (workspaceScope) =>
        listMySessions(workspaceScope, DAY),
      );
    });

    expect(read.flat().map((row) => row.id)).toEqual([session.id]);
  });
});
