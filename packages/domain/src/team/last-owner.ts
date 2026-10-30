/** A team role (`team_role` in the database): the roles that exist today. */
export type TeamRole = 'owner' | 'trainer';

/** One person on a workspace's team, as the rule sees it. */
export interface TeamMemberRole {
  readonly id: string;
  readonly role: TeamRole;
}

/**
 * The invariant "a workspace keeps at least one Owner" (F003 AC7, `PRODUCT.md §9`): whether the
 * given team, as it would be after a change, still has an Owner. F004 asks it for role changes.
 */
export function keepsAnOwner(team: readonly TeamMemberRole[]): boolean {
  return team.some((teamMember) => teamMember.role === 'owner');
}

/**
 * Whether the team member may be removed without leaving the workspace without an Owner. A
 * person who isn't on the team can't be removed. `team` is the whole team, or at least every
 * Owner and the team member, read under a lock so a parallel change can't slip past (the
 * caller's job).
 */
export function canRemoveTeamMember(
  team: readonly TeamMemberRole[],
  teamMemberId: string,
): boolean {
  if (!team.some((teamMember) => teamMember.id === teamMemberId)) return false;
  return keepsAnOwner(team.filter((teamMember) => teamMember.id !== teamMemberId));
}
