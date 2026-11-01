/** What the database says about the email address a client is being edited to (F006). */
export interface ClientEditFacts {
  /** The client being edited. */
  readonly clientId: string;
  /**
   * The new normalized email address; `null` clears it. Leave it out when the edit does not
   * touch the email address.
   */
  readonly email?: string | null;
  /** The client of this workspace that has the new email address. */
  readonly clientWithEmail?: { readonly id: string };
  /** The account that has the new email address, in any workspace; only its ID is ever read. */
  readonly accountId?: string;
  /** The client of this workspace that is linked to that account. */
  readonly clientOfAccount?: { readonly id: string };
}

export type ClientEditDecision =
  | { readonly outcome: 'duplicate'; readonly clientId: string }
  | {
      readonly outcome: 'update';
      /** The account to link the client to; `null` removes the link. Absent: leave the link as it is. */
      readonly accountId?: string | null;
    };

/**
 * Whether an edit of a client is saved, and which account the client is linked to afterwards
 * (F006 AC7, AC8; `PRODUCT.md §2.9`). The rule of adding a client holds for the edited email
 * address: if another client of the workspace has the address, or is linked to the account that
 * has it, the edit is a duplicate, answered with that client. Otherwise the link follows the
 * address: the account that has the new address, or none, also when the address is cleared. The
 * edit never touches the account itself, and the link is never told to the team.
 */
export function decideClientEdit(facts: ClientEditFacts): ClientEditDecision {
  if (facts.email === undefined) return { outcome: 'update' };
  if (facts.email === null) return { outcome: 'update', accountId: null };
  const other = [facts.clientWithEmail, facts.clientOfAccount].find(
    (client) => client !== undefined && client.id !== facts.clientId,
  );
  if (other) return { outcome: 'duplicate', clientId: other.id };
  return { outcome: 'update', accountId: facts.accountId ?? null };
}
