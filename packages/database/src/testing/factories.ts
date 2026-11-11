import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { FIXTURE_INVITATION_VALIDITY_MS } from '../invitation-validity.ts';
import {
  accessLog,
  authUsers,
  clients,
  groupClasses,
  locations,
  organizations,
  paymentCustomers,
  paymentStatusChanges,
  payments,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerInvitations,
  trainerProfiles,
} from '../schema/index.ts';

// Test factories for the tenancy core (TESTING.md §5.2). Each creates a valid record with
// sensible defaults, so a test states only what matters to it, and each takes the executor it
// runs on (the database or a `withRollback` transaction). They write directly, so they need a
// connection that is not subject to RLS (the privileged role), or a context that allows the write.
//
// Every record carries something unique to search for: the markers below where the record has a
// text column (an account's email and name, a workspace's name and slug, a client's name), the record's own uuid
// where it has none (a team role or a trainer profile). A test that asks
// "does this body contain anything of workspace A" searches for A's ids and markers.

/** A short unique string for a record: `<label>-<8 hex digits>`. Lower case, safe in an email. */
export function uniqueMarker(label: string): string {
  return `${label}-${randomBytes(4).toString('hex')}`;
}

type Executor = Pick<DatabaseExecutor, 'insert'>;

function first<T>(rows: T[], what: string): T {
  const [row] = rows;
  if (!row) throw new Error(`${what} was not created.`);
  return row;
}

/**
 * A workspace whose name and slug are one unique marker, in the defaults of a new workspace. It
 * has its one location (F015), named with the same marker and without an address, as the API
 * makes it; a test of the location itself leaves it out with `location: false`.
 */
export async function createWorkspace(
  db: Executor,
  options: { label?: string; location?: boolean } = {},
): Promise<{ id: string; marker: string }> {
  const marker = uniqueMarker(options.label ?? 'workspace');
  const row = first(
    await db
      .insert(organizations)
      .values({ name: marker, slug: marker, defaultLocale: 'nl-NL', timeZone: 'Europe/Amsterdam' })
      .returning({ id: organizations.id }),
    'workspace',
  );
  if (options.location !== false) {
    await db.insert(locations).values({
      organizationId: row.id,
      name: marker,
      type: 'organization_location',
      isDefault: true,
    });
  }
  return { id: row.id, marker };
}

/**
 * An account (a person's global login) whose email and name carry a unique marker; a test that
 * reads the name back gives one (`name`).
 */
export async function createAccount(
  db: Executor,
  options: { label?: string; name?: string } = {},
): Promise<{ id: string; email: string; marker: string }> {
  const marker = uniqueMarker(options.label ?? 'account');
  const email = `${marker}@example.com`;
  const row = first(
    await db
      .insert(authUsers)
      .values({ email, name: options.name ?? marker, emailVerified: true })
      .returning({ id: authUsers.id }),
    'account',
  );
  return { id: row.id, email, marker };
}

/**
 * The team role (Owner or Trainer, default Trainer) of an account in a workspace. A Trainer has a
 * trainer profile from the start (F005), as the API makes it; an Owner has none unless the test
 * says `trainsHere: true`, and a test can leave a Trainer's out with `trainsHere: false`.
 */
export async function addTeamRole(
  db: Executor,
  options: {
    workspaceId: string;
    accountId: string;
    role?: 'owner' | 'trainer';
    trainsHere?: boolean;
  },
): Promise<{ id: string }> {
  const role = options.role ?? 'trainer';
  const teamMember = first(
    await db
      .insert(teamMembers)
      .values({
        organizationId: options.workspaceId,
        accountId: options.accountId,
        role,
      })
      .returning({ id: teamMembers.id }),
    'team role',
  );
  if (options.trainsHere ?? role === 'trainer') {
    await addTrainerProfile(db, { workspaceId: options.workspaceId, teamMemberId: teamMember.id });
  }
  return teamMember;
}

/** The trainer profile of a team member: "trains in this workspace" (F005). */
export async function addTrainerProfile(
  db: Executor,
  options: { workspaceId: string; teamMemberId: string },
): Promise<{ id: string }> {
  return first(
    await db
      .insert(trainerProfiles)
      .values({ organizationId: options.workspaceId, teamMemberId: options.teamMemberId })
      .returning({ id: trainerProfiles.id }),
    'trainer profile',
  );
}

/**
 * Ends the team role of an account in a workspace: the `team_members` row goes, and a client
 * relationship of the same account in the same workspace stays (`PRODUCT.md §9`). For tests that
 * need someone whose role ended; F003 owns the real flow.
 */
export async function endTeamRole(
  db: Pick<DatabaseExecutor, 'delete'>,
  options: { workspaceId: string; accountId: string },
): Promise<void> {
  const removed = await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.organizationId, options.workspaceId),
        eq(teamMembers.accountId, options.accountId),
      ),
    )
    .returning({ id: teamMembers.id });
  if (removed.length === 0) throw new Error('The account has no team role in the workspace.');
}

