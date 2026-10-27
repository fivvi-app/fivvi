import type { TenancyRules } from './conventions.ts';

/**
 * Tables that are not business data and therefore have no `organization_id`, each with the
 * reason. Adding a table here needs a reason in the PR (AGENTS.md, ADR-006).
 */
export const NON_BUSINESS_TABLES: Record<string, string> = {
  system_greetings: 'System data read by every workspace and the public hello slice (M1).',
  // Sign-in tables (F001): an account is global and shared by every workspace of its person.
  auth_identities: 'Sign-in identity of a global account (F001, ADR-007).',
  auth_rate_limits: 'Sign-in rate limit counters, keyed by hashes, not by workspace (F001).',
  auth_sessions: 'Sign-in session of a global account (F001, ADR-007).',
  auth_users: 'The global account of a person, shared by every workspace (F001, ADR-007).',
  auth_verifications: 'Emailed sign-in link and code of a global account (F001).',
};

/** Reviewed `SECURITY DEFINER` functions in `public`. None yet: every function runs as its caller. */
export const DEFINER_FUNCTIONS: string[] = [];

/** Permissive policies a business table may have next to the standard one (reviewed). */
export const EXTRA_POLICIES: Record<string, string[]> = {
  clients: ['clients_own_account'],
  team_members: ['team_members_own_account'],
};

export const RULES: TenancyRules = {
  nonBusinessTables: NON_BUSINESS_TABLES,
  definerFunctions: DEFINER_FUNCTIONS,
  extraPolicies: EXTRA_POLICIES,
};
