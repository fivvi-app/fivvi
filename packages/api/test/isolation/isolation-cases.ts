import {
  bookingLinks,
  clientBillingDetails,
  type DatabaseExecutor,
  locations,
  organizations,
  trainerProfiles,
  workspaceInvoiceDetails,
} from '@fivvi/database';
import {
  addAccessLogEntry,
  addBookingLink,
  addClassSeries,
  addClient,
  addClientBillingDetails,
  addGroupClass,
  addOffer,
  addSession,
  addTeamRole,
  addTrainerInvitation,
  addWorkspaceInvoiceDetails,
  createAccount,
} from '@fivvi/database/testing';
import { and, eq, isNull, sql } from 'drizzle-orm';

// The isolation cases (E011, AC11, AC14): one per workspace and account operation, by operation
// ID, holding only the data the isolation suite needs to call the route. The suite derives the
// rest: who may call it, with what status, which records a response may show, and what may
// change, all from the route's `x-access` and the caller's place (`expectations.ts`). A case has
// no field for a status or an expectation, so it can't ask for a weaker answer.
//
// A new workspace or account route adds its case here, in its place in the order of operation IDs
// (plain code-unit order, so the `probe…` cases sit together between `lookup…` and `put…`); `coverage.test.ts` fails, naming the
// operation, until it does, and fails on a case out of order. The README of this folder has the walk-through.

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
    input: { workspaceId: string; clientId: string; callerAccountId?: string },
  ): Promise<Record<string, string>>;
  /**
   * The route changes the record it names, or what the caller may do with it depends on the caller
   * (a Trainer reschedules only their own session, F020; a date edit raises its version, F021): the
   * seed runs again before every call, for that call's caller (`callerAccountId`, left out for the
   * anonymous caller and for the first round of seeds), so each call starts from a record it may
   * change. Like a `DELETE`, which is always seeded again.
   */
  reseedForEachCall?: true;
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
  /**
   * The route reads no stored record: its answer comes from outside (the address lookup, F015), so
   * there is no row of the workspace for a response to show. The only thing a case may say about
   * what a read shows, and it is for a case with no `seed`: a case with both is a failure, so the
   * flag can't switch off the check of a route that does read records. Status, the refusals, the
   * markers of other workspaces in a response and the rows that change are checked as for any route.
   */
  readsNoRecords?: true;
}

/** The client row that the seed was called for: what a route about one client names. */
const theClient: IsolationCase['seed'] = (_db, { clientId }) =>
  Promise.resolve({ client: clientId });

/** The join code of the workspace the seed was called for: what the join link shows (F029). */
const theJoinCode: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const [row] = await db
    .select({ code: organizations.joinCode })
    .from(organizations)
    .where(eq(organizations.id, workspaceId));
  if (!row) throw new Error('no such workspace');
  return { code: row.code };
};

/** The workspace the seed was called for: what a route about the caller's workspaces names. */
const theWorkspace: IsolationCase['seed'] = (_db, { workspaceId }) =>
  Promise.resolve({ workspace: workspaceId });

/** A valid body for the billing details routes: Jansen Advies B.V. (synthetic). */
const COMPANY_BILLING_DETAILS = {
  asCompany: true,
  companyName: 'Jansen Advies B.V.',
  street: 'Testweg',
  houseNumber: '2',
  postcode: '5678 CD',
  city: 'Utrecht',
  vatNumber: 'NL000000000B02',
};

/** The one location of the workspace the seed was called for: what the location routes list and name (F015). */
const theLocation: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, workspaceId));
  if (!location) throw new Error('The workspace has no location.');
  return { location: location.id };
};

/**
 * The invoice details of the workspace the seed was called for (the suite seeds once per client, a
 * workspace has one set): what the invoice details read shows, by the legal name (F059).
 */
const theInvoiceDetails: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const existing = () =>
    db
      .select({ legalName: workspaceInvoiceDetails.legalName })
      .from(workspaceInvoiceDetails)
      .where(eq(workspaceInvoiceDetails.organizationId, workspaceId));
  const [row] = await existing();
  if (row) return { legalName: row.legalName };
  const { legalName } = await addWorkspaceInvoiceDetails(db, { workspaceId });
  return { legalName };
};

