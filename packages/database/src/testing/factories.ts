import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { FIXTURE_INVITATION_VALIDITY_MS } from '../invitation-validity.ts';
import { insertOffer, type NewOffer, type OfferTerms } from '../repositories/offers.ts';
import {
  accessLog,
  authUsers,
  bookingLinks,
  classSeries,
  clientBillingDetails,
  clients,
  groupClasses,
  locations,
  organizations,
  paymentChargebacks,
  paymentCustomers,
  paymentRefundStatusChanges,
  paymentRefunds,
  paymentStatusChanges,
  payments,
  payoutLines,
  payoutStatusChanges,
  payouts,
  sessionParticipantStatusChanges,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerInvitations,
  trainerProfiles,
  workspaceInvoiceDetails,
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
 * A booking link of a workspace (F037): by default the standing link of all bookings in the
 * visitor's language, active, with a code the database makes. A `class` link points at the given
 * class or at one made for it, a `session` link at the given class date or at a group session made
 * for it, a week from now.
 */
export async function addBookingLink(
  db: Pick<DatabaseExecutor, 'insert' | 'select'>,
  options: {
    workspaceId: string;
    scope?: 'all' | 'group' | 'class' | 'session';
    language?: 'visitor' | 'nl' | 'en';
    groupClassId?: string;
    sessionId?: string;
    createdByTeamMemberId?: string | null;
    deactivatedAt?: Date | null;
    code?: string;
  },
): Promise<{ id: string; code: string }> {
  const scope = options.scope ?? 'all';
  const groupClassId =
    scope === 'class'
      ? (options.groupClassId ?? (await addGroupClass(db, { workspaceId: options.workspaceId })).id)
      : null;
  const sessionId =
    scope === 'session'
      ? (options.sessionId ??
        (
          await addSession(db, {
            workspaceId: options.workspaceId,
            type: 'group',
            participant: false,
          })
        ).id)
      : null;
  return first(
    await db
      .insert(bookingLinks)
      .values({
        organizationId: options.workspaceId,
        scope,
        language: options.language ?? 'visitor',
        groupClassId,
        sessionId,
        createdByTeamMemberId: options.createdByTeamMemberId ?? null,
        deactivatedAt: options.deactivatedAt ?? null,
        ...(options.code === undefined ? {} : { code: options.code }),
      })
      .returning({ id: bookingLinks.id, code: bookingLinks.code }),
    'booking link',
  );
}

/**
 * A weekly series of a class (F022): every Tuesday 18:00 Amsterdam time for 60 minutes, 8 places,
 * no usual trainer, from Tuesday 6 October 2026 with the calendar filled to 28 December, unless the
 * test says otherwise. It makes a class for it unless `groupClassId` is given. It adds no dates.
 */
export async function addClassSeries(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: {
    workspaceId: string;
    groupClassId?: string;
    rrule?: string;
    localStartTime?: string;
    durationMinutes?: number;
    timeZone?: string;
    trainerProfileId?: string | null;
    capacity?: number;
    startsOn?: string;
    endsOn?: string | null;
    materializedUntil?: string;
    version?: number;
  },
): Promise<{ id: string; groupClassId: string }> {
  const groupClassId =
    options.groupClassId ?? (await addGroupClass(db, { workspaceId: options.workspaceId })).id;
  const row = first(
    await db
      .insert(classSeries)
      .values({
        organizationId: options.workspaceId,
        groupClassId,
        rrule: options.rrule ?? 'FREQ=WEEKLY;BYDAY=TU',
        localStartTime: options.localStartTime ?? '18:00',
        durationMinutes: options.durationMinutes ?? 60,
        timeZone: options.timeZone ?? 'Europe/Amsterdam',
        trainerProfileId: options.trainerProfileId ?? null,
        capacity: options.capacity ?? 8,
        startsOn: options.startsOn ?? '2026-10-06',
        endsOn: options.endsOn ?? null,
        materializedUntil: options.materializedUntil ?? '2026-12-28',
        version: options.version ?? 1,
      })
      .returning({ id: classSeries.id }),
    'class series',
  );
  return { id: row.id, groupClassId };
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
    /** A second client makes it a duo (F066): capacity 2 and a second participant, `booked`. */
    secondClientId?: string;
    participant?: boolean;
    trainerProfileId?: string | null;
    createdByTeamMemberId?: string | null;
    /** Who changed it last; the planner when left out. */
    updatedByTeamMemberId?: string | null;
    locationId?: string;
    type?: 'private' | 'group' | 'open_gym';
    groupClassId?: string | null;
    /** The weekly series this class date belongs to (F022), with the local date it stands for. */
    series?: { id: string; occurrenceDate: string; detachedFields?: string[] };
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
        seriesId: options.series?.id ?? null,
        occurrenceDate: options.series?.occurrenceDate ?? null,
        detachedFields: options.series?.detachedFields ?? [],
        startsAt,
        endsAt,
        capacity:
          options.capacity ??
          (type === 'private' ? (options.secondClientId === undefined ? 1 : 2) : 10),
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
    if (options.secondClientId !== undefined) {
      await db.insert(sessionParticipants).values({
        organizationId: options.workspaceId,
        sessionId: session.id,
        clientId: options.secondClientId,
        // After the first, also inside one transaction (where `now()` does not move).
        createdAt: sql`clock_timestamp()`,
      });
    }
  }
  return { id: session.id, startsAt, endsAt, locationId };
}