/**
 * A client of a workspace, linked to an account or (a quick-added client) to none. Its name is a
 * unique marker unless the test gives one; its email address is a unique marker at example.com unless the test gives one (every client has one).
 */
export async function addClient(
  db: Executor,
  options: {
    workspaceId: string;
    accountId?: string;
    name?: string;
    email?: string;
    emailLocale?: 'nl-NL' | 'en';
  },
): Promise<{ id: string; name: string }> {
  return first(
    await db
      .insert(clients)
      .values({
        organizationId: options.workspaceId,
        accountId: options.accountId ?? null,
        name: options.name ?? uniqueMarker('client'),
        email: options.email ?? `${uniqueMarker('client')}@example.com`,
        emailLocale: options.emailLocale ?? null,
      })
      .returning({ id: clients.id, name: clients.name }),
    'client',
  );
}

/**
 * A trainer invitation of a workspace (F011), sent by a team member of it. Pending, for a unique
 * `@example.com` address, valid for 7 days from now, with a token hash of no real token, unless
 * the test says otherwise.
 */
export async function addTrainerInvitation(
  db: Executor,
  options: {
    workspaceId: string;
    inviterTeamMemberId: string;
    name?: string;
    email?: string;
    emailLocale?: 'nl-NL' | 'en';
    status?: 'pending' | 'accepted' | 'declined' | 'withdrawn';
    tokenHash?: string;
    expiresAt?: Date;
    createdAt?: Date;
  },
): Promise<{ id: string; name: string; email: string }> {
  return first(
    await db
      .insert(trainerInvitations)
      .values({
        organizationId: options.workspaceId,
        inviterTeamMemberId: options.inviterTeamMemberId,
        name: options.name ?? uniqueMarker('invitee'),
        email: options.email ?? `${uniqueMarker('invitee')}@example.com`,
        emailLocale: options.emailLocale ?? null,
        status: options.status ?? 'pending',
        tokenHash: options.tokenHash ?? uniqueMarker('token-hash'),
        expiresAt: options.expiresAt ?? new Date(Date.now() + FIXTURE_INVITATION_VALIDITY_MS),
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      })
      .returning({
        id: trainerInvitations.id,
        name: trainerInvitations.name,
        email: trainerInvitations.email,
      }),
    'trainer invitation',
  );
}

/**
 * A group class of a workspace (F021): "Kracht", 8 places, 60 minutes, no usual trainer, with a
 * Dutch name that carries a unique marker, unless the test says otherwise.
 */
export async function addGroupClass(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: {
    workspaceId: string;
    nameNl?: string;
    nameEn?: string | null;
    descriptionNl?: string | null;
    descriptionEn?: string | null;
    defaultTrainerProfileId?: string | null;
    capacity?: number;
    durationMinutes?: number;
  },
): Promise<{ id: string; nameNl: string }> {
  return first(
    await db
      .insert(groupClasses)
      .values({
        organizationId: options.workspaceId,
        nameNl: options.nameNl ?? uniqueMarker('kracht'),
        nameEn: options.nameEn ?? null,
        descriptionNl: options.descriptionNl ?? null,
        descriptionEn: options.descriptionEn ?? null,
        defaultTrainerProfileId: options.defaultTrainerProfileId ?? null,
        capacity: options.capacity ?? 8,
        durationMinutes: options.durationMinutes ?? 60,
      })
      .returning({ id: groupClasses.id, nameNl: groupClasses.nameNl }),
    'group class',
  );
}

/**
 * A private session of a workspace (F020) with one participant, a client of it. Unless the test
 * says otherwise: at the workspace's default location, for the given trainer profile (none when
 * not given), planned by nobody, an hour long, starting at the given instant (default: a week
 * from now), `scheduled`, version 1, with the client `booked`. A test that needs the client
 * gives one (`clientId`); a group or Open Gym session passes `participant: false`. A group
 * session (F021) is a class on a date: it points at `groupClassId`, or at a class made for it.
 */
