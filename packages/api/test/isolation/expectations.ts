import type { Place } from '@fivvi/database';

// What the isolation suite expects of a call (E011, AC11): the one place where an answer is
// derived from a route's declared access (`x-access` in openapi.json) and the caller's place in
// the workspace. An isolation case supplies data only; its type has no field for a status, so a
// case can't quietly expect a weaker answer. The rules are written out here again, on purpose,
// instead of calling `admission()` of `src/access.ts`: a bug in the code under test can't also
// be in its expectation.
//
//   anonymous -> 401; no place in the workspace -> 404; a place the access doesn't allow -> 403;
//   then a record outside the caller's reach -> 404; otherwise success.

/** The `x-access` extension of an operation in openapi.json. */
export type XAccess =
  | { type: 'public' }
  | { type: 'account'; workspaces?: 'team' | 'client' | 'any' }
  | { type: 'workspace'; roles: readonly ('owner' | 'trainer')[]; client: 'none' | 'own-records' };

/** Whose record the path of the call names, seen from the caller. */
export type RecordKind =
  /** The route names no record. */
  | 'none'
  /** A record of the caller's own client. */
  | 'own'
  /** A record of another client of the path's workspace. */
  | 'other-client'
  /** A record of another workspace than the one in the path. */
  | 'foreign-workspace';

export interface CallFacts {
  access: XAccess;
  method: string;
  /** The workspace in the path; unused by an account route. */
  workspaceId: string;
  signedIn: boolean;
  /** The caller's place in each workspace it has one in. */
  places: Readonly<Record<string, Place>>;
  record: RecordKind;
  /** What identifies the caller itself (account id, email, marker): a response may always show it. */
  self?: readonly string[];
  /**
   * The route creates the caller's workspace (F002, `IsolationCase.createsWorkspace`): its business
   * rule refuses an account that has a team role in any workspace (`403`, not a matter of access),
   * and a call that succeeds adds one workspace of the caller's own.
   */
  createsWorkspace?: boolean;
}

export type ExpectedStatus = 'success' | 401 | 403 | 404;

/** The refusal bodies of the contract: machine-readable codes, no text. */
export const REFUSAL_BODIES = {
  401: { code: 'not_signed_in' },
  403: { code: 'forbidden' },
  404: { code: 'not_found' },
} as const;

export interface ExpectedCall {
  status: ExpectedStatus;
  /** The hat worn when it runs: a team member, or a client on their own records. */
  hat?: 'team' | 'client';
}

export function expectedCall(facts: CallFacts): ExpectedCall {
  const { access } = facts;
  if (access.type === 'public') return { status: 'success' };
  if (!facts.signedIn) return { status: 401 };
  if (access.type === 'account') {
    const hasTeamRole = Object.values(facts.places).some((place) => place.teamRole);
    return facts.createsWorkspace && hasTeamRole ? { status: 403 } : { status: 'success' };
  }

  const place = facts.places[facts.workspaceId];
  if (!place?.teamRole && !place?.clientId) return { status: 404 };
  // A team role the route lists wins, whatever else the caller is.
  let hat: 'team' | 'client' | undefined;
  if (place.teamRole && access.roles.includes(place.teamRole)) hat = 'team';
  else if (access.client === 'own-records' && place.clientId) hat = 'client';
  if (!hat) return { status: 403 };

  if (facts.record === 'foreign-workspace') return { status: 404, hat };
  if (hat === 'client' && facts.record === 'other-client') return { status: 404, hat };
  return { status: 'success', hat };
}

const READS = ['GET', 'HEAD', 'OPTIONS'];

/** A group of rows: of a workspace, and of one client where the table has a client column. */
export interface RowGroup {
  workspaceId: string;
  /** The client the row belongs to; undefined for the workspace's and its team's rows. */
  clientId: string | undefined;
}

/**
 * Whether a successful write may change rows of this group. Nothing changes on a refused call or
 * a read. A team member may change any row of the workspace of the path, a client only the rows
 * of its own client. An account route follows the same `workspaces` rule as `mayShow`: the
 * caller's rows where it has the asked relationship.
 */
