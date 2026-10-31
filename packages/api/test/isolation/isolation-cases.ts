import type { DatabaseExecutor } from '@fivvi/database';
import { addTeamRole, createAccount } from '@fivvi/database/testing';

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
  /**
   * The route creates the caller's workspace (F002). Its business rule refuses an account with a
   * team role in any workspace (`403`), and a call that succeeds adds one workspace of the
   * caller's own, which the suite then counts among the caller's places. The only thing a case
   * may say about the status or what changes; the flag cannot make a refusal weaker, because
   * every account without a team role must still succeed (`expectations.ts`).
   */
  createsWorkspace?: true;
}

/** The client row that the seed was called for: what a route about one client names. */
const theClient: IsolationCase['seed'] = (_db, { clientId }) =>
  Promise.resolve({ client: clientId });

/** The workspace the seed was called for: what a route about the caller's workspaces names. */
const theWorkspace: IsolationCase['seed'] = (_db, { workspaceId }) =>
  Promise.resolve({ workspace: workspaceId });

/** A Trainer of the workspace the seed was called for: what the team routes list and remove (F003). */
const aTeamMember: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const account = await createAccount(db, { label: 'team-member' });
  const { id } = await addTeamRole(db, { workspaceId, accountId: account.id });
  return { teamMember: id };
};

export const ISOLATION_CASES: Readonly<Record<string, IsolationCase>> = {
  // Account routes.
  getMe: {},
  // The account's own team roles across its workspaces, never a workspace's data (F003).
  listMyWorkspaces: {},
  // The caller's own account: it stores their language and touches no workspace's data (F010).
  updateMe: { body: { preferredLocale: 'en' } },
  createWorkspace: { body: { name: "John's Gym" }, createsWorkspace: true },

  // The routes of one workspace (F002): a read shows its id, a rename takes a valid name.
  getWorkspace: { seed: theWorkspace },
  renameWorkspace: { seed: theWorkspace, body: { name: 'Renamed Gym' } },

  // The team of a workspace (F003): the list shows the seeded team member, the removal names it.
  listTeamMembers: { seed: aTeamMember },
  // The role change (F004): it names the seeded team member and asks for the role it already has.
  changeTeamMemberRole: {
    seed: aTeamMember,
    params: { teamMemberId: 'teamMember' },
    body: { role: 'trainer' },
  },
  removeTeamMember: { seed: aTeamMember, params: { teamMemberId: 'teamMember' } },

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