/**
 * Places in a session for clients of the workspace (F025's test helper; spec #460: M4 has no
 * bookings, so a class date has participants only from here and from the seed): each a participant
 * `booked`, in the order of `clients`, written the way a booking will (nothing is added to the
 * status history: a test that needs lines adds them). `status` sets another start (`cancelled` for a
 * client who cancelled; F026 sets it in the app). The session's capacity is not checked. Returns the
 * participants' IDs with their clients.
 */
export async function addParticipants(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: {
    workspaceId: string;
    session: { id: string };
    clients: readonly { id: string }[];
    status?: 'booked' | 'attended' | 'cancelled' | 'no_show';
  },
): Promise<{ id: string; clientId: string }[]> {
  const places: { id: string; clientId: string }[] = [];
  for (const client of options.clients) {
    const row = first(
      await db
        .insert(sessionParticipants)
        .values({
          organizationId: options.workspaceId,
          sessionId: options.session.id,
          clientId: client.id,
          attendanceStatus: options.status ?? 'booked',
          // In the order given, also inside one transaction (where `now()` does not move).
          createdAt: sql`clock_timestamp()`,
        })
        .returning({ id: sessionParticipants.id, clientId: sessionParticipants.clientId }),
      'participant',
    );
    places.push(row);
  }
  return places;
}

/**
 * A line of the status history of a client's place in a session (F025): by default the first tap
 * of a Trainer on the web, `booked → attended` a moment after the given time (default: now). The
 * place is the client's participant of the session. The line is written as it is, the place's own
 * status is not changed. Returns the line's ID.
 */
