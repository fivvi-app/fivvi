import { randomBytes } from 'node:crypto';
import { cloneTemplateDatabase, type TestDatabase, withRollback } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authUsers,
  clients,
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  organizations,
  teamMembers,
  trainerProfiles,
} from '../src/index.ts';

async function account(tx: DatabaseExecutor, email: string): Promise<string> {
  const [row] = await tx.insert(authUsers).values({ email }).returning({ id: authUsers.id });
  if (!row) throw new Error('account not created');
  return row.id;
}

async function workspace(tx: DatabaseExecutor): Promise<string> {
  const marker = `workspace-${randomBytes(4).toString('hex')}`;
  const [row] = await tx
    .insert(organizations)
    .values({ name: marker, slug: marker, defaultLocale: 'nl-NL', timeZone: 'Europe/Amsterdam' })
    .returning({ id: organizations.id });
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

  it('F006: a client has a name, a lower case email address once per workspace, and a supported language', async () => {
    await withRollback(db, async (tx) => {
      const workspaceA = await workspace(tx);
      const workspaceB = await workspace(tx);
      const add = (values: Partial<typeof clients.$inferInsert>, workspaceId = workspaceA) =>
        tx.transaction((inner) =>
          inner
            .insert(clients)
            .values({ organizationId: workspaceId, name: 'Anna de Vries', ...values }),
        );

      // The same address in another workspace is another client; none at all may repeat.
      await add({ email: 'anna@example.com' });
      await add({ email: 'anna@example.com' }, workspaceB);
      await add({});
      await add({});
      await expect(add({ email: 'anna@example.com' })).rejects.toMatchObject({
        cause: { code: '23505', constraint: 'clients_organization_id_email_unique' },
      });

      // The name is there, not blank and at most 120 characters; the address is lower case; the
      // language is one of the catalog's.
      await expect(add({ name: '   ' })).rejects.toMatchObject({
        cause: { code: '23514', constraint: 'clients_name_valid' },
      });
      await expect(add({ name: 'x'.repeat(121) })).rejects.toMatchObject({
        cause: { code: '23514', constraint: 'clients_name_valid' },
      });
      await add({ name: 'x'.repeat(120) });
      await expect(add({ email: 'Anna2@Example.com' })).rejects.toMatchObject({
        cause: { code: '23514', constraint: 'clients_email_lowercase' },
      });
      await expect(add({ emailLocale: 'de' as never })).rejects.toMatchObject({
        cause: { code: '23514', constraint: 'clients_email_locale_supported' },
      });
    });
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
      await tx.insert(clients).values({ organizationId: workspaceA, accountId: sam, name: 'Sam' });
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
          inner.insert(clients).values({ organizationId: workspaceA, accountId: sam, name: 'Sam' }),
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
      await tx.insert(clients).values([
        { organizationId: workspaceA, name: 'Mark Jansen' },
        { organizationId: workspaceA, name: 'Mark Jansen' },
      ]);
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

  it('AC11 (F004): adding a role value is one additive statement and rewrites no data', async () => {
    await withRollback(db, async (tx) => {
      const workspaceA = await workspace(tx);
      const owner = await account(tx, 'owner-a@example.com');
      await tx
        .insert(teamMembers)
        .values({ organizationId: workspaceA, accountId: owner, role: 'owner' });
      const storage = () =>
        tx.execute(sql`select relfilenode from pg_class where relname = 'team_members'`);
      const before = await storage();

      await tx.execute(sql`alter type team_role add value 'admin'`);

      // The table keeps its storage file (no rewrite) and its row.
      expect((await storage()).rows).toEqual(before.rows);
      expect(await tx.select({ role: teamMembers.role }).from(teamMembers)).toEqual([
        { role: 'owner' },
      ]);
    });
  });

  it('F005 AC9: a trainer profile is one per team member, in the team member’s workspace, and goes with the record', async () => {
    await withRollback(db, async (tx) => {
      const workspaceA = await workspace(tx);
      const workspaceB = await workspace(tx);
      const sam = await account(tx, 'sam@example.com');
      const [member] = await tx
        .insert(teamMembers)
        .values({ organizationId: workspaceA, accountId: sam, role: 'trainer' })
        .returning({ id: teamMembers.id });
      if (!member) throw new Error('team member not created');
      await tx
        .insert(trainerProfiles)
        .values({ organizationId: workspaceA, teamMemberId: member.id });

      // One per team member.
      await expect(
        tx.transaction((inner) =>
          inner
            .insert(trainerProfiles)
            .values({ organizationId: workspaceA, teamMemberId: member.id }),
        ),
      ).rejects.toMatchObject({
        cause: { code: '23505', constraint: 'trainer_profiles_team_member_id_unique' },
      });
      // A profile of workspace B can not point at a team member of workspace A.
      const lee = await account(tx, 'lee@example.com');
      const [other] = await tx
        .insert(teamMembers)
        .values({ organizationId: workspaceA, accountId: lee, role: 'trainer' })
        .returning({ id: teamMembers.id });
      await expect(
        tx.transaction((inner) =>
          inner
            .insert(trainerProfiles)
            .values({ organizationId: workspaceB, teamMemberId: other?.id ?? '' }),
        ),
      ).rejects.toMatchObject({
        cause: { code: '23503', constraint: 'trainer_profiles_team_member_fk' },
      });

      // Removing the team-member record removes the profile and nothing of the account.
      await tx.delete(teamMembers).where(eq(teamMembers.id, member.id));
      expect(await tx.$count(trainerProfiles)).toBe(0);
      expect(await tx.$count(authUsers, eq(authUsers.id, sam))).toBe(1);
    });
  });
});
