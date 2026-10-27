import { cloneTemplateDatabase, type TestDatabase, withRollback } from '@fivvi/testing/database';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authUsers,
  clients,
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  organizations,
  teamMembers,
} from '../src/index.ts';

async function account(tx: DatabaseExecutor, email: string): Promise<string> {
  const [row] = await tx.insert(authUsers).values({ email }).returning({ id: authUsers.id });
  if (!row) throw new Error('account not created');
  return row.id;
}

async function workspace(tx: DatabaseExecutor): Promise<string> {
  const [row] = await tx.insert(organizations).values({}).returning({ id: organizations.id });
  if (!row) throw new Error('workspace not created');
  return row.id;
}

describe('E011 tenancy core tables', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  let db: DatabaseClient['db'];

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    client = createDatabase({ url: database.url, maxConnections: 2 });
    db = client.db;
  });

  afterAll(async () => {
    await client?.close();
    await database?.drop();
  });

  it('AC3: one team role and one client relationship per account and workspace, side by side', async () => {
    await withRollback(db, async (tx) => {
      const workspaceA = await workspace(tx);
      const workspaceB = await workspace(tx);
      const sam = await account(tx, 'sam@example.com');

      // A team role and a client relationship of one account in one workspace coexist,
      // as two separate rows.
      await tx
        .insert(teamMembers)
        .values({ organizationId: workspaceA, accountId: sam, role: 'trainer' });
      await tx.insert(clients).values({ organizationId: workspaceA, accountId: sam });
      expect(await tx.$count(teamMembers)).toBe(1);
      expect(await tx.$count(clients)).toBe(1);

      // Not a second team role in the same workspace, even for another role.
      await expect(
        tx.transaction((inner) =>
          inner
            .insert(teamMembers)
            .values({ organizationId: workspaceA, accountId: sam, role: 'owner' }),
        ),
      ).rejects.toMatchObject({
        cause: { code: '23505', constraint: 'team_members_organization_id_account_id_unique' },
      });

      // Not a second client relationship in the same workspace.
      await expect(
        tx.transaction((inner) =>
          inner.insert(clients).values({ organizationId: workspaceA, accountId: sam }),
        ),
      ).rejects.toMatchObject({
        cause: { code: '23505', constraint: 'clients_organization_id_account_id_unique' },
      });

      // Another workspace is another place: owner of B next to trainer in A.
      await tx
        .insert(teamMembers)
        .values({ organizationId: workspaceB, accountId: sam, role: 'owner' });
      expect(await tx.$count(teamMembers)).toBe(2);

      // Clients added by hand have no account yet (PRODUCT.md §34), and there can be many.
      await tx
        .insert(clients)
        .values([{ organizationId: workspaceA }, { organizationId: workspaceA }]);
      expect(await tx.$count(clients)).toBe(3);

      // Only Owner or Trainer.
      const lee = await account(tx, 'lee@example.com');
      await expect(
        tx.transaction((inner) =>
          inner.execute(
            sql`insert into team_members (organization_id, account_id, role)
                values (${workspaceB}, ${lee}, 'admin')`,
          ),
        ),
      ).rejects.toMatchObject({ cause: { code: '22P02' } });
    });
  });

  it('AC3: adding Admin later is one additive migration', async () => {
    await withRollback(db, async (tx) => {
      const workspaceA = await workspace(tx);
      const owner = await account(tx, 'owner-a@example.com');
      await tx
        .insert(teamMembers)
        .values({ organizationId: workspaceA, accountId: owner, role: 'owner' });

      await tx.execute(sql`alter type team_role add value 'admin'`);

      expect(await tx.select({ role: teamMembers.role }).from(teamMembers)).toEqual([
        { role: 'owner' },
      ]);
    });
  });
});
