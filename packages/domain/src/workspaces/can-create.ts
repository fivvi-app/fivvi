/**
 * Who may create a workspace: the operator-approved, that is the sign-up allowlist of F001, so
 * closed sign-up stays closed. An allowlisted account may create another workspace when it has one
 * already (F012, spec #423); until self-serve onboarding (Release 2.0) nobody else may.
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
}

export function canCreateWorkspace({ email, signUpAllowlist }: CanCreateWorkspaceInput): boolean {
  return signUpAllowlist.allows(email);
}
