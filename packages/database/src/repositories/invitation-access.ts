import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { trainerInvitations } from '../schema/index.ts';

// The first step of reaching an invitation by the token in its link (F011): before a scope
// exists, on a transaction whose context holds only the token's hash, which is how the policy
// `trainer_invitations_by_token` shows the one invitation. Like `places.ts` it is not exported
// from the package; `inInvitationScope` is the only caller.

/** Which invitation a token hash belongs to, and its workspace. */
export async function findInvitationByToken(
  tx: DatabaseExecutor,
  tokenHash: string,
): Promise<{ id: string; workspaceId: string } | undefined> {
  const [row] = await tx
    .select({ id: trainerInvitations.id, workspaceId: trainerInvitations.organizationId })
    .from(trainerInvitations)
    .where(eq(trainerInvitations.tokenHash, tokenHash))
    .limit(1);
  return row;
}