/**
 * The billing details of the client the seed was called for (the suite seeds once per client, and a
 * client has one set): what the client's own read and the Owner's read of that client show, by the
 * client's id (F059). The company name is no marker: a save overwrites it with the same one.
 */
const theBillingDetails: IsolationCase['seed'] = async (db, { workspaceId, clientId }) => {
  const [row] = await db
    .select({ id: clientBillingDetails.id })
    .from(clientBillingDetails)
    .where(eq(clientBillingDetails.clientId, clientId));
  if (!row) await addClientBillingDetails(db, { workspaceId, clientId });
  return { client: clientId };
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
 * A session of the workspace the seed was called for, in the week the calendar and day routes of
 * the case ask for, with the client it was called for in it: what the workspace calendar shows
 * (F014). It has no trainer, so it also shows under *Aandacht nodig* once it is a class; here it is
 * a private session. The suite searches every response for the sessions of the other workspaces.
 */
const aSessionInTheWeek: IsolationCase['seed'] = async (db, { workspaceId, clientId }) => {
  const { id } = await addSession(db, {
    workspaceId,
    clientId,
    startsAt: new Date('2026-09-22T08:00:00Z'),
  });
  return { session: id };
};

/** A class of the workspace the seed was called for: what the class routes list, read, change and put on a date (F021). */
const aClass: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const { id } = await addGroupClass(db, { workspaceId });
  return { class: id };
};

/** A class of the workspace the seed was called for with a weekly series: what the series list shows (F022). */
const aClassWithASeries: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const { id, groupClassId } = await addClassSeries(db, {
    workspaceId,
    // Running for good: the list shows the series whatever "today" is.
    endsOn: null,
  });
  return { class: groupClassId, series: id };
};

/**
 * A class of the workspace the seed was called for with a weekly series that has one date to come:
 * what the series edit changes (F022). The date is the next Tuesday at least a week from now, as
 * the API runs on the real clock.
 */
const aClassWithASeriesAndADate: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const day = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  day.setUTCDate(day.getUTCDate() + ((2 - day.getUTCDay() + 7) % 7));
  const occurrenceDate = day.toISOString().slice(0, 10);
  const { id, groupClassId } = await addClassSeries(db, {
    workspaceId,
    startsOn: occurrenceDate,
    materializedUntil: occurrenceDate,
    endsOn: null,
  });
  const { id: session } = await addSession(db, {
    workspaceId,
    type: 'group',
    groupClassId,
    participant: false,
    series: { id, occurrenceDate },
    startsAt: new Date(`${occurrenceDate}T17:00:00Z`),
  });
  return { class: groupClassId, series: id, session };
};

/** An offer of the workspace the seed was called for: what the offer routes list, read and change (F052). */
const anOffer: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const { id } = await addOffer(db, { workspaceId });
  return { offer: id };
};

/**
 * The booking links of the workspace the seed was called for (F037): the two standing links, made
 * here when the workspace has none yet (the list makes them on the first read, and a read must not
 * change a row), and a link to a class of its own: what the list shows.
 */
const theBookingLinks: IsolationCase['seed'] = async (db, { workspaceId }) => {
  for (const scope of ['all', 'group'] as const) {
    const [present] = await db
      .select({ id: bookingLinks.id })
      .from(bookingLinks)
      .where(
        and(
          eq(bookingLinks.organizationId, workspaceId),
          eq(bookingLinks.scope, scope),
          eq(bookingLinks.language, 'visitor'),
          isNull(bookingLinks.deactivatedAt),
        ),
      );
    if (!present) await addBookingLink(db, { workspaceId, scope });
  }
  const { id } = await addGroupClass(db, { workspaceId });
  const link = await addBookingLink(db, { workspaceId, scope: 'class', groupClassId: id });
  return { class: id, link: link.id };
};

/** An upcoming class date of the workspace the seed was called for: what the date link is made for (F037). */
const anUpcomingGroupDate: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const { id } = await addSession(db, { workspaceId, type: 'group', participant: false });
  return { session: id };
};