export function mayChangeRow(facts: CallFacts, group: RowGroup): boolean {
  const expected = expectedCall(facts);
  if (expected.status !== 'success') return false;
  if (READS.includes(facts.method.toUpperCase())) return false;
  const { access } = facts;
  if (access.type === 'workspace') {
    if (group.workspaceId !== facts.workspaceId) return false;
    if (expected.hat === 'team') return true;
    return clientRowOf(facts.places[group.workspaceId], group);
  }
  if (access.type === 'account') {
    const place = facts.places[group.workspaceId];
    if (!place) return false;
    const mode = access.workspaces ?? 'any';
    if (mode !== 'client' && place.teamRole) return true;
    return mode !== 'team' && clientRowOf(place, group);
  }
  return false;
}

/**
 * Whether a call may add a workspace that did not exist before it: a successful call of a route
 * that creates the caller's workspace. The rows of that one new workspace (the workspace and its
 * Owner) are not among those `mayChangeRow` knows, because nothing named them before the call.
 */
export function mayAddWorkspace(facts: CallFacts): boolean {
  return facts.createsWorkspace === true && expectedCall(facts).status === 'success';
}

function clientRowOf(place: Place | undefined, group: RowGroup): boolean {
  return !!place?.clientId && group.clientId === place.clientId;
}

/**
 * The tokens a successful read must hold, from the records the case seeded (each with its
 * owner) and the ones the path names. A route that names a record must show it; one that names
 * none must show every seeded record the caller may see, so a policy or query that is too
 * strict, and returns nothing, fails. Only `GET` reads: a write answers with what it likes.
 */
export function mustShow(
  facts: CallFacts,
  seeded: readonly (readonly [token: string, owner: TokenOwner])[],
  named: readonly string[],
): string[] {
  if (expectedCall(facts).status !== 'success') return [];
  if (facts.method.toUpperCase() !== 'GET') return [];
  if (named.length > 0) return [...named];
  return seeded.filter(([token, owner]) => mayShow(facts, token, owner)).map(([token]) => token);
}

/** Who a token (an id or a marker of a record) belongs to. */
export interface TokenOwner {
  workspaceId: string;
  /** The clients whose data it is. Empty for the workspace itself and its team's data. */
  clientIds: ReadonlySet<string>;
}

/**
 * Whether the response of a call may hold this token. A refused call shows no record at all; a
 * team member sees their workspace; a client sees the workspace's id and their own records.
 */
export function mayShow(facts: CallFacts, token: string, owner: TokenOwner): boolean {
  const expected = expectedCall(facts);
  if (expected.status !== 'success') return false;
  if (facts.self?.includes(token)) return true;
  const { access } = facts;
  if (access.type === 'workspace') {
    if (owner.workspaceId !== facts.workspaceId) return false;
    if (expected.hat === 'team') return true;
    return isOwnOrWorkspace(token, owner, facts.places[facts.workspaceId]);
  }
  if (access.type === 'account') {
    const place = facts.places[owner.workspaceId];
    if (!place) return false;
    const mode = access.workspaces ?? 'any';
    if (mode !== 'client' && place.teamRole) return true;
    if (mode !== 'team' && place.clientId) return isOwnOrWorkspace(token, owner, place);
    return false;
  }
  return true;
}

function isOwnOrWorkspace(token: string, owner: TokenOwner, place: Place | undefined): boolean {
  return token === owner.workspaceId || (!!place?.clientId && owner.clientIds.has(place.clientId));
}

/**
 * A marker as `uniqueMarker` of the factories makes it: a lower-case label, a dash and exactly
 * 8 lower-case hex digits (`note-1a2b3c4d`, `a-owner-1a2b3c4d`). It stands alone in a text:
 * not the tail of a longer word, and not followed by more of one (a uuid is not a marker).
 */
const MARKER = /(?<![\w-])[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}(?![\w-])/g;

/** Every marker in a text, in order. */
export function markersIn(text: string): string[] {
  return text.match(MARKER) ?? [];
}
