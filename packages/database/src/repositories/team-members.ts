import { and, asc, eq } from 'drizzle-orm';
import { authUsers, teamMembers } from '../schema/index.ts';
import { executorOf, type TeamRole, type WorkspaceScope } from '../tenant-scope.ts';

// The team of a workspace, through a workspace scope (F003, spec #171). Each function names the
// scope's workspace itself (barrier 1); RLS says the same underneath (barrier 2). Removing a team
// member deletes the `team_members` row and nothing else: the account, its sign-in sessions and
// any client record stay (`PRODUCT.md §9`).

/** One person on the team: the account's name and email address, and the role. */
export interface TeamMemberView {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: TeamRole;
}

/** The team member record and its role: what the last-Owner rule of `packages/domain` reads. */
export interface TeamMemberRole {
  readonly id: string;
  readonly role: TeamRole;
}

/** The team of the scope's workspace, by name (then email address, so the order is stable). */
export function listTeamMembers(scope: WorkspaceScope): Promise<TeamMemberView[]> {
  return executorOf(scope)
    .select({
      id: teamMembers.id,
      name: authUsers.name,
      email: authUsers.email,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(eq(teamMembers.organizationId, scope.workspaceId))
    .orderBy(asc(authUsers.name), asc(authUsers.email));
}

/**
 * Locks the Owners of the scope's workspace until the transaction ends and returns them, as they
 * are now (an Owner a parallel removal deleted and committed is not among them). Two removals at
 * once wait for each other here, so the second one decides on what the first left: they can't
 * both pass the rule "a workspace keeps at least one Owner".
 */
export function lockOwners(scope: WorkspaceScope): Promise<TeamMemberRole[]> {
  return executorOf(scope)
    .select({ id: teamMembers.id, role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.organizationId, scope.workspaceId), eq(teamMembers.role, 'owner')))
    .orderBy(asc(teamMembers.id))
    .for('update');
}

/** One team member of the scope's workspace; `undefined` when it isn't there (or is another workspace's). */
export async function findTeamMember(
  scope: WorkspaceScope,
  teamMemberId: string,
): Promise<TeamMemberRole | undefined> {
  const [row] = await executorOf(scope)
    .select({ id: teamMembers.id, role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.organizationId, scope.workspaceId), eq(teamMembers.id, teamMemberId)))
    .limit(1);
  return row;
}

/**
 * Deletes the team-member record and nothing else. `false` when no such record is in the scope's
 * workspace. The caller has decided the account may remove and the rule of the last Owner holds.
 */
export async function deleteTeamMember(
  scope: WorkspaceScope,
  teamMemberId: string,
): Promise<boolean> {
  const deleted = await executorOf(scope)
    .delete(teamMembers)
    .where(and(eq(teamMembers.organizationId, scope.workspaceId), eq(teamMembers.id, teamMemberId)))
    .returning({ id: teamMembers.id });
  return deleted.length > 0;
}

/**
 * Replaces the role on the team-member record (F004): the same record, so a person never has two
 * roles in a workspace. Returns the team member as listed, or `undefined` when no such record is in
 * the scope's workspace. The caller has decided the role may change and the rule of the last Owner
 * holds, with the Owners locked (`lockOwners`).
 */
export async function changeTeamMemberRole(
  scope: WorkspaceScope,
  teamMemberId: string,
  role: TeamRole,
): Promise<TeamMemberView | undefined> {
  const updated = await executorOf(scope)
    .update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.organizationId, scope.workspaceId), eq(teamMembers.id, teamMemberId)))
    .returning({ id: teamMembers.id });
  if (updated.length === 0) return undefined;
  const [view] = await executorOf(scope)
    .select({
      id: teamMembers.id,
      name: authUsers.name,
      email: authUsers.email,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(and(eq(teamMembers.organizationId, scope.workspaceId), eq(teamMembers.id, teamMemberId)))
    .limit(1);
  return view;
}

/**
 * Whether an account with the email address (lower case) has a team role in the scope's
 * workspace, Owner or Trainer. Only the yes or no is read (F011 AC8): an invitation is refused
 * for someone already on the team.
 */
export async function isOnTeam(scope: WorkspaceScope, email: string): Promise<boolean> {
  const [row] = await executorOf(scope)
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(and(eq(teamMembers.organizationId, scope.workspaceId), eq(authUsers.email, email)))
    .limit(1);
  return row !== undefined;
}

/**
 * Adds the scope's account to the scope's workspace as a Trainer (F011), unless it is on the team
 * already: then the existing record stays as it is, an Owner remaining an Owner. `added` tells
 * which. A parallel add of the same account lands on the same record (the unique key decides), so
 * a person never has two. The caller has decided the account may join, and gives the trainer
 * profile (`setTrainerProfile`) to a record that was added.
 */
export async function addTrainerToTeam(
  scope: WorkspaceScope,
): Promise<{ id: string; role: TeamRole; added: boolean }> {
  const db = executorOf(scope);
  const [created] = await db
    .insert(teamMembers)
    .values({
      organizationId: scope.workspaceId,
      accountId: scope.context.accountId,
      role: 'trainer',
    })
    .onConflictDoNothing({ target: [teamMembers.organizationId, teamMembers.accountId] })
    .returning({ id: teamMembers.id, role: teamMembers.role });
  if (created) return { ...created, added: true };
  const [existing] = await db
    .select({ id: teamMembers.id, role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.organizationId, scope.workspaceId),
        eq(teamMembers.accountId, scope.context.accountId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error('The team-member record was neither added nor found.');
  return { ...existing, added: false };
}

/**
 * The name of the account behind a team member of the scope's workspace, `''` while the person has
 * given none; `undefined` when no such team member is in the workspace. Only the name is read:
 * it is what an invitation says about who invited.
 */
export async function findTeamMemberName(
  scope: WorkspaceScope,
  teamMemberId: string,
): Promise<string | undefined> {
  const [row] = await executorOf(scope)
    .select({ name: authUsers.name })
    .from(teamMembers)
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(and(eq(teamMembers.organizationId, scope.workspaceId), eq(teamMembers.id, teamMemberId)))
    .limit(1);
  return row?.name;
}