export async function addSession(
  db: Pick<DatabaseExecutor, 'insert' | 'select'>,
  options: {
    workspaceId: string;
    clientId?: string;
    participant?: boolean;
    trainerProfileId?: string | null;
    createdByTeamMemberId?: string | null;
    /** Who changed it last; the planner when left out. */
    updatedByTeamMemberId?: string | null;
    locationId?: string;
    type?: 'private' | 'group' | 'open_gym';
    groupClassId?: string | null;
    status?: 'scheduled' | 'cancelled';
    startsAt?: Date;
    durationMinutes?: number;
    capacity?: number;
    version?: number;
  },
): Promise<{ id: string; startsAt: Date; endsAt: Date; locationId: string }> {
  const locationId =
    options.locationId ??
    first(
      await db
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(eq(locations.organizationId, options.workspaceId), eq(locations.isDefault, true)),
        ),
      'default location',
    ).id;
  const type = options.type ?? 'private';
  const groupClassId =
    options.groupClassId === undefined
      ? type === 'group'
        ? (await addGroupClass(db, { workspaceId: options.workspaceId })).id
        : null
      : options.groupClassId;
  const startsAt = options.startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + (options.durationMinutes ?? 60) * 60_000);
  const session = first(
    await db
      .insert(sessions)
      .values({
        organizationId: options.workspaceId,
        type,
        status: options.status ?? 'scheduled',
        trainerProfileId: options.trainerProfileId ?? null,
        locationId,
        groupClassId,
        startsAt,
        endsAt,
        capacity: options.capacity ?? (type === 'private' ? 1 : 10),
        createdByTeamMemberId: options.createdByTeamMemberId ?? null,
        updatedByTeamMemberId:
          options.updatedByTeamMemberId ?? options.createdByTeamMemberId ?? null,
        version: options.version ?? 1,
      })
      .returning({ id: sessions.id }),
    'session',
  );
  if (options.participant !== false) {
    await db.insert(sessionParticipants).values({
      organizationId: options.workspaceId,
      sessionId: session.id,
      clientId: options.clientId ?? (await addClient(db, { workspaceId: options.workspaceId })).id,
    });
  }
  return { id: session.id, startsAt, endsAt, locationId };
}

/**
 * An open payment of a client of the workspace (E019): a one-off payment for an open amount, in
 * test mode, with a business key of its own. The client is made for it unless `clientId` is given.
 */
export async function addPayment(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: {
    workspaceId: string;
    clientId?: string;
    businessKey?: string;
    amountCents?: number;
  },
): Promise<{ id: string; clientId: string; businessKey: string }> {
  const clientId =
    options.clientId ?? (await addClient(db, { workspaceId: options.workspaceId })).id;
  const businessKey = options.businessKey ?? uniqueMarker('open-amount');
  const payment = first(
    await db
      .insert(payments)
      .values({
        organizationId: options.workspaceId,
        clientId,
        kind: 'oneoff',
        purpose: 'open_amount',
        businessKey,
        amountCents: options.amountCents ?? 4950,
        description: 'Membership October',
        supplied: {
          nameNl: 'Lidmaatschap',
          nameEn: 'Membership',
          period: null,
          vatRateBp: 2100,
        },
      })
      .returning({ id: payments.id }),
    'payment',
  );
  await db.insert(paymentStatusChanges).values({
    organizationId: options.workspaceId,
    paymentId: payment.id,
    clientId,
    fromStatus: null,
    toStatus: 'open',
    occurredAt: new Date(),
    source: 'job',
  });
  return { id: payment.id, clientId, businessKey };
}

/** A provider customer for a client of the workspace (E019); the client is made unless given. */
export async function addPaymentCustomer(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: { workspaceId: string; clientId?: string },
): Promise<{ id: string; clientId: string }> {
  const clientId =
    options.clientId ?? (await addClient(db, { workspaceId: options.workspaceId })).id;
  const row = first(
    await db
      .insert(paymentCustomers)
      .values({
        organizationId: options.workspaceId,
        clientId,
        providerCustomerId: uniqueMarker('cst'),
      })
      .returning({ id: paymentCustomers.id }),
    'payment customer',
  );
  return { id: row.id, clientId };
}

/**
 * An access-log entry of the workspace (E014), by default a `client.exported` by an Owner made for
 * it about a client made for it. Pass the IDs to say who and what; a `workspace.exported` entry
 * names no client, a `note.viewed` or `note.changed` entry gets a note ID of its own unless given.
 */
export async function addAccessLogEntry(
  db: Executor,
  options: {
    workspaceId: string;
    action?: (typeof accessLog.action.enumValues)[number];
    actorTeamMemberId?: string | null;
    subjectClientId?: string | null;
    objectId?: string | null;
    occurredAt?: Date;
  },
): Promise<{ id: string; actorTeamMemberId: string | null; subjectClientId: string | null }> {
  const action = options.action ?? 'client.exported';
  const actorTeamMemberId =
    options.actorTeamMemberId !== undefined
      ? options.actorTeamMemberId
      : (
          await addTeamRole(db, {
            workspaceId: options.workspaceId,
            accountId: (await createAccount(db, { label: 'actor' })).id,
            role: 'owner',
          })
        ).id;
  const subjectClientId =
    options.subjectClientId !== undefined
      ? options.subjectClientId
      : action === 'workspace.exported'
        ? null
        : (await addClient(db, { workspaceId: options.workspaceId })).id;
  const objectId =
    options.objectId !== undefined
      ? options.objectId
      : action === 'note.viewed' || action === 'note.changed'
        ? crypto.randomUUID()
        : null;
  const row = first(
    await db
      .insert(accessLog)
      .values({
        organizationId: options.workspaceId,
        actorTeamMemberId,
        action,
        subjectClientId,
        objectId,
        ...(options.occurredAt ? { occurredAt: options.occurredAt } : {}),
      })
      .returning({ id: accessLog.id }),
    'access log entry',
  );
  return { id: row.id, actorTeamMemberId, subjectClientId };
}