export async function addParticipantStatusChange(
  db: Pick<DatabaseExecutor, 'insert' | 'select'>,
  options: {
    workspaceId: string;
    sessionId: string;
    clientId: string;
    from?: 'booked' | 'attended' | 'cancelled' | 'no_show' | null;
    to?: 'booked' | 'attended' | 'cancelled' | 'no_show';
    changedAt?: Date;
    clientRequestId?: string | null;
  },
): Promise<{ id: string }> {
  const place = first(
    await db
      .select({ id: sessionParticipants.id })
      .from(sessionParticipants)
      .where(
        and(
          eq(sessionParticipants.organizationId, options.workspaceId),
          eq(sessionParticipants.sessionId, options.sessionId),
          eq(sessionParticipants.clientId, options.clientId),
        ),
      ),
    'participant',
  );
  return first(
    await db
      .insert(sessionParticipantStatusChanges)
      .values({
        organizationId: options.workspaceId,
        sessionParticipantId: place.id,
        clientId: options.clientId,
        fromStatus: options.from === undefined ? 'booked' : options.from,
        toStatus: options.to ?? 'attended',
        changedAt: options.changedAt ?? new Date(),
        actorType: 'system',
        source: 'system',
        clientRequestId: options.clientRequestId ?? null,
      })
      .returning({ id: sessionParticipantStatusChanges.id }),
    'participant status change',
  );
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

/**
 * A refund of a payment of the workspace (F060), requested and with its first status line
 * (`null → requested`). The payment (with its client) is made for it unless `paymentId` is given;
 * `clientId` must then be the payment's client.
 */
export async function addPaymentRefund(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: {
    workspaceId: string;
    paymentId?: string;
    clientId?: string;
    amountCents?: number;
    requestedByTeamMemberId?: string | null;
  },
): Promise<{ id: string; paymentId: string; clientId: string }> {
  const payment =
    options.paymentId && options.clientId
      ? { id: options.paymentId, clientId: options.clientId }
      : await addPayment(db, { workspaceId: options.workspaceId });
  const refund = first(
    await db
      .insert(paymentRefunds)
      .values({
        organizationId: options.workspaceId,
        paymentId: payment.id,
        clientId: payment.clientId,
        amountCents: options.amountCents ?? 2000,
        requestedByTeamMemberId: options.requestedByTeamMemberId ?? null,
      })
      .returning({ id: paymentRefunds.id }),
    'payment refund',
  );
  await db.insert(paymentRefundStatusChanges).values({
    organizationId: options.workspaceId,
    refundId: refund.id,
    clientId: payment.clientId,
    fromStatus: null,
    toStatus: 'requested',
    occurredAt: new Date(),
    source: 'job',
  });
  return { id: refund.id, paymentId: payment.id, clientId: payment.clientId };
}

/** A reversal (chargeback) of a payment of the workspace (F060); the payment is made unless given. */
export async function addPaymentChargeback(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: {
    workspaceId: string;
    paymentId?: string;
    clientId?: string;
    amountCents?: number;
  },
): Promise<{ id: string; paymentId: string; clientId: string }> {
  const payment =
    options.paymentId && options.clientId
      ? { id: options.paymentId, clientId: options.clientId }
      : await addPayment(db, { workspaceId: options.workspaceId });
  const row = first(
    await db
      .insert(paymentChargebacks)
      .values({
        organizationId: options.workspaceId,
        paymentId: payment.id,
        clientId: payment.clientId,
        providerChargebackId: uniqueMarker('chb'),
        amountCents: options.amountCents ?? 4950,
        bankReason: 'MD01',
        receivedAt: new Date(),
      })
      .returning({ id: paymentChargebacks.id }),
    'payment chargeback',
  );
  return { id: row.id, paymentId: payment.id, clientId: payment.clientId };
}

/**
 * An owner-made offer of a workspace (F052) with its first version: by default a membership of
 * 2 classes a week, 6 months, € 79,00 including 21 % VAT, switched off, with a Dutch name that
 * carries a unique marker. The offer and its version point at each other and the key is checked
 * at commit, so the two are written in one transaction (a savepoint inside a test's).
 */
export async function addOffer(
  db: Pick<DatabaseExecutor, 'transaction'>,
  options: {
    workspaceId: string;
    offer?: Partial<Omit<NewOffer, 'terms'>>;
    terms?: Partial<OfferTerms>;
  },
): Promise<{ id: string; versionId: string; nameNl: string }> {
  const nameNl = options.terms?.nameNl ?? uniqueMarker('abonnement');
  const offer: NewOffer = {
    kind: 'membership',
    creditKind: null,
    defaultPlan: null,
    ...options.offer,
    terms: {
      classesPerWeek: 2,
      termMonths: 6,
      billingCycle: 'month',
      endOfTerm: 'stop',
      makeupsPerMonth: 2,
      cutoffMinutes: 720,
      renewalWindowDays: 30,
      priceCents: 7900,
      vatRateBasisPoints: 2100,
      ...options.terms,
      nameNl,
    },
  };
  const written = await db.transaction((tx) => insertOffer(tx, options.workspaceId, offer));
  return { ...written, nameNl };
}

/**
 * The invoice details of a workspace (F059): John's Gym B.V. by default, complete, the switch
 * *Ik reken geen btw* off and no question email. The legal name carries a unique marker.
 */
export async function addWorkspaceInvoiceDetails(
  db: DatabaseExecutor,
  options: { workspaceId: string; noVat?: boolean; questionEmail?: string | null },
): Promise<{ id: string; legalName: string }> {
  const legalName = uniqueMarker('gym-bv');
  const row = first(
    await db
      .insert(workspaceInvoiceDetails)
      .values({
        organizationId: options.workspaceId,
        legalName,
        street: 'Voorbeeldstraat',
        houseNumber: '1',
        postcode: '1234 AB',
        city: 'Amsterdam',
        kvkNumber: '12345678',
        vatNumber: 'NL000000000B01',
        questionEmail: options.questionEmail ?? null,
        noVat: options.noVat ?? false,
      })
      .returning({ id: workspaceInvoiceDetails.id }),
    'workspace invoice details',
  );
  return { id: row.id, legalName };
}

/**
 * The billing details of a client (F059): Jansen Advies B.V. by default, a company invoice last
 * changed by the client. The company name carries a unique marker.
 */
export async function addClientBillingDetails(
  db: DatabaseExecutor,
  options: { workspaceId: string; clientId: string; changedBy?: 'client' | 'team' },
): Promise<{ id: string; companyName: string }> {
  const companyName = uniqueMarker('jansen-advies');
  const row = first(
    await db
      .insert(clientBillingDetails)
      .values({
        organizationId: options.workspaceId,
        clientId: options.clientId,
        asCompany: true,
        companyName,
        street: 'Testweg',
        houseNumber: '2',
        postcode: '5678 CD',
        city: 'Utrecht',
        vatNumber: 'NL000000000B02',
        changedBy: options.changedBy ?? 'client',
      })
      .returning({ id: clientBillingDetails.id }),
    'client billing details',
  );
  return { id: row.id, companyName };
}

/**
 * A payout of the workspace (F061), with its first status line (`null → status`). Amounts are
 * the AC1 settlement's unless given: `stl_test0001` of Wednesday 10 February 2027, € 392,48.
 */
export async function addPayout(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: {
    workspaceId: string;
    providerSettlementId?: string;
    status?: (typeof payouts.status.enumValues)[number];
    settledAt?: Date | null;
    amountCents?: number;
  },
): Promise<{ id: string; providerSettlementId: string }> {
  const providerSettlementId = options.providerSettlementId ?? uniqueMarker('stl');
  const status = options.status ?? 'paidout';
  const fetchedAt = new Date();
  const payout = first(
    await db
      .insert(payouts)
      .values({
        organizationId: options.workspaceId,
        providerSettlementId,
        reference: '1234567.2701.01',
        settledAt:
          options.settledAt === undefined ? new Date('2027-02-10T05:30:12Z') : options.settledAt,
        amountCents: options.amountCents ?? 39248,
        status,
        fetchedAt,
      })
      .returning({ id: payouts.id }),
    'payout',
  );
  await db.insert(payoutStatusChanges).values({
    organizationId: options.workspaceId,
    payoutId: payout.id,
    fromStatus: null,
    toStatus: status,
    occurredAt: fetchedAt,
    source: 'job',
  });
  return { id: payout.id, providerSettlementId };
}

/** A line of a payout of the workspace (F061), stored unmatched; the payout is made unless given. */
export async function addPayoutLine(
  db: Pick<DatabaseExecutor, 'insert'>,
  options: {
    workspaceId: string;
    payoutId?: string;
    providerLineId?: string;
    type?: (typeof payoutLines.type.enumValues)[number];
    feeKind?: (typeof payoutLines.feeKind.enumValues)[number] | null;
    amountCents?: number;
  },
): Promise<{ id: string; payoutId: string; providerLineId: string }> {
  const payoutId =
    options.payoutId ?? (await addPayout(db, { workspaceId: options.workspaceId })).id;
  const providerLineId = options.providerLineId ?? uniqueMarker('tr');
  const type = options.type ?? 'payment';
  const line = first(
    await db
      .insert(payoutLines)
      .values({
        organizationId: options.workspaceId,
        payoutId,
        providerLineId,
        type,
        feeKind: type === 'fee' ? (options.feeKind ?? 'ideal') : null,
        amountCents: options.amountCents ?? 7900,
        description: 'Membership, February 2027',
        feeCount: type === 'fee' ? 1 : null,
      })
      .returning({ id: payoutLines.id }),
    'payout line',
  );
  return { id: line.id, payoutId, providerLineId };
}
