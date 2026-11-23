import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  findAttendanceParticipant,
  findStatusChangeByRequest,
  listAttendanceParticipants,
  listParticipantStatusChanges,
  type ParticipantStatusChange,
  recordParticipantStatusChange,
  sessionParticipantStatusChanges,
  sessionParticipants,
  type WorkspaceScope,
} from '../src/index.ts';
import { executorOf } from '../src/tenant-scope.ts';
import {
  addClient,
  addParticipants,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The status history of a place in a session (F025, ticket #544): what the database holds the line
// on (append-only for every role, one actor per line, one request ID per workspace) and what the
// repository stores and reads as the app role. Row-level security over the table is covered by the
// RLS suite, which has a factory for it (`rls.integration.test.ts`).

const NOW = new Date('2026-09-22T08:05:00Z');

describe('F025 the status history of a place in a session', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 8 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  /** A workspace with Sarah (a Trainer), a session with Anna, and a way to run as Sarah in it. */
  async function gym() {
    const workspace = await createWorkspace(admin.db);
    const account = await createAccount(admin.db, { label: 'sarah' });
    const sarah = await addTeamRole(admin.db, {
      workspaceId: workspace.id,
      accountId: account.id,
    });
    const anna = await addClient(admin.db, { workspaceId: workspace.id });
    const session = await addSession(admin.db, {
      workspaceId: workspace.id,
      clientId: anna.id,
      startsAt: new Date('2026-09-22T07:00:00Z'),
    });
    const [place] = await admin.db
      .select({ id: sessionParticipants.id })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, session.id));
    if (!place) throw new Error('no participant');
    const inScope = async <T>(run: (scope: WorkspaceScope) => Promise<T>): Promise<T> => {
      const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
        { accountId: account.id, workspaceId: workspace.id, admit: () => 'team' },
        run,
      );
      if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
      return entry.value;
    };
    return {
      workspaceId: workspace.id,
      accountId: account.id,
      sarah,
      anna,
      session,
      participantId: place.id,
      inScope,
    };
  }

  /** The constraint a statement violates (or its message), rolled back; `undefined` when it holds. */
  async function violated(statement: (db: DatabaseExecutor) => Promise<unknown>) {
    try {
      await admin.db.transaction(async (tx) => {
        await statement(tx);
        throw new Error('rollback');
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string; message?: string } })
        .cause;
      if (cause?.code) return cause.constraint ?? cause.message ?? cause.code;
      if ((error as Error).message !== 'rollback') throw error;
    }
    return undefined;
  }

  type World = Awaited<ReturnType<typeof gym>>;
  const change = (w: World, overrides: Partial<ParticipantStatusChange> = {}) =>
    ({
      participantId: w.participantId,
      clientId: w.anna.id,
      from: 'booked',
      to: 'attended',
      changedAt: NOW,
      actor: { type: 'team_member', teamMemberId: w.sarah.id, accountId: w.accountId },
      source: 'ios',
      requestKey: crypto.randomUUID(),
      ...overrides,
    }) satisfies ParticipantStatusChange;

  it('AC12: append-only history for every status change: one line with from, to, the time, the actor and the source, and the status set', async () => {
    const w = await gym();
    expect(await w.inScope((scope) => recordParticipantStatusChange(scope, change(w)))).toBe(true);
    // And back: a second tap is a second line, never an edit of the first.
    expect(
      await w.inScope((scope) =>
        recordParticipantStatusChange(
          scope,
          change(w, { from: 'attended', to: 'booked', changedAt: new Date(NOW.getTime() + 1000) }),
        ),
      ),
    ).toBe(true);

    const lines = await w.inScope((scope) =>
      listParticipantStatusChanges(scope, [w.participantId]),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      from: 'booked',
      to: 'attended',
      changedAt: NOW,
      actorType: 'team_member',
      actorTeamMemberId: w.sarah.id,
      actorAccountId: w.accountId,
      initiatedBy: null,
      source: 'ios',
    });
    expect(lines[1]).toMatchObject({ from: 'attended', to: 'booked' });
    const [place] = await w.inScope((scope) => listAttendanceParticipants(scope, w.session.id));
    expect(place).toMatchObject({
      status: 'booked',
      statusChangedAt: new Date(NOW.getTime() + 1000),
    });
  });

  it('AC12: a line cannot be updated or deleted, by any role, and the table cannot be truncated', async () => {
    const w = await gym();
    await w.inScope((scope) => recordParticipantStatusChange(scope, change(w)));
    const [line] = await admin.db
      .select({ id: sessionParticipantStatusChanges.id })
      .from(sessionParticipantStatusChanges)
      .where(eq(sessionParticipantStatusChanges.sessionParticipantId, w.participantId));
    if (!line) throw new Error('no line');

    // The owner of the tables.
    expect(
      await violated((db) =>
        db
          .update(sessionParticipantStatusChanges)
          .set({ toStatus: 'no_show' })
          .where(eq(sessionParticipantStatusChanges.id, line.id)),
      ),
    ).toBe('session_participant_status_changes is append-only');
    expect(
      await violated((db) =>
        db
          .delete(sessionParticipantStatusChanges)
          .where(eq(sessionParticipantStatusChanges.id, line.id)),
      ),
    ).toBe('session_participant_status_changes is append-only');
    expect(
      await violated((db) => db.execute(sql`TRUNCATE session_participant_status_changes`)),
    ).toBe('session_participant_status_changes is append-only');

    // The app role, in its own workspace, with the row in sight: the trigger refuses it too.
    await expect(
      w.inScope((scope) =>
        executorOf(scope)
          .update(sessionParticipantStatusChanges)
          .set({ toStatus: 'no_show' })
          .where(eq(sessionParticipantStatusChanges.id, line.id)),
      ),
    ).rejects.toMatchObject({
      cause: { message: 'session_participant_status_changes is append-only' },
    });
    await expect(
      w.inScope((scope) =>
        executorOf(scope)
          .delete(sessionParticipantStatusChanges)
          .where(eq(sessionParticipantStatusChanges.id, line.id)),
      ),
    ).rejects.toMatchObject({
      cause: { message: 'session_participant_status_changes is append-only' },
    });

    // Nothing of that stuck.
    const lines = await w.inScope((scope) =>
      listParticipantStatusChanges(scope, [w.participantId]),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ to: 'attended' });
  });

  it('AC8: the same request ID stores one line; a lost race changes nothing', async () => {
    const w = await gym();
    const requestKey = crypto.randomUUID();
    expect(
      await w.inScope((scope) => recordParticipantStatusChange(scope, change(w, { requestKey }))),
    ).toBe(true);
    expect(
      await w.inScope((scope) =>
        recordParticipantStatusChange(
          scope,
          change(w, { from: 'attended', to: 'no_show', requestKey }),
        ),
      ),
    ).toBe(false);
    const lines = await w.inScope((scope) =>
      listParticipantStatusChanges(scope, [w.participantId]),
    );
    expect(lines.map((line) => line.to)).toEqual(['attended']);
    const [place] = await w.inScope((scope) => listAttendanceParticipants(scope, w.session.id));
    expect(place?.status).toBe('attended');
    expect(await w.inScope((scope) => findStatusChangeByRequest(scope, requestKey))).toEqual({
      sessionParticipantId: w.participantId,
      bulk: false,
    });
  });

  it('AC8: a request ID is free in another workspace, and a line of a bulk is found by the bulk’s ID', async () => {
    const w = await gym();
    const other = await gym();
    const requestKey = crypto.randomUUID();
    await w.inScope((scope) => recordParticipantStatusChange(scope, change(w, { requestKey })));
    expect(
      await other.inScope((scope) =>
        recordParticipantStatusChange(scope, change(other, { requestKey })),
      ),
    ).toBe(true);
    expect(
      await other.inScope((scope) => findStatusChangeByRequest(scope, crypto.randomUUID())),
    ).toBe(undefined);

    const bulk = crypto.randomUUID();
    await w.inScope((scope) =>
      recordParticipantStatusChange(
        scope,
        change(w, {
          from: 'attended',
          to: 'no_show',
          requestKey: `${bulk}:${w.participantId}`,
        }),
      ),
    );
    expect(await w.inScope((scope) => findStatusChangeByRequest(scope, bulk))).toEqual({
      sessionParticipantId: w.participantId,
      bulk: true,
    });
  });

  it('a line names one actor of its type, and never the same status twice in a step', async () => {
    const w = await gym();
    const line = {
      organizationId: w.workspaceId,
      sessionParticipantId: w.participantId,
      clientId: w.anna.id,
      fromStatus: 'booked' as const,
      toStatus: 'attended' as const,
      changedAt: NOW,
      actorType: 'team_member' as const,
      actorTeamMemberId: w.sarah.id,
      source: 'web' as const,
    };
    expect(
      await violated((db) =>
        db.insert(sessionParticipantStatusChanges).values({ ...line, actorTeamMemberId: null }),
      ),
    ).toBe('session_participant_status_changes_actor_matches_type');
    expect(
      await violated((db) =>
        db.insert(sessionParticipantStatusChanges).values({ ...line, actorType: 'system' }),
      ),
    ).toBe('session_participant_status_changes_actor_matches_type');
    expect(
      await violated((db) =>
        db.insert(sessionParticipantStatusChanges).values({ ...line, actorType: 'client' }),
      ),
    ).toBe('session_participant_status_changes_actor_matches_type');
    expect(
      await violated((db) =>
        db.insert(sessionParticipantStatusChanges).values({ ...line, fromStatus: 'attended' }),
      ),
    ).toBe('session_participant_status_changes_from_differs');
    expect(
      await violated((db) =>
        db.insert(sessionParticipantStatusChanges).values({ ...line, clientRequestId: ' ' }),
      ),
    ).toBe('session_participant_status_changes_request_id_valid');
    // A valid line goes in.
    expect(
      await violated((db) => db.insert(sessionParticipantStatusChanges).values(line)),
    ).toBeUndefined();
  });

  it('a line points at a place of its own workspace and of its own client', async () => {
    const w = await gym();
    const stranger = await addClient(admin.db, { workspaceId: w.workspaceId });
    const elsewhere = await gym();
    expect(
      await violated((db) =>
        db.insert(sessionParticipantStatusChanges).values({
          organizationId: w.workspaceId,
          sessionParticipantId: w.participantId,
          clientId: stranger.id,
          fromStatus: 'booked',
          toStatus: 'attended',
          changedAt: NOW,
          actorType: 'system',
          source: 'system',
        }),
      ),
    ).toBe('session_participant_status_changes_participant_fk');
    expect(
      await violated((db) =>
        db.insert(sessionParticipantStatusChanges).values({
          organizationId: w.workspaceId,
          sessionParticipantId: elsewhere.participantId,
          clientId: elsewhere.anna.id,
          fromStatus: 'booked',
          toStatus: 'attended',
          changedAt: NOW,
          actorType: 'system',
          source: 'system',
        }),
      ),
    ).toBe('session_participant_status_changes_participant_fk');
  });

  it('reads a session’s participants with their names and statuses, in the order they were added, and only its workspace’s', async () => {
    const w = await gym();
    const bram = await addClient(admin.db, { workspaceId: w.workspaceId, name: 'Bram Jansen' });
    const chris = await addClient(admin.db, { workspaceId: w.workspaceId, name: 'Chris Bakker' });
    await addParticipants(admin.db, {
      workspaceId: w.workspaceId,
      session: w.session,
      clients: [bram, chris],
    });
    const list = await w.inScope((scope) => listAttendanceParticipants(scope, w.session.id));
    expect(list.map((place) => place.name)).toEqual([
      expect.any(String),
      'Bram Jansen',
      'Chris Bakker',
    ]);
    expect(list.map((place) => place.status)).toEqual(['booked', 'booked', 'booked']);
    expect(Object.keys(list[0] ?? {}).sort()).toEqual([
      'clientId',
      'id',
      'name',
      'status',
      'statusChangedAt',
    ]);

    const found = await w.inScope((scope) =>
      findAttendanceParticipant(scope, w.session.id, bram.id, { lock: true }),
    );
    expect(found?.name).toBe('Bram Jansen');

    const elsewhere = await gym();
    expect(
      await w.inScope((scope) => listAttendanceParticipants(scope, elsewhere.session.id)),
    ).toEqual([]);
    expect(
      await w.inScope((scope) => findAttendanceParticipant(scope, w.session.id, elsewhere.anna.id)),
    ).toBeUndefined();
  });
});
