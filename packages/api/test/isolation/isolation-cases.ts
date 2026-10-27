import type { DatabaseExecutor } from '@fivvi/database';

// The isolation cases (E011, AC11, AC14): one per workspace and account operation, by operation
// ID, holding only the data the isolation suite needs to call the route. The suite derives the
// rest: who may call it, with what status, which records a response may show, and what may
// change, all from the route's `x-access` and the caller's place (`expectations.ts`). A case has
// no field for a status or an expectation, so it can't ask for a weaker answer.
//
// A new workspace or account route adds its case here; `coverage.test.ts` fails, naming the
// operation, until it does. The README of this folder has the walk-through.

export interface IsolationCase {
  /**
   * Creates the route's records in a workspace, for one client of it, through the privileged
   * connection (use the factories of `@fivvi/database/testing`). The suite calls it for every
   * client of workspaces A and B, so a client route has its own records and another client's.
   * Returns the values the path needs, by name. Leave it out for a route that names no record.
   *
   * The values are also what a successful `GET` must show: a route with path parameters must
   * show the record its path names; one without must show every value the caller may see (a
   * listing shows each client's records; a route about the caller's workspaces shows the
   * workspace id). Return ids or markers of `uniqueMarker`, so the suite can find them. The suite
   * reports a value it doesn't know, and a `GET` of a workspace whose seed returns none. Only
   * an account route (`getMe`, which reads `auth_*`) may go without.
   */
  seed?(
    db: DatabaseExecutor,
    input: { workspaceId: string; clientId: string },
  ): Promise<Record<string, string>>;
  /** Path parameters other than `workspaceId`: the parameter's name, and the seeded value to put there. */
  params?: Readonly<Record<string, string>>;
  /** A valid query string, with its `?`. */
  query?: string;
  /** A valid body, for a route that takes one. */
  body?: unknown;
}

/** The client row that the seed was called for: what a route about one client names. */
const theClient: IsolationCase['seed'] = (_db, { clientId }) =>
  Promise.resolve({ client: clientId });

/** The workspace the seed was called for: what a route about the caller's workspaces names. */
const theWorkspace: IsolationCase['seed'] = (_db, { workspaceId }) =>
  Promise.resolve({ workspace: workspaceId });

export const ISOLATION_CASES: Readonly<Record<string, IsolationCase>> = {
  // Account routes.
  getMe: {},

  // The probe routes of the test app (`probe-routes.ts`), one per kind of access.
  probeOwner: { seed: theWorkspace },
  probeTeam: { seed: theWorkspace },
  probeListClients: { seed: theClient },
  probeFindClient: { seed: theClient, params: { clientId: 'client' } },
  probeCreateClient: {},
  probeValidated: { query: '?page=1', body: { name: 'Bram' } },
  probeOwn: { seed: theWorkspace },
  probeOwnListClients: { seed: theClient },
  probeOwnFindClient: { seed: theClient, params: { clientId: 'client' } },
  probePlaces: { seed: theWorkspace },
  probeTeamPlaces: { seed: theWorkspace },
};
