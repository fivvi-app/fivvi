// Module: What a workspace offers and when the personal views name the kind of a session.
// Spec: F013

// The kind label of the personal views (F013, spec #457, ticket #1534): *Privésessie* / *Groepsles*
// on a row of *Vandaag* / *Mijn dag* and *Agenda*, shown only when the person's workspaces offer
// more than one kind ("the UI never assumes an offering", `DECISIONS.md` §3). The API decides it
// here and answers it; the apps and the web show the label by that answer and never look at the
// day's own items.

/** The kinds of session a workspace can offer. Open Gym comes later (`PRODUCT.md §53`). */
export type OfferedKind = 'private' | 'group';

/** What the API knows of a workspace: its classes decide whether it offers group classes. */
export interface WorkspaceOfferFacts {
  /** The workspace has at least one class that is not archived. */
  readonly hasGroupClasses: boolean;
}

/**
 * The kinds a workspace offers, private sessions first. Every workspace can plan a private
 * session; it offers group classes once it has a class that is not archived.
 */
export function workspaceOffers(facts: WorkspaceOfferFacts): OfferedKind[] {
  return facts.hasGroupClasses ? ['private', 'group'] : ['private'];
}

/**
 * Whether a row names its kind: the workspaces of the person together offer more than one kind.
 * Not a question of the day shown: a day with only private sessions still names the kind for a
 * person whose workspace also runs classes.
 */
export function offersMoreThanOneKind(offers: readonly (readonly OfferedKind[])[]): boolean {
  return new Set(offers.flat()).size > 1;
}
