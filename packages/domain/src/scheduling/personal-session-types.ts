// Module: Which session types a workspace runs and when the personal views name the type of a session.
// Spec: F013

// The kind label of the personal views (F013, spec #457, ticket #1534): *Privésessie* / *Groepsles*
// on a row of *Vandaag* / *Mijn dag* and *Agenda*, shown only when the person's workspaces run
// more than one session type ("the UI never assumes an offering", `DECISIONS.md` §3). The API
// decides it here and answers it; the apps and the web show the label by that answer and never
// look at the day's own items.

/** The session types a workspace can run. Open Gym comes later (`PRODUCT.md §53`). */
export type SessionTypeKind = 'private' | 'group';

/** What the API knows of a workspace: its classes decide whether it runs group classes. */
export interface WorkspaceSessionTypeFacts {
  /** The workspace has at least one class that is not archived. */
  readonly hasGroupClasses: boolean;
}

/**
 * The session types a workspace runs, private sessions first. Every workspace can plan a private
 * session; it runs group classes once it has a class that is not archived.
 */
export function workspaceSessionTypes(facts: WorkspaceSessionTypeFacts): SessionTypeKind[] {
  return facts.hasGroupClasses ? ['private', 'group'] : ['private'];
}

/**
 * Whether a row names its type: the workspaces of the person together run more than one session
 * type. Not a question of the day shown: a day with only private sessions still names the type
 * for a person whose workspace also runs classes.
 */
export function hasMoreThanOneSessionType(
  sessionTypes: readonly (readonly SessionTypeKind[])[],
): boolean {
  return new Set(sessionTypes.flat()).size > 1;
}