/** A class link of its own, on a class of its own, to deactivate (F037). */
const aBookingLink: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const { id } = await addBookingLink(db, {
    workspaceId,
    scope: 'class',
  });
  return { link: id };
};

/** A class on a date of the workspace the seed was called for: what the session read shows and the date edit changes (F021). */
const aGroupDate: IsolationCase['seed'] = async (db, { workspaceId }) => {
  const { id } = await addSession(db, { workspaceId, type: 'group', participant: false });
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

/**
 * A session of the workspace the seed was called for, with the client it was called for in it, for
 * a route that changes it (F020 reschedule). The session's trainer is the caller when the caller is
 * on the workspace's team (given a trainer profile if they have none), so a Trainer's call is on
 * their own session and succeeds, and an Owner may move any; for a caller without a place the
 * session has no trainer. Version 1, as the call's body says.
 */
const aSessionOfTheCaller: IsolationCase['seed'] = async (
  db,
  { workspaceId, clientId, callerAccountId },
) => {
  let trainerProfileId: string | null = null;
  if (callerAccountId) {
    const [member] = (
      await db.execute(
        sql`select id from team_members
            where organization_id = ${workspaceId} and account_id = ${callerAccountId}`,
      )
    ).rows as { id: string }[];
    if (member) {
      const { rows } = await db.execute(
        sql`insert into trainer_profiles (organization_id, team_member_id)
            values (${workspaceId}, ${member.id})
            on conflict (team_member_id) do update set team_member_id = excluded.team_member_id
            returning id`,
      );
      trainerProfileId = (rows[0] as { id: string }).id;
    }
  }
  const { id } = await addSession(db, { workspaceId, clientId, trainerProfileId });
  return { session: id };
};

/**
 * The client the seed was called for with one coming private session, so the listing shows it. The
 * session has no trainer: the listing is the same for every team member.
 */
const aClientWithASession: IsolationCase['seed'] = async (db, { workspaceId, clientId }) => {
  const { id } = await addSession(db, { workspaceId, clientId });
  return { client: clientId, session: id };
};

/**
 * A session on 22 September 2026 for every trainer of the workspace the seed was called for, with the
 * client it was called for in it: what the personal day and calendar read (F013). It returns no value
 * on purpose: each trainer sees only their own session, so no token is one every caller must see; the
 * suite still searches every response for the ids and names of the sessions of the other workspaces.
 */
const aSessionForEachTrainer: IsolationCase['seed'] = async (db, { workspaceId, clientId }) => {
  const profiles = await db
    .select({ id: trainerProfiles.id })
    .from(trainerProfiles)
    .where(eq(trainerProfiles.organizationId, workspaceId));
  for (const profile of profiles) {
    await addSession(db, {
      workspaceId,
      clientId,
      trainerProfileId: profile.id,
      startsAt: new Date('2026-09-22T08:00:00Z'),
    });
  }
  return {};
};

/**
 * An entry of the access log of the workspace the seed was called for: an export of the client it
 * was called for by an Owner of the workspace. The list shows the entry's ID and the client's ID
 * (E014).
 */
const anAccessLogEntry: IsolationCase['seed'] = async (db, { workspaceId, clientId }) => {
  const entry = await addAccessLogEntry(db, { workspaceId, subjectClientId: clientId });
  return { entry: entry.id, client: clientId };
};

export const ISOLATION_CASES: Readonly<Record<string, IsolationCase>> = {
  // The clients of a workspace (F006): the add takes a name and an email address. Every call
  // needs an address of its own (one per workspace), so the getter makes a new one each time the
  // body is written to JSON.
  addClient: {
    body: {
      name: 'Mark Jansen',
      get email() {
        return `${crypto.randomUUID()}@example.com`;
      },
    },
  },

  // The role change (F004): it names the seeded team member and asks for the role it already has.
  changeTeamMemberRole: {
    seed: aTeamMember,
    params: { teamMemberId: 'teamMember' },
    body: { role: 'trainer' },
  },

  // The email change (F005, spec #610): like requestEmailChange, it acts on the caller's own account.
  confirmEmailChange: { body: { code: '123456' } },

  // The booking links of a workspace (F037): the create takes what a Trainer may make too, the
  // link of an upcoming class date in the visitor's language.
  createBookingLink: {
    seed: anUpcomingGroupDate,
    body: (values) => ({ scope: 'session', sessionId: values.session ?? '', language: 'visitor' }),
  },

  // The group classes of a workspace (F021): the create takes a valid class of its own.
  createGroupClass: {
    body: { nameNl: 'Kracht', capacity: 8, durationMinutes: 60 },
  },

  // The offers of a workspace (F052): the create takes a valid membership of its own.
  createOffer: {
    body: {
      kind: 'membership',
      nameNl: 'Abonnement',
      priceCents: 7900,
      vatRateBasisPoints: 2100,
      classesPerWeek: 2,
      termMonths: 6,
      billingCycle: 'month',
      endOfTerm: 'stop',
      makeupsPerMonth: 2,
      cutoffMinutes: 720,
    },
  },

  // The sessions of a workspace (F020): the plan names the client the suite calls it for and leaves
  // the trainer out, so it is the caller's own session whichever role calls it.
  // A second client of the same workspace makes it a duo (F066): the plan names both.
  createPrivateSession: {
    seed: async (db, args) => ({
      ...(await theClientAndATeamThatTrains(db, args)),
      secondClient: (await addClient(db, { workspaceId: args.workspaceId })).id,
    }),
    body: (values) => ({
      clientId: values.client,
      secondClientId: values.secondClient,
      localDate: '2026-09-24',
      localStart: '09:00',
      durationMinutes: 60,
      notify: false,
      // The suite plans the caller's own session at the same time again and again: the double-booking
      // check (F023) would answer 409 on every call after the first.
      allowConflicts: true,
    }),
  },

  // The invite (F011) takes a name and an address of its own each time it is written.
  createTrainerInvitation: {
    body: {
      name: 'Lisa',
      get email() {
        return `${crypto.randomUUID()}@example.com`;
      },
    },
  },

  // Account route: it creates the caller's workspace (F002).
  createWorkspace: { body: { name: "John's Gym" }, createsWorkspace: true },

  // The booking links of a workspace (F037): the deactivation names a link of its own.
  deactivateBookingLink: {
    seed: aBookingLink,
    reseedForEachCall: true,
    params: { linkId: 'link' },
    // The body is optional (the app names its surface in it); the web sends none.
    body: {},
  },

  // The trainers of a workspace (F005): the switch routes act on the caller's own trainer profile, so they name no record.
  deleteTrainerProfile: {},

  // One client (F006): the read shows the seeded client it names.
  getClient: { seed: theClient, params: { clientId: 'client' } },

  // The billing details of a client (F059): the Owner's routes name a client of the workspace.
  getClientBillingDetails: {
    seed: theBillingDetails,
    params: { clientId: 'client' },
  },

  // The group classes of a workspace (F021): the read names the seeded class.
  getGroupClass: { seed: aClass, params: { classId: 'class' } },

  // The invoice details of a workspace (F059): the read shows the seeded legal name.
  getInvoiceDetails: { seed: theInvoiceDetails },

  // The join link (F029): a read shows the URL of the workspace's code and a renewal replaces it.
  // The code is on the workspace's own row; the suite counts it among that workspace's values, so
  // a response with another workspace's code fails.
  getJoinLink: { seed: theJoinCode },

  // The dates of a series that keep their own changes (F022, #1521): the read names the seeded date of a series.
  getKeptClassDates: {
    seed: aClassWithASeriesAndADate,
    params: { sessionId: 'session' },
  },

  // Account route: it reads the caller's own account.
  getMe: {},

  // The billing details of a client (F059): the client's own route shows the caller's own set.
  getMyBillingDetails: { seed: theBillingDetails },

  // The personal day and sessions of a trainer, read across the caller's own workspaces one at a
  // time (F013): a caller sees the sessions it is the trainer of, never another workspace's.
  getMyDay: { seed: aSessionForEachTrainer, query: '?date=2026-09-22' },

  // The offers of a workspace (F052): the read names the seeded offer.
  getOffer: { seed: anOffer, params: { offerId: 'offer' } },

  // The sessions of a workspace (F020): the read names the seeded session.
  getSession: { seed: aSession, params: { sessionId: 'session' } },

  // The routes of one workspace (F002): a read shows its id.
  getWorkspace: { seed: theWorkspace },

  // The calendar and the day of a workspace (F014): the sessions of that workspace only, whoever
  // their trainer is; a response never shows another workspace's sessions.
  getWorkspaceCalendar: { seed: aSessionInTheWeek, query: '?from=2026-09-21&to=2026-09-27' },
  getWorkspaceDay: { seed: aSessionInTheWeek, query: '?date=2026-09-22' },

  // The access log (E014): the Owner's list shows the seeded entry of each client of the workspace.
  listAccessLog: { seed: anAccessLogEntry },

  // The booking links of a workspace (F037): the list shows the seeded links (the standing ones
  // exist already, so reading changes nothing).
  listBookingLinks: { seed: theBookingLinks },

  // The sessions of a workspace (F020): the listing names the client and shows the client's coming session.
  listClientUpcomingSessions: { seed: aClientWithASession, params: { clientId: 'client' } },

  // The clients of a workspace (F006): the list shows every client the seed made (the suite calls
  // it once per client of the workspace).
  listClients: { seed: theClient },

  // The weekly series of a class (F022): the list names the seeded class.
  listGroupClassSeries: { seed: aClassWithASeries, params: { classId: 'class' } },

  // The group classes of a workspace (F021): the list shows the seeded class.
  listGroupClasses: { seed: aClass },

  // The locations of a workspace (F015): the list shows the workspace's own location (made with it:
  // `createWorkspace()` gives it its marker as the name).
  listLocations: { seed: theLocation },

  // The personal day and sessions of a trainer, read across the caller's own workspaces one at a
  // time (F013): a caller sees the sessions it is the trainer of, never another workspace's.
  listMySessions: { seed: aSessionForEachTrainer, query: '?from=2026-09-21&to=2026-09-27' },

  // Account route: the account's own team roles across its workspaces, never a workspace's data (F003).
  listMyWorkspaces: {},

  // The offers of a workspace (F052): the list shows the seeded offer.
  listOffers: { seed: anOffer },

  // The team of a workspace (F003): the list shows the seeded team member.
  listTeamMembers: { seed: aTeamMember },

  // The trainer invitations of a workspace (F011): the list shows the seeded pending invitation.
  listTrainerInvitations: { seed: anInvitation },

  // The trainers of a workspace (F005): the list shows the seeded Trainer.
  listTrainers: { seed: aTeamMember },

  // The address lookup (F015): the fake answers the invented 1234 AB 1. It names no record of the
  // workspace and the answer holds none; the isolation is the access and the rate-limit key.
  lookupAddress: { query: '?postcode=1234AB&houseNumber=1', readsNoRecords: true },

  // The probe routes of the test app (`probe-routes.ts`), one per kind of access.
  probeCreateClient: {},
  probeFindClient: { seed: theClient, params: { clientId: 'client' } },
  probeListClients: { seed: theClient },
  probeOwn: { seed: theWorkspace },
  probeOwnFindClient: { seed: theClient, params: { clientId: 'client' } },
  probeOwnListClients: { seed: theClient },
  probeOwner: { seed: theWorkspace },
  probePlaces: { seed: theWorkspace },
  probeTeam: { seed: theWorkspace },
  probeTeamPlaces: { seed: theWorkspace },
  probeValidated: { query: '?page=1', body: { name: 'Bram' } },

  // The billing details of a client (F059): the Owner's save names a client of the workspace.
  putClientBillingDetails: {
    seed: theBillingDetails,
    params: { clientId: 'client' },
    body: COMPANY_BILLING_DETAILS,
  },

  // The invoice details of a workspace (F059): the save replaces the details of the caller's
  // workspace only.
  putInvoiceDetails: {
    seed: theInvoiceDetails,
    body: {
      legalName: "John's Gym B.V.",
      street: 'Voorbeeldstraat',
      houseNumber: '1',
      postcode: '1234 AB',
      city: 'Amsterdam',
      kvkNumber: '12345678',
      vatNumber: 'NL000000000B01',
      noVat: false,
    },
  },

  // The billing details of a client (F059): the client's own save is a body of valid company details.
  putMyBillingDetails: { seed: theBillingDetails, body: COMPANY_BILLING_DETAILS },

  // The trainers of a workspace (F005): the switch routes act on the caller's own trainer profile, so they name no record.
  putTrainerProfile: {},

  // The report of a switch (F012) records a product event and changes no row.
  recordWorkspaceSwitch: { body: {} },

  // The team of a workspace (F003): the removal names the seeded team member.
  removeTeamMember: { seed: aTeamMember, params: { teamMemberId: 'teamMember' } },

  // A rename (F002) takes a valid name and, with it, the workspace's word for its trainers (F068).
  renameWorkspace: {
    seed: theWorkspace,
    body: { name: 'Renamed Gym', trainerWord: 'instructeur' },
  },

  // The join link (F029) renewal. The body is optional (the app names its surface in it); the web sends none.
  renewJoinLink: { body: {} },

  // The email change (F005, spec #610): both routes act on the caller's own account and touch no
  // workspace's data. The harness's stand-ins for the sign-in package answer without storing
  // anything; the change itself is proved against the real thing in `me-email.integration.test.ts`.
  requestEmailChange: { body: { newEmail: 'new-address@example.com' } },

  // The sessions of a workspace (F020): the move names the seeded session at the version it has, and asks for a time that exists (and, as
  // the plan does, allows an overlap with the sessions the suite made before).
  reschedulePrivateSession: {
    seed: aSessionOfTheCaller,
    reseedForEachCall: true,
    params: { sessionId: 'session' },
    body: {
      localDate: '2026-09-25',
      localStart: '10:00',
      durationMinutes: 60,
      notify: false,
      version: 1,
      allowConflicts: true,
    },
  },

  // The trainer invitations of a workspace (F011): this route names the seeded pending invitation.
  resendTrainerInvitation: {
    seed: anInvitation,
    params: { invitationId: 'invitation' },
  },

  // The group classes of a workspace (F021): the scheduling names the seeded class.
  scheduleGroupClassDate: {
    seed: aClass,
    params: { classId: 'class' },
    body: { localDate: '2026-10-06', localStart: '18:00' },
  },

  // One client (F006): the edit renames the seeded client.
  updateClient: {
    seed: theClient,
    params: { clientId: 'client' },
    body: { name: 'Renamed Client' },
  },

  // The group classes of a workspace (F021): the change names the seeded class.
  updateGroupClass: { seed: aClass, params: { classId: 'class' }, body: { capacity: 9 } },

  // The group classes of a workspace (F021): the date edit names the seeded group session and the version it starts at.
  updateGroupClassDate: {
    seed: aGroupDate,
    reseedForEachCall: true,
    params: { sessionId: 'session' },
    body: { version: 1, capacity: 9 },
  },

  // The weekly series of a class (F022): the edit names the seeded series and the version it starts at.
  updateGroupClassSeries: {
    seed: aClassWithASeriesAndADate,
    reseedForEachCall: true,
    params: { classId: 'class', seriesId: 'series' },
    body: { version: 1, capacity: 9 },
  },

  // The locations of a workspace (F015): the update names the workspace's own location and renames it.
  updateLocation: {
    seed: theLocation,
    params: { locationId: 'location' },
    body: { name: 'Renamed Location' },
  },

  // Account route: the caller's own account. It stores their language and touches no workspace's data (F010).
  updateMe: { body: { preferredLocale: 'en' } },

  // The offers of a workspace (F052): the change names the seeded offer at the version it has.
  updateOffer: {
    seed: anOffer,
    reseedForEachCall: true,
    params: { offerId: 'offer' },
    body: {
      version: 1,
      nameNl: 'Abonnement',
      priceCents: 8500,
      vatRateBasisPoints: 2100,
      classesPerWeek: 2,
      termMonths: 6,
      billingCycle: 'month',
      endOfTerm: 'stop',
      makeupsPerMonth: 2,
      cutoffMinutes: 720,
    },
  },

  // The trainer invitations of a workspace (F011): this route names the seeded pending invitation.
  withdrawTrainerInvitation: {
    seed: anInvitation,
    params: { invitationId: 'invitation' },
  },
};
