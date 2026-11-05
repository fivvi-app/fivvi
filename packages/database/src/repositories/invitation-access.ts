import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { authUsers, trainerInvitations } from '../schema/index.ts';

// The first step of reaching an invitation by the token in its link (F011): before a scope
// exists, on a transaction whose context holds only the token's hash, which is how the policy
// `trainer_invitations_by_token` shows the one invitation. Like `places.ts` it is not exported
// from the package; `inInvitationScope` is the only caller.

/** Which invitation a token hash belongs to, its workspace and what `admit` needs to decide. */
export async function findInvitationByToken(
  tx: DatabaseExecutor,
  tokenHash: string,
): Promise<
  | {
      id: string;
      workspaceId: string;
      status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
      expiresAt: Date;
      email: string;
    }
  | undefined
> {
  const [row] = await tx
    .select({
      id: trainerInvitations.id,
      workspaceId: trainerInvitations.organizationId,
      status: trainerInvitations.status,
      expiresAt: trainerInvitations.expiresAt,
      email: trainerInvitations.email,
    })
    .from(trainerInvitations)
    .where(eq(trainerInvitations.tokenHash, tokenHash))
    .limit(1);
  return row;
}

/** The address of an account and whether it is verified: the account side of `admit`. */
export async function findAccountFacts(
  tx: DatabaseExecutor,
  accountId: string,
): Promise<{ email: string; emailVerified: boolean } | undefined> {
  const [row] = await tx
    .select({ email: authUsers.email, emailVerified: authUsers.emailVerified })
    .from(authUsers)
    .where(eq(authUsers.id, accountId))
    .limit(1);
  return row;
}
