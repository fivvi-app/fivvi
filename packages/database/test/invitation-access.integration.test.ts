import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeInvitation,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  findAccountForInvitation,
  hasPendingInvitation,
  lockInvitation,
  nameAccountIfEmpty,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addTeamRole,
  addTrainerInvitation,
  createAccount,
  createWorkspace,
  readTenantContext,
} from '../src/testing/index.ts';

// How a person with an invitation reaches it (F011, spec #422): by the hash of the token in the
// link, or by the address the invitation went to. Both are narrow doors in the policies of
// `trainer_invitations`, opened by a setting of the transaction that only these functions make.
// Everything connects as the app role, so RLS applies; the data is seeded as the owner.

describe('F011 reaching an invitation by its token or its address', () => {
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

  async function gym() {
    const workspace = await createWorkspace(admin.db);
    const owner = await addTeamRole(admin.db, {
      workspaceId: workspace.id,
      accountId: (await createAccount(admin.db, { label: 'owner' })).id,
      role: 'owner',
    });
    return { workspace, owner };
  }

  describe('the scope of an invitation token', () => {
    it('opens the workspace of the invitation, and only that one, for a known token hash', async () => {
      const { workspace, owner } = await gym();
      const { workspace: other, owner: otherOwner } = await gym();
      const lisa = await createAccount(admin.db, { label: 'lisa' });
      const invitation = await addTrainerInvitation(admin.db, {
        workspaceId: workspace.id,
        inviterTeamMemberId: owner.id,
        tokenHash: 'token-hash-of-lisa',
      });
      await addTrainerInvitation(admin.db, {
        workspaceId: other.id,
        inviterTeamMemberId: otherOwner.id,
        tokenHash: 'token-hash-of-another',
      });

      const entry = await createTenantScopes(() => app.db).inInvitationScope(
        { tokenHash: 'token-hash-of-lisa', accountId: lisa.id },
        async (scope, invitationId) => ({
          invitationId,
          workspaceId: scope.workspaceId,
          context: await readTenantContext(scope),
          locked: await lockInvitation(scope, invitationId),
        }),
      );

      expect(entry).toEqual({
        status: 'entered',
        value: {
          invitationId: invitation.id,
          workspaceId: workspace.id,
          // The token's door is shut again once the workspace is open: the context names the
          // workspace and the account, nothing else.
          context: { accountId: lisa.id, workspaceIds: [workspace.id], clientId: null },
          locked: expect.objectContaining({ id: invitation.id, status: 'pending' }),
        },
      });
    });

    it('answers unknown for a hash no invitation has, and runs nothing', async () => {
      await gym();
      let ran = false;

      const entry = await createTenantScopes(() => app.db).inInvitationScope(
        { tokenHash: 'a-hash-nobody-has' },
        () => {
          ran = true;
          return Promise.resolve('ran');
        },
      );

      expect(entry).toEqual({ status: 'unknown' });
      expect(ran).toBe(false);
    });

    it('opens an invitation of any status: the caller decides what a closed one means', async () => {
      const { workspace, owner } = await gym();
      await addTrainerInvitation(admin.db, {
        workspaceId: workspace.id,
        inviterTeamMemberId: owner.id,
        tokenHash: 'token-hash-withdrawn',
        status: 'withdrawn',
      });

      const entry = await createTenantScopes(() => app.db).inInvitationScope(
        { tokenHash: 'token-hash-withdrawn' },
        (scope, invitationId) => lockInvitation(scope, invitationId),
      );

      expect(entry).toMatchObject({ status: 'entered', value: { status: 'withdrawn' } });
    });

    it('lets the app role see no invitation without the token, whatever other settings hold', async () => {
      const { workspace, owner } = await gym();
      await addTrainerInvitation(admin.db, {
        workspaceId: workspace.id,
        inviterTeamMemberId: owner.id,
        tokenHash: 'token-hash-hidden',
      });

      const seen = await app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.account_id', ${owner.id}, true)`);
        return (await tx.execute(sql`select id from trainer_invitations`)).rows;
      });

      expect(seen).toEqual([]);
    });

    it('closes an invitation as accepted or declined, and a closed one stays closed', async () => {
      const { workspace, owner } = await gym();
      const invitation = await addTrainerInvitation(admin.db, {
        workspaceId: workspace.id,
        inviterTeamMemberId: owner.id,
        tokenHash: 'token-hash-to-accept',
      });
      const scopes = createTenantScopes(() => app.db);

      const first = await scopes.inInvitationScope(
        { tokenHash: 'token-hash-to-accept' },
        (scope, id) => closeInvitation(scope, id, 'accepted'),
      );
      const second = await scopes.inInvitationScope(
        { tokenHash: 'token-hash-to-accept' },
        (scope, id) => closeInvitation(scope, id, 'declined'),
      );

      expect(first).toEqual({ status: 'entered', value: true });
      expect(second).toEqual({ status: 'entered', value: false });
      const [row] = (
        await admin.db.execute(
          sql`select status from trainer_invitations where id = ${invitation.id}`,
        )
      ).rows;
      expect(row).toEqual({ status: 'accepted' });
    });

    it('names the account only when it has no name yet, and reads its address and whether it is verified', async () => {
      const { workspace, owner } = await gym();
      const unnamed = await createAccount(admin.db, { label: 'unnamed' });
      const named = await createAccount(admin.db, { label: 'named' });
      await admin.db.execute(sql`update auth_users set name = '' where id = ${unnamed.id}`);
      await addTrainerInvitation(admin.db, {
        workspaceId: workspace.id,
        inviterTeamMemberId: owner.id,
        tokenHash: 'token-hash-naming',
      });
      const scopes = createTenantScopes(() => app.db);
      const inScope = <T>(accountId: string, run: (scope: WorkspaceScope) => Promise<T>) =>
        scopes.inInvitationScope({ tokenHash: 'token-hash-naming', accountId }, (scope) =>
          run(scope),
        );

      await inScope(unnamed.id, (scope) => nameAccountIfEmpty(scope, 'Lisa'));
      await inScope(named.id, (scope) => nameAccountIfEmpty(scope, 'Lisa'));
      const read = await inScope(unnamed.id, (scope) => findAccountForInvitation(scope));

      const names = (
        await admin.db.execute(
          sql`select id, name from auth_users where id in (${unnamed.id}, ${named.id})`,
        )
      ).rows;
      expect(names).toContainEqual({ id: unnamed.id, name: 'Lisa' });
      expect(names).toContainEqual({ id: named.id, name: named.marker });
      expect(read).toEqual({
        status: 'entered',
        value: { email: unnamed.email, emailVerified: true },
      });
    });
  });

  describe('hasPendingInvitation', () => {
    const NOW = new Date('2026-11-05T10:00:00.000Z');

    it('is true for an address with a pending, unexpired invitation, in any case', async () => {
      const { workspace, owner } = await gym();
      await addTrainerInvitation(admin.db, {
        workspaceId: workspace.id,
        inviterTeamMemberId: owner.id,
        email: 'lisa@example.com',
        expiresAt: new Date('2026-11-12T10:00:00.000Z'),
      });

      expect(await hasPendingInvitation(app.db, 'lisa@example.com', NOW)).toBe(true);
      expect(await hasPendingInvitation(app.db, 'LISA@Example.com', NOW)).toBe(true);
    });

    it('is false for an address nobody invited, an expired invitation and a closed one', async () => {
      const { workspace, owner } = await gym();
      const base = { workspaceId: workspace.id, inviterTeamMemberId: owner.id };
      await addTrainerInvitation(admin.db, {
        ...base,
        email: 'expired@example.com',
        expiresAt: new Date('2026-11-05T09:59:59.000Z'),
      });
      for (const status of ['withdrawn', 'accepted', 'declined'] as const) {
        await addTrainerInvitation(admin.db, { ...base, email: `${status}@example.com`, status });
      }

      for (const email of [
        'nobody@example.com',
        'expired@example.com',
        'withdrawn@example.com',
        'accepted@example.com',
        'declined@example.com',
      ]) {
        expect(await hasPendingInvitation(app.db, email, NOW), email).toBe(false);
      }
    });

    it('stops at the expiry instant, not a moment later', async () => {
      const { workspace, owner } = await gym();
      await addTrainerInvitation(admin.db, {
        workspaceId: workspace.id,
        inviterTeamMemberId: owner.id,
        email: 'edge@example.com',
        expiresAt: NOW,
      });

      expect(await hasPendingInvitation(app.db, 'edge@example.com', NOW)).toBe(false);
      expect(
        await hasPendingInvitation(app.db, 'edge@example.com', new Date(NOW.getTime() - 1)),
      ).toBe(true);
    });
  });
});
