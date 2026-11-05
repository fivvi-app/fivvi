import { type DatabaseExecutor, locations } from '@fivvi/database';
import {
  addSession,
  addTeamRole,
  addTrainerInvitation,
  createAccount,
} from '@fivvi/database/testing';
import { eq, sql } from 'drizzle-orm';

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
  /**
   * A valid body, for a route that takes one. A function gets the values the seed returned for the
   * records of the call (the workspace under test and the client it is called for), for a body that
   * names a record of the workspace (a client to plan a session for, F020): it is called once per call.
   */
  body?: object | ((values: Readonly<Record<string, string>>) => object);
  /**
   * The route creates the caller's workspace (F002). Its business rule is the sign-up allowlist
   * alone (F012), and a call that succeeds adds one workspace of the caller's own, which the suite
   * then counts among the caller's places. The only thing a case may say about what changes; the
   * flag cannot make a refusal weaker, because every signed-in account of the harness's allowlist
   * must succeed (`expectations.ts`).
   */
  createsWorkspace?: true;
}

/** The client row that the seed was called for: what a route about one client names. */
const theClient: IsolationCase['seed'] = (_db, { clientId }) =>
  Promise.resolve({ client: clientId });

/** The workspace the seed was called for: what a route about the caller's workspaces names. */
const theWorkspace: IsolationCase['seed'] = (_db, { workspaceId }) =>
  Promise.resolve({ workspace: workspaceId });

/** The one location of the workspace the seed was called for: what the location routes list and name (F015). */
const theLocation: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, workspaceId));
  if (!location) throw new Error('The workspace has no location.');
  return { location: location.id };
};

/** A Trainer of the workspace the seed was called for: what the team routes list and remove (F003). */
const aTeamMember: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const account = await createAccount(db, { label: 'team-member' });
  const { id } = await addTeamRole(db, { workspaceId, accountId: account.id });
  return { teamMember: id };
};

/** A pending invitation of the workspace the seed was called for, sent by an Owner of it: what the invitation routes list, send again and withdraw (F011). */
const anInvitation: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const inviter = await addTeamRole(db, {
    workspaceId,
    accountId: (await createAccount(db, { label: 'inviter' })).id,
    role: 'owner',
  });
  const { id } = await addTrainerInvitation(db, { workspaceId, inviterTeamMemberId: inviter.id });
  return { invitation: id };
};

/** A session of the workspace the seed was called for, with the client it was called for in it: what the session read shows (F020). */
const aSession: IsolationCase['seed'] = async (db, { workspaceId, clientId }) => {
  const { id } = await addSession(db, { workspaceId, clientId });
  return { session: id };
};

/**
 * The client the seed was called for, with everyone on the workspace's team training (a trainer
 * profile each, F005), so a session planned "for yourself" succeeds for every role that may plan one
 * (F020). An earlier case switches the Owner's training off, so the profiles are made here, right
 * before the calls that need them, and not with the actors.
 */
const theClientAndATeamThatTrains: IsolationCase['seed'] = async (
  db,
  { workspaceId, clientId },
) => {
  await db.execute(
    sql`insert into trainer_profiles (organization_id, team_member_id)
        select organization_id, id from team_members where organization_id = ${workspaceId}
        on conflict (team_member_id) do nothing`,
  );
  return { client: clientId };
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
  // The report of a switch (F012) records a product event and changes no row.
  recordWorkspaceSwitch: { body: {} },

  // The team of a workspace (F003): the list shows the seeded team member, the removal names it.
  listTeamMembers: { seed: aTeamMember },
  // The role change (F004): it names the seeded team member and asks for the role it already has.
  changeTeamMemberRole: {
    seed: aTeamMember,
    params: { teamMemberId: 'teamMember' },
    body: { role: 'trainer' },
  },
  removeTeamMember: { seed: aTeamMember, params: { teamMemberId: 'teamMember' } },

  // The trainer invitations of a workspace (F011): the list shows the seeded pending invitation, the
  // other two name it, and the invite takes a name and an address of its own each time it is written.
  listTrainerInvitations: { seed: anInvitation },
  createTrainerInvitation: {
    body: {
      name: 'Lisa',
      get email() {
        return `${crypto.randomUUID()}@example.com`;
      },
    },
  },
  resendTrainerInvitation: {
    seed: anInvitation,
    params: { invitationId: 'invitation' },
  },
  withdrawTrainerInvitation: {
    seed: anInvitation,
    params: { invitationId: 'invitation' },
  },

  // The sessions of a workspace (F020): the plan names the client the suite calls it for and leaves
  // the trainer out, so it is the caller's own session whichever role calls it; the read names the
  // seeded session.
  createPrivateSession: {
    seed: theClientAndATeamThatTrains,
    body: (values) => ({
      clientId: values.client,
      localDate: '2026-09-24',
      localStart: '09:00',
      durationMinutes: 60,
      notify: false,
    }),
  },
  getSession: { seed: aSession, params: { sessionId: 'session' } },

  // The trainers of a workspace (F005): the list shows the seeded Trainer. The two switch routes
  // act on the caller's own trainer profile, so they name no record.
  listTrainers: { seed: aTeamMember },
  putTrainerProfile: {},
  deleteTrainerProfile: {},

  // The locations of a workspace (F015): the list shows the workspace's own location (made with it:
  // `createWorkspace()` gives it its marker as the name), and the update names it and renames it.
  listLocations: { seed: theLocation },
  updateLocation: {
    seed: theLocation,
    params: { locationId: 'location' },
    body: { name: 'Renamed Location' },
  },

  // The clients of a workspace (F006): the list shows every client the seed made (the suite calls
  // it once per client of the workspace), the add takes a name and an email address. Every call
  // needs an address of its own (one per workspace), so the getter makes a new one each time the
  // body is written to JSON.
  listClients: { seed: theClient },
  addClient: {
    body: {
      name: 'Mark Jansen',
      get email() {
        return `${crypto.randomUUID()}@example.com`;
      },
    },
  },
  // One client: the read shows the seeded client it names, the edit renames it (F006).
  getClient: { seed: theClient, params: { clientId: 'client' } },
  updateClient: {
    seed: theClient,
    params: { clientId: 'client' },
    body: { name: 'Renamed Client' },
  },

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
