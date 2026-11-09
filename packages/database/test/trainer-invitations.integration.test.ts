import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  teamMembers,
  trainerInvitations,
} from '../src/index.ts';
import {
  addTeamRole,
  addTrainerInvitation,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The table of trainer invitations (F011, spec #422): what the database holds the line on, so no
// route can write what the rules forbid. Row-level security is covered by the RLS suite, which
// has a factory for this table (`rls.integration.test.ts`).

describe('F011 trainer invitations table', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
  });

  afterAll(async () => {
    await admin?.close();
    await database?.drop();
  });

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

  async function gymWithOwner() {
    const gym = await createWorkspace(admin.db);
    const owner = await addTeamRole(admin.db, {
      workspaceId: gym.id,
      accountId: (await createAccount(admin.db, { label: 'owner' })).id,
      role: 'owner',
    });
    return { gym, owner };
  }

  it('AC8: allows one pending invitation per workspace and address, and a new one after it closed', async () => {
    const { gym, owner } = await gymWithOwner();
    const { gym: other, owner: otherOwner } = await gymWithOwner();
    const first = await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: owner.id,
      email: 'lisa@example.com',
    });

    // A second pending one for the same address is refused; another workspace may invite her.
    expect(
      await violated((tx) =>
        addTrainerInvitation(tx, {
          workspaceId: gym.id,
          inviterTeamMemberId: owner.id,
          email: 'lisa@example.com',
        }),
      ),
    ).toBe('trainer_invitations_organization_id_email_pending_unique');
    expect(
      await violated((tx) =>
        addTrainerInvitation(tx, {
          workspaceId: other.id,
          inviterTeamMemberId: otherOwner.id,
          email: 'lisa@example.com',
        }),
      ),
    ).toBeUndefined();

    // A closed invitation leaves room for a new one, and stays as a row.
    await admin.db
      .update(trainerInvitations)
      .set({ status: 'withdrawn' })
      .where(eq(trainerInvitations.id, first.id));
    expect(
      await violated((tx) =>
        addTrainerInvitation(tx, {
          workspaceId: gym.id,
          inviterTeamMemberId: owner.id,
          email: 'lisa@example.com',
        }),
      ),
    ).toBeUndefined();
  });

  it('AC10: a token hash belongs to one invitation', async () => {
    const { gym, owner } = await gymWithOwner();
    const { gym: other, owner: otherOwner } = await gymWithOwner();
    await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: owner.id,
      tokenHash: 'hash-1',
    });

    expect(
      await violated((tx) =>
        addTrainerInvitation(tx, {
          workspaceId: other.id,
          inviterTeamMemberId: otherOwner.id,
          tokenHash: 'hash-1',
        }),
      ),
    ).toBe('trainer_invitations_token_hash_unique');
  });

  it('AC1: refuses an address that is not lower case, a blank or long name and an unsupported language', async () => {
    const { gym, owner } = await gymWithOwner();
    const invite = (
      values: Parameters<typeof addTrainerInvitation>[1] extends infer T ? Partial<T> : never,
    ) =>
      violated((tx) =>
        addTrainerInvitation(tx, {
          workspaceId: gym.id,
          inviterTeamMemberId: owner.id,
          ...values,
        }),
      );

    expect(await invite({ email: 'Lisa@Example.com' })).toBe('trainer_invitations_email_lowercase');
    expect(await invite({ name: '   ' })).toBe('trainer_invitations_name_valid');
    expect(await invite({ name: 'x'.repeat(121) })).toBe('trainer_invitations_name_valid');
    expect(await invite({ emailLocale: 'fr' as 'en' })).toBe(
      'trainer_invitations_email_locale_supported',
    );
    expect(await invite({ name: 'x'.repeat(120), emailLocale: 'en' })).toBeUndefined();
  });

  it('AC1: an invitation names an inviter on the same team: not one of another workspace', async () => {
    const { gym } = await gymWithOwner();
    const { owner: strangerOwner } = await gymWithOwner();

    expect(
      await violated((tx) =>
        addTrainerInvitation(tx, { workspaceId: gym.id, inviterTeamMemberId: strangerOwner.id }),
      ),
    ).toBe('trainer_invitations_inviter_fk');
  });

  it('removing the inviter from the team removes their invitations with them', async () => {
    const { gym, owner } = await gymWithOwner();
    const invitation = await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: owner.id,
    });

    await admin.db.delete(teamMembers).where(eq(teamMembers.id, owner.id));

    const left = await admin.db
      .select({ id: trainerInvitations.id })
      .from(trainerInvitations)
      .where(eq(trainerInvitations.id, invitation.id));
    expect(left).toEqual([]);
  });

  it('AC1: stores the expiry and the sending time as instants', async () => {
    const { gym, owner } = await gymWithOwner();
    const expiresAt = new Date('2026-11-12T10:30:00.000Z');
    const { id } = await addTrainerInvitation(admin.db, {
      workspaceId: gym.id,
      inviterTeamMemberId: owner.id,
      expiresAt,
    });

    const [row] = await admin.db
      .select({
        expiresAt: trainerInvitations.expiresAt,
        sentAt: trainerInvitations.sentAt,
        status: trainerInvitations.status,
      })
      .from(trainerInvitations)
      .where(eq(trainerInvitations.id, id));
    expect(row?.expiresAt).toEqual(expiresAt);
    expect(row?.sentAt).toBeInstanceOf(Date);
    expect(row?.status).toBe('pending');
  });
});
