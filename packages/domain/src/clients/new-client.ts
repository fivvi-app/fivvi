/** The longest client name, in characters (F006 AC2). */
export const CLIENT_NAME_MAX_LENGTH = 120;

/** An email address as the workspace compares and stores it: no spaces around it, lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** What the database says about the email address of a client being added (F006). */
export interface NewClientFacts {
  /** The normalized email address; leave it out for a client added with a name only. */
  readonly email?: string;
  /** The client of this workspace that already has the email address. */
  readonly clientWithEmail?: { readonly id: string };
  /** The account that has the email address, in any workspace; only its ID is ever read. */
  readonly accountId?: string;
  /** The client of this workspace that is already linked to that account. */
  readonly clientOfAccount?: { readonly id: string };
}

export type NewClientDecision =
  | { readonly outcome: 'duplicate'; readonly clientId: string }
  | { readonly outcome: 'add'; readonly accountId: string | null };

/**
 * Whether a new client is added, and which account it is linked to (F006 AC3, AC4, AC9;
 * `PRODUCT.md §2.9`). One client record per person per workspace: an email address a client of
 * the workspace already uses, or an account the workspace already has a client for, makes the new
 * entry a duplicate, answered with the existing client. Otherwise the client is linked to the
 * account that has the email address, if there is one, so the person keeps one account. The link
 * is never told to the team: it is a decision about a column, not about the answer.
 */
export function decideNewClient(facts: NewClientFacts): NewClientDecision {
  if (facts.email === undefined) return { outcome: 'add', accountId: null };
  const existing = facts.clientWithEmail ?? facts.clientOfAccount;
  if (existing) return { outcome: 'duplicate', clientId: existing.id };
  return { outcome: 'add', accountId: facts.accountId ?? null };
}
