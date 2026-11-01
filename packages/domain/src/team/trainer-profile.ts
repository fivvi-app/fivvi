import type { TeamRole } from './last-owner.ts';

// The trainer profile (F005, spec #173): its existence means "this team member trains in this
// workspace". Every Trainer has one; an Owner has one when they also train. Pure rules, no I/O:
// the repository stores the answer, the route asks.

/**
 * Whether a team-member record starts with a trainer profile, and whether a role change to this
 * role creates one: a Trainer always trains. A role change to Owner keeps what the person had.
 */
export function startsWithTrainerProfile(
  role: TeamRole,
  options: { creator?: boolean } = {},
): boolean {
  // A Trainer always trains; the person who creates a workspace almost always trains too (D1).
  return role === 'trainer' || options.creator === true;
}

export type TrainerProfileSwitchDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'trainer-always-trains' };

/**
 * Whether the team member, as what they are in the workspace, may switch their own training on or
 * off. Only an Owner decides it: a Trainer always trains (AC2) and has no switch.
 */
export function decideTrainerProfileSwitch(role: TeamRole): TrainerProfileSwitchDecision {
  return role === 'owner' ? { allowed: true } : { allowed: false, reason: 'trainer-always-trains' };
}
