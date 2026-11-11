import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AccessLogEntryRecord,
  accessLog,
  accessLogStore,
  appendAccessLog,
  appendDeletionLog,
  clients,
  createCronDatabase,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  deletionLog,
  deletionLogStore,
  listAccessLog,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addAccessLogEntry,
  addClient,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The access log and the deletion log (E014, ticket #1173): what the tables hold the line on, what
// the repositories write and read as the app role and the cron role, and the Owner's list with the
// names resolved at read time. Row-level security over the access log is also covered by the RLS
// suite (`rls.integration.test.ts`, which has a factory for it). Synthetic people: John (Owner) of
// John's Gym, Anna de Vries and Mark Jansen (clients), Mike (Owner) of Fit Studio.

const T0 = new Date('2026-11-01T09:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * 24 * 60 * 60 * 1000);

describe('E014 the access log and the deletion log', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;
  let cron: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 8 });
    cron = createCronDatabase({ CRON_DATABASE_URL: database.cronUrl }, { maxConnections: 2 });
  });

  afterAll(async () => {
    await cron?.close();
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  /** A workspace with an Owner named John, and a way to run in it as John, committing each call. */
  async function gym(label = 'johns-gym') {
    const workspace = await createWorkspace(admin.db, { label });
    const john = await createAccount(admin.db, { label: 'john', name: 'John' });
    const owner = await addTeamRole(admin.db, {
      workspaceId: workspace.id,
      accountId: john.id,
      role: 'owner',
    });
    const inScope = async <T>(run: (scope: WorkspaceScope) => Promise<T>): Promise<T> => {
      const entered = await createTenantScopes(() => app.db).inWorkspaceScope(
        { accountId: john.id, workspaceId: workspace.id, admit: () => 'team' },
        run,
      );
      if (entered.status !== 'entered') throw new Error(`Not entered: ${entered.status}`);
      return entered.value;
    };
    return { workspaceId: workspace.id, johnTeamMemberId: owner.id, inScope };
  }

  const entry = (
    overrides: Partial<AccessLogEntryRecord> & Pick<AccessLogEntryRecord, 'action'>,
  ): AccessLogEntryRecord => ({
    actorTeamMemberId: null,
    subjectClientId: null,
    objectId: null,
    occurredAt: T0,
    ...overrides,
  });

  describe('the access log', () => {
    it('AC22: lists this workspace’s entries only, newest first, with the names resolved at read time', async () => {
      const johns = await gym();
      const fit = await gym('fit-studio');
      const anna = await addClient(admin.db, {
        workspaceId: johns.workspaceId,
        name: 'Anna de Vries',
      });
      const mark = await addClient(admin.db, {
        workspaceId: johns.workspaceId,
        name: 'Mark Jansen',
      });
      const mikesClient = await addClient(admin.db, {
        workspaceId: fit.workspaceId,
        name: 'Mark Jansen',
      });
      await johns.inScope(async (scope) => {
        const store = accessLogStore(scope);
        await store.append(
          entry({
            action: 'client.exported',
            actorTeamMemberId: johns.johnTeamMemberId,
            subjectClientId: anna.id,
            occurredAt: at(1),
          }),
        );
        await store.append(
          entry({
            action: 'client.trashed',
            actorTeamMemberId: johns.johnTeamMemberId,
            subjectClientId: mark.id,
            occurredAt: at(3),
          }),
        );
        await store.append(
          entry({
            action: 'workspace.exported',
            actorTeamMemberId: johns.johnTeamMemberId,
            occurredAt: at(2),
          }),
        );
      });
      await fit.inScope((scope) =>
        appendAccessLog(
          scope,
          entry({
            action: 'client.exported',
            actorTeamMemberId: fit.johnTeamMemberId,
            subjectClientId: mikesClient.id,
            occurredAt: at(4),
          }),
        ),
      );

      const page = await johns.inScope((scope) => listAccessLog(scope, { limit: 50, offset: 0 }));

      expect(page.total).toBe(3);
      expect(page.items.map((item) => [item.action, item.clientName, item.actorName])).toEqual([
        ['client.trashed', 'Mark Jansen', 'John'],
        ['workspace.exported', null, 'John'],
        ['client.exported', 'Anna de Vries', 'John'],
      ]);
      expect(page.items.map((item) => item.occurredAt)).toEqual([at(3), at(2), at(1)]);
      expect(page.items[0]?.clientId).toBe(mark.id);
      expect(JSON.stringify(page)).not.toContain(mikesClient.id);
    });

    it('AC22: filters by client and by action, and counts what matches', async () => {
      const { workspaceId, johnTeamMemberId, inScope } = await gym();
      const anna = await addClient(admin.db, { workspaceId, name: 'Anna de Vries' });
      const mark = await addClient(admin.db, { workspaceId, name: 'Mark Jansen' });
      for (const [action, client, day] of [
        ['client.exported', anna, 1],
        ['client.trashed', anna, 2],
        ['client.exported', mark, 3],
      ] as const) {
        await addAccessLogEntry(admin.db, {
          workspaceId,
          action,
          actorTeamMemberId: johnTeamMemberId,
          subjectClientId: client.id,
          occurredAt: at(day),
        });
      }

      const ofAnna = await inScope((scope) =>
        listAccessLog(scope, { clientId: anna.id, limit: 50, offset: 0 }),
      );
      const exports = await inScope((scope) =>
        listAccessLog(scope, { action: 'client.exported', limit: 50, offset: 0 }),
      );
      const annaExports = await inScope((scope) =>
        listAccessLog(scope, {
          clientId: anna.id,
          action: 'client.exported',
          limit: 50,
          offset: 0,
        }),
      );

      expect(ofAnna.items.map((item) => item.action)).toEqual([
        'client.trashed',
        'client.exported',
      ]);
      expect(ofAnna.total).toBe(2);
      expect(exports.items.map((item) => item.clientName)).toEqual([
        'Mark Jansen',
        'Anna de Vries',
      ]);
      expect(annaExports.total).toBe(1);
    });

    it('AC22: pages the list and keeps the total of all pages', async () => {
      const { workspaceId, johnTeamMemberId, inScope } = await gym();
      const anna = await addClient(admin.db, { workspaceId });
      for (let day = 1; day <= 5; day += 1) {
        await addAccessLogEntry(admin.db, {
          workspaceId,
          actorTeamMemberId: johnTeamMemberId,
          subjectClientId: anna.id,
          occurredAt: at(day),
        });
      }

      const second = await inScope((scope) => listAccessLog(scope, { limit: 2, offset: 2 }));

      expect(second.total).toBe(5);
      expect(second.items.map((item) => item.occurredAt)).toEqual([at(3), at(2)]);
    });

    it('AC22: an entry whose client is gone keeps the ID and has no name; one whose team member is gone has no actor name', async () => {
      const { workspaceId, inScope } = await gym();
      const anna = await addClient(admin.db, { workspaceId, name: 'Anna de Vries' });
      const sarahAccount = await createAccount(admin.db, { label: 'sarah', name: 'Sarah' });
      const sarah = await addTeamRole(admin.db, { workspaceId, accountId: sarahAccount.id });
      await addAccessLogEntry(admin.db, {
        workspaceId,
        action: 'client.exported',
        actorTeamMemberId: sarah.id,
        subjectClientId: anna.id,
      });
      await admin.db.delete(clients).where(eq(clients.id, anna.id));
      await admin.db.execute(sql`delete from team_members where id = ${sarah.id}`);

      const page = await inScope((scope) => listAccessLog(scope, { limit: 50, offset: 0 }));

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        clientId: anna.id,
        clientName: null,
        actorTeamMemberId: sarah.id,
        actorName: null,
      });
      expect(JSON.stringify(page)).not.toContain('Anna');
    });

    it('AC22: a note entry carries the note ID and nothing of the note', async () => {
      const { workspaceId, johnTeamMemberId, inScope } = await gym();
      const anna = await addClient(admin.db, { workspaceId });
      const noteId = '66666666-6666-4666-8666-666666666666';
      await inScope((scope) =>
        appendAccessLog(
          scope,
          entry({
            action: 'note.viewed',
            actorTeamMemberId: johnTeamMemberId,
            subjectClientId: anna.id,
            objectId: noteId,
          }),
        ),
      );

      const page = await inScope((scope) => listAccessLog(scope, { limit: 50, offset: 0 }));

      expect(page.items[0]).toMatchObject({ action: 'note.viewed', objectId: noteId });
      expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
        'action',
        'actorName',
        'actorTeamMemberId',
        'clientId',
        'clientName',
        'id',
        'objectId',
        'occurredAt',
      ]);
    });

    it('keeps the table to the actions and shapes of the writer', async () => {
      const { workspaceId, johnTeamMemberId } = await gym();
      const anna = await addClient(admin.db, { workspaceId });
      const rule = (statement: ReturnType<typeof sql>) =>
        admin.db.transaction(async (tx) => {
          await tx.execute(statement);
        });
      const base = (
        action: string,
        actor: string | null,
        client: string | null,
        object: string | null,
      ) =>
        sql`insert into access_log (organization_id, actor_team_member_id, action, subject_client_id, object_id)
            values (${workspaceId}, ${actor}, ${action}::access_log_action, ${client}, ${object})`;

      // A note entry needs its note, no other entry has an object.
      await expect(
        rule(base('note.viewed', johnTeamMemberId, anna.id, null)),
      ).rejects.toMatchObject({
        cause: { constraint: 'access_log_object_matches_action' },
      });
      await expect(
        rule(base('client.exported', johnTeamMemberId, anna.id, crypto.randomUUID())),
      ).rejects.toMatchObject({ cause: { constraint: 'access_log_object_matches_action' } });
      // The workspace export names no client, every other action does.
      await expect(
        rule(base('workspace.exported', johnTeamMemberId, anna.id, null)),
      ).rejects.toMatchObject({ cause: { constraint: 'access_log_client_matches_action' } });
      await expect(
        rule(base('client.exported', johnTeamMemberId, null, null)),
      ).rejects.toMatchObject({
        cause: { constraint: 'access_log_client_matches_action' },
      });
      // Only what the daily cleanup does has no team member.
      await expect(rule(base('client.exported', null, anna.id, null))).rejects.toMatchObject({
        cause: { constraint: 'access_log_actor_matches_action' },
      });
      await rule(base('client.purged', null, anna.id, null));
      // An action outside the list.
      await expect(
        admin.db.execute(
          sql`insert into access_log (organization_id, actor_team_member_id, action, subject_client_id)
              values (${workspaceId}, ${johnTeamMemberId}, 'client.deleted', ${anna.id})`,
        ),
      ).rejects.toMatchObject({ cause: { code: '22P02' } });
    });

    it('is write-once: no role changes an entry, the retention task can still delete by age', async () => {
      const { workspaceId, johnTeamMemberId } = await gym();
      const anna = await addClient(admin.db, { workspaceId });
      const { id } = await addAccessLogEntry(admin.db, {
        workspaceId,
        actorTeamMemberId: johnTeamMemberId,
        subjectClientId: anna.id,
      });

      await expect(
        admin.db.execute(sql`update access_log set action = 'client.purged' where id = ${id}`),
      ).rejects.toMatchObject({ cause: { code: '23001' } });
      await expect(
        admin.db.execute(sql`update access_log set updated_at = now() where id = ${id}`),
      ).rejects.toMatchObject({ cause: { code: '23001' } });
      await admin.db.execute(sql`delete from access_log where id = ${id}`);
      expect(await admin.db.select().from(accessLog).where(eq(accessLog.id, id))).toEqual([]);
    });
  });

  describe('the deletion log', () => {
    const RECORD = '77777777-7777-4777-8777-777777777777';

    it('AC21: the cron role writes the table name and record ID of a deletion, reads them and deletes old ones', async () => {
      const { workspaceId } = await gym();
      await appendDeletionLog(cron.db, [
        { table: 'clients', recordId: RECORD, workspaceId, deletedAt: at(1) },
        {
          table: 'session_participants',
          recordId: crypto.randomUUID(),
          workspaceId,
          deletedAt: at(2),
        },
      ]);

      const rows = await cron.db
        .select()
        .from(deletionLog)
        .where(eq(deletionLog.organizationId, workspaceId));

      expect(rows.map((row) => [row.tableName, row.deletedAt])).toEqual([
        ['clients', at(1)],
        ['session_participants', at(2)],
      ]);
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
        'deletedAt',
        'id',
        'organizationId',
        'recordId',
        'tableName',
      ]);
      await cron.db
        .delete(deletionLog)
        .where(
          sql`${deletionLog.organizationId} = ${workspaceId} and ${deletionLog.deletedAt} < ${at(2)}`,
        );
      expect(
        (
          await cron.db
            .select()
            .from(deletionLog)
            .where(eq(deletionLog.organizationId, workspaceId))
        ).map((row) => row.tableName),
      ).toEqual(['session_participants']);
    });

    it('AC21: the Owner’s request adds entries for its own workspace, and can read, change and delete none', async () => {
      const johns = await gym();
      const fit = await gym('fit-studio');

      await johns.inScope((scope) =>
        deletionLogStore(scope).append([
          { table: 'clients', recordId: RECORD, workspaceId: johns.workspaceId, deletedAt: at(1) },
        ]),
      );
      const written = await cron.db
        .select()
        .from(deletionLog)
        .where(eq(deletionLog.organizationId, johns.workspaceId));
      expect(written.map((row) => row.recordId)).toEqual([RECORD]);

      await expect(
        johns.inScope((scope) =>
          deletionLogStore(scope).append([
            { table: 'clients', recordId: RECORD, workspaceId: fit.workspaceId, deletedAt: at(1) },
          ]),
        ),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
      await expect(app.db.select().from(deletionLog)).rejects.toMatchObject({
        cause: { code: '42501' },
      });
      await expect(app.db.delete(deletionLog)).rejects.toMatchObject({ cause: { code: '42501' } });
      await expect(app.db.update(deletionLog).set({ tableName: 'payments' })).rejects.toMatchObject(
        { cause: { code: '42501' } },
      );
    });

    it('is write-once: even the cron role cannot change an entry', async () => {
      const { workspaceId } = await gym();
      await appendDeletionLog(cron.db, [
        { table: 'clients', recordId: RECORD, workspaceId, deletedAt: at(1) },
      ]);

      await expect(
        cron.db.execute(
          sql`update deletion_log set table_name = 'payments' where organization_id = ${workspaceId}`,
        ),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
      await expect(
        admin.db.execute(
          sql`update deletion_log set table_name = 'payments' where organization_id = ${workspaceId}`,
        ),
      ).rejects.toMatchObject({ cause: { code: '23001' } });
    });

    it('holds a table name and an ID, no sentence', async () => {
      const { workspaceId } = await gym();

      await expect(
        appendDeletionLog(cron.db, [
          { table: 'Anna de Vries', recordId: RECORD, workspaceId, deletedAt: at(1) },
        ]),
      ).rejects.toMatchObject({ cause: { constraint: 'deletion_log_table_name_valid' } });
      await expect(
        admin.db.execute(
          sql`insert into deletion_log (table_name, record_id, organization_id)
              values ('clients', 'anna@example.com', ${workspaceId})`,
        ),
      ).rejects.toMatchObject({ cause: { code: '22P02' } });
    });

    it('survives the workspace it names: no foreign key', async () => {
      const workspaceId = crypto.randomUUID();
      await appendDeletionLog(cron.db, [
        { table: 'organizations', recordId: workspaceId, workspaceId, deletedAt: at(1) },
      ]);
      expect(
        await cron.db.select().from(deletionLog).where(eq(deletionLog.organizationId, workspaceId)),
      ).toHaveLength(1);
    });

    it('an empty batch writes nothing', async () => {
      await expect(appendDeletionLog(cron.db, [])).resolves.toBeUndefined();
    });
  });
});
