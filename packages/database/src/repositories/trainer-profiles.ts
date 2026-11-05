import { and, asc, eq } from 'drizzle-orm';
import { authUsers, teamMembers, trainerProfiles } from '../schema/index.ts';
import { executorOf, type TeamRole, type WorkspaceScope } from '../tenant-scope.ts';

// Who trains in a workspace (F005, spec #173), through a workspace scope. A row of
// `trainer_profiles` means "this team member trains here"; it goes with the team-member record
// (a composite foreign key with `ON DELETE CASCADE`). The rules (a Trainer always has one, only an
// Owner switches theirs) are in `packages/domain`; these functions store the answer.

/** One person who trains in the workspace: the team-member ID and the account's name. */
export interface TrainerView {
  readonly id: string;
  readonly name: string;
}

/** A person who trains in the workspace, with what a session points at: the trainer profile. */
export interface TrainerWithProfile extends TrainerView {
  /** The trainer profile: what `sessions.trainer_profile_id` holds. */
  readonly trainerProfileId: string;
}

/** The caller's own team-member record in the scope's workspace. */
export interface OwnTeamMember {
  readonly id: string;
  readonly role: TeamRole;
}

/** The team members with a trainer profile, by name (then ID, so the order is stable). */
export function listTrainers(scope: WorkspaceScope): Promise<TrainerView[]> {
  return executorOf(scope)
    .select({ id: teamMembers.id, name: authUsers.name })
    .from(trainerProfiles)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, trainerProfiles.organizationId),
        eq(teamMembers.id, trainerProfiles.teamMemberId),
      ),
    )
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(eq(trainerProfiles.organizationId, scope.workspaceId))
    .orderBy(asc(authUsers.name), asc(teamMembers.id));
}

/**
 * The scope's own account as a team member of the scope's workspace. The only team-member record
 * the trainer-profile route ever acts on (F005 AC6): there is no parameter to name another.
 */
export async function findOwnTeamMember(scope: WorkspaceScope): Promise<OwnTeamMember | undefined> {
  const [row] = await executorOf(scope)
    .select({ id: teamMembers.id, role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.organizationId, scope.workspaceId),
        eq(teamMembers.accountId, scope.context.accountId),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Gives the team member a trainer profile (`trains`) or takes it away. Idempotent: returns whether
 * anything changed. The caller has decided the change is allowed.
 */
export async function setTrainerProfile(
  scope: WorkspaceScope,
  teamMemberId: string,
  trains: boolean,
): Promise<boolean> {
  const db = executorOf(scope);
  if (trains) {
    const created = await db
      .insert(trainerProfiles)
      .values({ organizationId: scope.workspaceId, teamMemberId })
      .onConflictDoNothing({ target: trainerProfiles.teamMemberId })
      .returning({ id: trainerProfiles.id });
    return created.length > 0;
  }
  const deleted = await db
    .delete(trainerProfiles)
    .where(
      and(
        eq(trainerProfiles.organizationId, scope.workspaceId),
        eq(trainerProfiles.teamMemberId, teamMemberId),
      ),
    )
    .returning({ id: trainerProfiles.id });
  return deleted.length > 0;
}

/**
 * The trainer with that team-member ID in the scope's workspace, with the ID of their trainer
 * profile (what a session stores). `undefined` when the team member does not train here, does not
 * exist, or is another workspace's.
 */
export async function findTrainer(
  scope: WorkspaceScope,
  teamMemberId: string,
): Promise<TrainerWithProfile | undefined> {
  const [row] = await executorOf(scope)
    .select({ id: teamMembers.id, name: authUsers.name, trainerProfileId: trainerProfiles.id })
    .from(trainerProfiles)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.organizationId, trainerProfiles.organizationId),
        eq(teamMembers.id, trainerProfiles.teamMemberId),
      ),
    )
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(
      and(eq(trainerProfiles.organizationId, scope.workspaceId), eq(teamMembers.id, teamMemberId)),
    )
    .limit(1);
  return row;
}
