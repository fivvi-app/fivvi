/**
 * Who may create a workspace: the operator-approved (the sign-up allowlist of F001, so closed
 * sign-up stays closed) who have no team role yet. One workspace per account in the MVP; more
 * come with self-serve onboarding or on request through the operator (F002, owner decision 1).
 */

/**
 * The sign-up allowlist as the rule needs it. `parseSignUpAllowlist` of `@fivvi/auth` returns
 * it; the domain doesn't import that package, so it stays pure.
 */
export interface SignUpAllowlist {
  /** Whether the address is an exact entry or has the domain of an `@domain` entry. */
  allows(email: string): boolean;
}

export interface CanCreateWorkspaceInput {
  /** The address the account signs in with. */
  email: string;
  signUpAllowlist: SignUpAllowlist;
  /** Whether the account has a team role (Owner or Trainer) in any workspace. */
  hasTeamRole: boolean;
}

export function canCreateWorkspace({
  email,
  signUpAllowlist,
  hasTeamRole,
}: CanCreateWorkspaceInput): boolean {
  return signUpAllowlist.allows(email) && !hasTeamRole;
}
