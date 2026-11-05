import type { Locale } from '@fivvi/i18n';
import { and, asc, count, desc, eq, gt, gte, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { trainerInvitations } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The trainer invitations of a workspace (F011, spec #422), through a workspace scope. The rules
// (7 days, 20 a day, one pending invitation per address, the language) are in `packages/domain`;
// the table repeats the ones it can. The token itself is never stored or returned here, only its
// hash, which the caller computes.

/** An invitation as the Owner sees it: never the token or its hash. */
export interface TrainerInvitationView {
  readonly id: string;
  readonly name: string;
  /** Lower case. */
  readonly email: string;
  /** The language the Owner chose for the email; `null` follows the address's account, then the workspace. */
  readonly emailLocale: Locale | null;
  /** When the invitation was last sent: it moves forward when the Owner sends it again. */
  readonly sentAt: Date;
  readonly expiresAt: Date;
}

const columns = {
  id: trainerInvitations.id,
  name: trainerInvitations.name,
  email: trainerInvitations.email,
  emailLocale: trainerInvitations.emailLocale,
  sentAt: trainerInvitations.sentAt,
  expiresAt: trainerInvitations.expiresAt,
};

const pendingOf = (scope: WorkspaceScope) =>
  and(
    eq(trainerInvitations.organizationId, scope.workspaceId),
    eq(trainerInvitations.status, 'pending'),
  );

/**
 * Waits for the other requests that are making an invitation in this workspace until this
 * transaction ends. Two invitations made at once then count the day's invitations one after the
 * other, so the 20th and the 21st can't both pass the limit.
 */
export async function lockInvitationQuota(scope: WorkspaceScope): Promise<void> {
  await executorOf(scope).execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`trainer-invitations:${scope.workspaceId}`}, 0))`,
  );
}

/** How many invitations the workspace made since `since`, closed ones included (a withdrawal gives no new allowance). */
export async function countInvitationsSince(scope: WorkspaceScope, since: Date): Promise<number> {
  const [row] = await executorOf(scope)
    .select({ total: count() })
    .from(trainerInvitations)
    .where(
      and(
        eq(trainerInvitations.organizationId, scope.workspaceId),
        gte(trainerInvitations.createdAt, since),
      ),
    );
  return row?.total ?? 0;
}

/** The pending invitation of the workspace for the address (lower case), expired or not. */
export async function findPendingInvitationByEmail(
  scope: WorkspaceScope,
  email: string,
): Promise<TrainerInvitationView | undefined> {
  const [row] = await executorOf(scope)
    .select(columns)
    .from(trainerInvitations)
    .where(and(pendingOf(scope), eq(trainerInvitations.email, email)))
    .limit(1);
  return row;
}

/** One pending invitation of the workspace; `undefined` when it is closed or is another workspace's. */
export async function findPendingInvitation(
  scope: WorkspaceScope,
  invitationId: string,
): Promise<TrainerInvitationView | undefined> {
  const [row] = await executorOf(scope)
    .select(columns)
    .from(trainerInvitations)
    .where(and(pendingOf(scope), eq(trainerInvitations.id, invitationId)))
    .limit(1);
  return row;
}

/** The pending invitations of the workspace, the latest sent first (then by ID, so the order is stable). */
export function listPendingInvitations(scope: WorkspaceScope): Promise<TrainerInvitationView[]> {
  return executorOf(scope)
    .select(columns)
    .from(trainerInvitations)
    .where(pendingOf(scope))
    .orderBy(desc(trainerInvitations.sentAt), asc(trainerInvitations.id));
}

/** What the Owner typed, and what the sending decided. The name is trimmed and the address lower case. */
export interface NewTrainerInvitation {
  readonly name: string;
  readonly email: string;
  readonly emailLocale: Locale | null;
  /** The team-member record of the Owner who invites. */
  readonly inviterTeamMemberId: string;
  /** The hash of the token in the email, never the token. */
  readonly tokenHash: string;
  /** From the caller's clock: it is also when the invitation counts as made, for the day's limit. */
  readonly sentAt: Date;
  readonly expiresAt: Date;
}

/**
 * Stores a pending invitation. `undefined` when the workspace has a pending one for the address
 * already (a parallel request made it between the check and this insert), and then nothing was
 * stored.
 */
export async function createTrainerInvitation(
  scope: WorkspaceScope,
  input: NewTrainerInvitation,
): Promise<TrainerInvitationView | undefined> {
  const [row] = await executorOf(scope)
    .insert(trainerInvitations)
    .values({ organizationId: scope.workspaceId, ...input, createdAt: input.sentAt })
    .onConflictDoNothing()
    .returning(columns);
  return row;
}

/**
 * Sends a pending invitation again: the new token's hash replaces the old one, so the old link
 * stops working, and the sending time and the expiry move to the new ones. `undefined` when the
 * workspace has no such pending invitation.
 */
export async function resendInvitation(
  scope: WorkspaceScope,
  invitationId: string,
  change: { tokenHash: string; sentAt: Date; expiresAt: Date },
): Promise<TrainerInvitationView | undefined> {
  const [row] = await executorOf(scope)
    .update(trainerInvitations)
    .set(change)
    .where(and(pendingOf(scope), eq(trainerInvitations.id, invitationId)))
    .returning(columns);
  return row;
}

/**
 * Withdraws a pending invitation: its token stops working and it leaves the pending list. The
 * row stays (it counts for the day's limit). `false` when the workspace has no such pending
 * invitation.
 */
export async function withdrawInvitation(
  scope: WorkspaceScope,
  invitationId: string,
): Promise<boolean> {
  const rows = await executorOf(scope)
    .update(trainerInvitations)
    .set({ status: 'withdrawn' })
    .where(and(pendingOf(scope), eq(trainerInvitations.id, invitationId)))
    .returning({ id: trainerInvitations.id });
  return rows.length > 0;
}

/** An invitation as the person holding its token is judged on it: the facts the domain decides on. */
export interface InvitationRecord {
  readonly id: string;
  readonly name: string;
  /** Lower case. */
  readonly email: string;
  readonly status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  readonly expiresAt: Date;
  /** The team-member record of the Owner who invited. */
  readonly inviterTeamMemberId: string;
}

const recordColumns = {
  id: trainerInvitations.id,
  name: trainerInvitations.name,
  email: trainerInvitations.email,
  status: trainerInvitations.status,
  expiresAt: trainerInvitations.expiresAt,
  inviterTeamMemberId: trainerInvitations.inviterTeamMemberId,
};

const recordOf = (scope: WorkspaceScope, invitationId: string) =>
  executorOf(scope)
    .select(recordColumns)
    .from(trainerInvitations)
    .where(
      and(
        eq(trainerInvitations.organizationId, scope.workspaceId),
        eq(trainerInvitations.id, invitationId),
      ),
    )
    .limit(1);

/** One invitation of the scope's workspace as it is now, whatever its status; `undefined` when it is not there. */
export async function findInvitation(
  scope: WorkspaceScope,
  invitationId: string,
): Promise<InvitationRecord | undefined> {
  const [row] = await recordOf(scope, invitationId);
  return row;
}

/**
 * Like `findInvitation`, and locks the invitation until the transaction ends: two accepts of one
 * invitation wait for each other here, so the second one decides on what the first left (a closed
 * invitation).
 */
export async function lockInvitation(
  scope: WorkspaceScope,
  invitationId: string,
): Promise<InvitationRecord | undefined> {
  const [row] = await recordOf(scope, invitationId).for('update');
  return row;
}

/**
 * Closes a pending invitation as accepted or declined; its token is used up. `false` when it was
 * not pending (nothing changed). The caller has decided the person may.
 */
export async function closeInvitation(
  scope: WorkspaceScope,
  invitationId: string,
  status: 'accepted' | 'declined',
): Promise<boolean> {
  const rows = await executorOf(scope)
    .update(trainerInvitations)
    .set({ status })
    .where(and(pendingOf(scope), eq(trainerInvitations.id, invitationId)))
    .returning({ id: trainerInvitations.id });
  return rows.length > 0;
}

/**
 * Whether any workspace has a pending invitation for the address (any case) that has not expired
 * at `now` (F011): the sign-in gate lets such an address create an account. Only the yes or no
 * leaves, and only for the address asked about: the transaction names it in its context, which
 * is the only door of `trainer_invitations_by_email`. For the sign-in code, not for a route.
 */
export function hasPendingInvitation(
  db: DatabaseExecutor,
  email: string,
  now: Date,
): Promise<boolean> {
  const address = email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.invitation_email', ${address}, true)`);
    const [row] = await tx
      .select({ id: trainerInvitations.id })
      .from(trainerInvitations)
      .where(
        and(
          eq(trainerInvitations.email, address),
          eq(trainerInvitations.status, 'pending'),
          gt(trainerInvitations.expiresAt, now),
        ),
      )
      .limit(1);
    return row !== undefined;
  });
}
