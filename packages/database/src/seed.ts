import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client.ts';
import { FIXTURE_INVITATION_VALIDITY_MS } from './invitation-validity.ts';
import {
  authUsers,
  clients,
  locations,
  organizations,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerInvitations,
  trainerProfiles,
} from './schema/index.ts';

export interface SeedOptions {
  /**
   * The `production` environment: the seed creates nothing. Production never runs it (E003);
   * this is the second lock.
   */
  production?: boolean;
  /** Where "now" comes from: the week of private sessions to seed (F020). Default: the real clock. */
  now?: Date;
}

/** Whether this process runs in the Railway environment `production` (ENVIRONMENTS.md). */
export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RAILWAY_ENVIRONMENT_NAME?.trim() === 'production';
}

/**
 * Inserts demo data for local development, previews and tests. Production never runs it.
 * Must stay idempotent: previews run it on every deploy (E003). Never put real client data
 * here (ADR-005).
 *
 * Today: the account `owner@example.com` (F001), so every preview has an account to sign in
 * with (its sign-in email is written to the server log, `@example.com`, packages/email), and
 * the workspace "John's Gym" (`johns-gym`) that account owns (F002), so previews and e2e start
 * with a workspace. The seed writes as the privileged role, so it sets the same defaults the
 * create route does (`WORKSPACE_DEFAULTS` of packages/domain) by hand: this package can't
 * import the domain. And the account `trainer@example.com` ("Sarah", F003): Trainer of John's
 * Gym and Owner of a second workspace, "Sarah Personal Training" (`sarah-personal-training`),
 * so previews and tests have the multi-workspace and two-role cases of `PRODUCT.md §9`, and the
 * account `tom@example.com` ("Tom"), a second Trainer of John's Gym (F020). John and
 * Sarah train in John's Gym and Sarah in her own workspace (trainer profiles, F005), and Tom in
 * John's Gym. Each
 * workspace has its one location (F015), John's Gym's with a synthetic address. And a pending
 * trainer invitation of John's Gym for `invitee@example.com` (F011), so previews show the pending
 * row of *Trainers*; nobody knows its token (see `SEED_INVITATION_TOKEN_HASH`), an Owner sends it
 * again to get a link. And a synthetic week of private sessions of John's Gym (F020 AC15): for
 * John, Sarah and Tom with the seeded clients, Monday to Friday of the current week, so previews
 * and the calendars of M4 have data; a week that has sessions already is left alone, and the next
 * week gets its own. Rows that
 * every environment needs, like the `hello` greeting, are data migrations instead
 * (`src/system-data.ts`).
 */
export async function seed(db: DatabaseExecutor, options: SeedOptions = {}): Promise<void> {
  if (options.production) return;
  await db
    .insert(authUsers)
    .values({
      email: 'owner@example.com',
      name: 'Owner',
      emailVerified: true,
      preferredLocale: 'nl-NL',
    })
    .onConflictDoNothing({ target: authUsers.email });
  await db
    .insert(organizations)
    .values({
      name: "John's Gym",
      slug: 'johns-gym',
      defaultLocale: 'nl-NL',
      timeZone: 'Europe/Amsterdam',
    })
    .onConflictDoNothing({ target: organizations.slug });
  await db
    .insert(authUsers)
    .values({
      email: 'trainer@example.com',
      name: 'Sarah',
      emailVerified: true,
      preferredLocale: 'nl-NL',
    })
    .onConflictDoNothing({ target: authUsers.email });
  await db
    .insert(organizations)
    .values({
      name: 'Sarah Personal Training',
      slug: 'sarah-personal-training',
      defaultLocale: 'nl-NL',
      timeZone: 'Europe/Amsterdam',
    })
    .onConflictDoNothing({ target: organizations.slug });
  await db
    .insert(authUsers)
    .values({
      email: 'tom@example.com',
      name: 'Tom',
      emailVerified: true,
      preferredLocale: 'nl-NL',
    })
    .onConflictDoNothing({ target: authUsers.email });
  const accountId = async (email: string) => {
    const [row] = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, email));
    if (!row) throw new Error('The seed did not find its account.');
    return row.id;
  };
  const workspaceId = async (slug: string) => {
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug));
    if (!row) throw new Error('The seed did not find its workspace.');
    return row.id;
  };
  const gym = await workspaceId('johns-gym');
  const personalTraining = await workspaceId('sarah-personal-training');
  const owner = await accountId('owner@example.com');
  const sarah = await accountId('trainer@example.com');
  const tom = await accountId('tom@example.com');
  await db
    .insert(teamMembers)
    .values([
      { organizationId: gym, accountId: owner, role: 'owner' },
      { organizationId: gym, accountId: sarah, role: 'trainer' },
      { organizationId: gym, accountId: tom, role: 'trainer' },
      { organizationId: personalTraining, accountId: sarah, role: 'owner' },
    ])
    .onConflictDoNothing({ target: [teamMembers.organizationId, teamMembers.accountId] });
  // Who trains (F005): John (the creator), Sarah and Tom in John's Gym, Sarah in her own workspace.
  const trainers = await db
    .select({ id: teamMembers.id, organizationId: teamMembers.organizationId })
    .from(teamMembers)
    .where(
      and(
        inArray(teamMembers.organizationId, [gym, personalTraining]),
        inArray(teamMembers.accountId, [owner, sarah, tom]),
      ),
    );
  await db
    .insert(trainerProfiles)
    .values(trainers.map(({ id, organizationId }) => ({ organizationId, teamMemberId: id })))
    .onConflictDoNothing({ target: trainerProfiles.teamMemberId });
  // The one location of each workspace (F015), named after it, as the API makes it. Created only
  // when the workspace has none: a seed after the backfill or after an Owner's rename leaves the
  // name alone. John's Gym's has a synthetic address, so previews show the filled-in card (AC12);
  // given only while it has none, so what an Owner typed since stays.
  await db.execute(sql`
    insert into locations (organization_id, name, type, is_default)
    select o.id, o.name, 'organization_location', true
    from organizations o
    where o.id in (${gym}, ${personalTraining})
      and not exists (select 1 from locations l where l.organization_id = o.id and l.is_default)`);
  await db
    .update(locations)
    .set({
      postcode: '1234 AB',
      houseNumber: '1',
      street: 'Voorbeeldstraat',
      city: 'Amsterdam',
    })
    .where(
      and(
        eq(locations.organizationId, gym),
        eq(locations.isDefault, true),
        isNull(locations.postcode),
      ),
    );
  // The pending trainer invitation of John's Gym (F011 AC14), sent by John. Made once per address:
  // one an Owner withdrew or sent again since stays as it is.
  const [johnInGym] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.organizationId, gym), eq(teamMembers.accountId, owner)));
  if (!johnInGym) throw new Error('The seed did not find its Owner.');
  const [alreadyInvited] = await db
    .select({ id: trainerInvitations.id })
    .from(trainerInvitations)
    .where(
      and(
        eq(trainerInvitations.organizationId, gym),
        eq(trainerInvitations.email, SEED_INVITATION.email),
      ),
    );
  if (!alreadyInvited) {
    await db.insert(trainerInvitations).values({
      organizationId: gym,
      inviterTeamMemberId: johnInGym.id,
      ...SEED_INVITATION,
      tokenHash: SEED_INVITATION_TOKEN_HASH,
      expiresAt: new Date(Date.now() + FIXTURE_INVITATION_VALIDITY_MS),
    });
  }
  // Idempotent without fixed IDs: a client is there already when its email address is used in
  // the workspace.
  const existing = await db
    .select({ email: clients.email })
    .from(clients)
    .where(eq(clients.organizationId, gym));
  const missing = SEED_CLIENTS.filter(
    (client) => !existing.some((row) => row.email === client.email),
  );
  if (missing.length > 0) {
    await db
      .insert(clients)
      .values(missing.map((client) => ({ organizationId: gym, ...client })))
      .onConflictDoNothing();
  }
  await seedPrivateSessions(db, { workspaceId: gym, now: options.now ?? new Date() });
}

/**
 * One private session of the seeded week: the weekday (1 is Monday), the local start in the
 * workspace's time zone, the length, the trainer's account and the client's address.
 */
interface SeedSession {
  readonly weekday: number;
  readonly start: string;
  readonly minutes: number;
  readonly trainer: string;
  readonly client: string;
}

/** The synthetic week of John's Gym (F020 AC15): John, Sarah and Tom each train; every client comes. */
const SEED_SESSIONS: readonly SeedSession[] = [
  {
    weekday: 1,
    start: '09:00',
    minutes: 60,
    trainer: 'trainer@example.com',
    client: 'anna@example.com',
  },
  {
    weekday: 1,
    start: '10:30',
    minutes: 45,
    trainer: 'owner@example.com',
    client: 'mark@example.com',
  },
  {
    weekday: 2,
    start: '08:30',
    minutes: 60,
    trainer: 'tom@example.com',
    client: 'sophie.bakker@example.com',
  },
  {
    weekday: 2,
    start: '17:00',
    minutes: 60,
    trainer: 'trainer@example.com',
    client: 'mark@example.com',
  },
  {
    weekday: 3,
    start: '09:00',
    minutes: 60,
    trainer: 'owner@example.com',
    client: 'anna@example.com',
  },
  {
    weekday: 4,
    start: '09:00',
    minutes: 60,
    trainer: 'trainer@example.com',
    client: 'anna@example.com',
  },
  {
    weekday: 4,
    start: '18:00',
    minutes: 90,
    trainer: 'tom@example.com',
    client: 'mark@example.com',
  },
  {
    weekday: 5,
    start: '10:00',
    minutes: 60,
    trainer: 'owner@example.com',
    client: 'sophie.bakker@example.com',
  },
  {
    weekday: 5,
    start: '16:00',
    minutes: 60,
    trainer: 'trainer@example.com',
    client: 'sophie.bakker@example.com',
  },
];

/** The date of Monday of the week `now` falls in, in `timeZone`: `YYYY-MM-DD`. */
function mondayOf(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(part('weekday'));
  const today = Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day')));
  return new Date(today - sinceMonday * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Seeds the week of private sessions of John's Gym that `now` falls in (F020 AC15), once: a week
 * that has any session already, the seed's or an Owner's, is left alone, and the next week gets
 * its own. The local times become instants in the workspace's time zone with Postgres's own
 * time zone rules, so a week in summer time and one in winter time keep the same wall-clock times.
 */
async function seedPrivateSessions(
  db: DatabaseExecutor,
  { workspaceId, now }: { workspaceId: string; now: Date },
): Promise<void> {
  const [workspace] = await db
    .select({ timeZone: organizations.timeZone })
    .from(organizations)
    .where(eq(organizations.id, workspaceId));
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.organizationId, workspaceId), eq(locations.isDefault, true)));
  if (!workspace || !location) throw new Error('The seed did not find the workspace’s location.');
  const monday = mondayOf(now, workspace.timeZone);
  const at = (date: ReturnType<typeof sql>) => sql`(${date}) at time zone ${workspace.timeZone}`;
  const weekStart = at(sql`${monday}::date + time '00:00'`);
  const weekEnd = at(sql`${monday}::date + 7 + time '00:00'`);
  const [seeded] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.organizationId, workspaceId),
        gte(sessions.startsAt, weekStart as never),
        lt(sessions.startsAt, weekEnd as never),
      ),
    )
    .limit(1);
  if (seeded) return;

  const trainers = new Map(
    (
      await db
        .select({ email: authUsers.email, profileId: trainerProfiles.id })
        .from(trainerProfiles)
        .innerJoin(teamMembers, eq(teamMembers.id, trainerProfiles.teamMemberId))
        .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
        .where(eq(trainerProfiles.organizationId, workspaceId))
    ).map((row) => [row.email, row.profileId]),
  );
  const clientIds = new Map(
    (
      await db
        .select({ email: clients.email, id: clients.id })
        .from(clients)
        .where(eq(clients.organizationId, workspaceId))
    ).map((row) => [row.email, row.id]),
  );
  for (const plan of SEED_SESSIONS) {
    const trainerProfileId = trainers.get(plan.trainer);
    const clientId = clientIds.get(plan.client);
    if (!trainerProfileId || !clientId)
      throw new Error('The seed did not find a trainer or client.');
    const startsAt = at(sql`${monday}::date + ${plan.weekday - 1}::int + ${plan.start}::time`);
    const [session] = await db
      .insert(sessions)
      .values({
        organizationId: workspaceId,
        type: 'private',
        trainerProfileId,
        locationId: location.id,
        startsAt: startsAt as never,
        endsAt: sql`(${startsAt}) + ${plan.minutes} * interval '1 minute'` as never,
        capacity: 1,
      })
      .returning({ id: sessions.id });
    if (!session) throw new Error('The seed did not store a session.');
    await db
      .insert(sessionParticipants)
      .values({ organizationId: workspaceId, sessionId: session.id, clientId });
  }
}

/** The synthetic clients of John's Gym (F006 AC15): `@example.com` addresses, every one with an email. */
const SEED_CLIENTS = [
  { name: 'Anna de Vries', email: 'anna@example.com', emailLocale: 'en' as const },
  { name: 'Mark Jansen', email: 'mark@example.com', emailLocale: null },
  { name: 'Sophie Bakker', email: 'sophie.bakker@example.com', emailLocale: null },
];

/** The synthetic pending invitation of John's Gym (F011 AC14): an `@example.com` address. */
const SEED_INVITATION = { name: 'Invitee', email: 'invitee@example.com' } as const;

/**
 * The hash stored for the seeded invitation. It is the hash of no token anyone could hold (the
 * API's hash of a token is SHA-256 of 256 random bits; no token hashes to all zeros), so the
 * seeded link opens nothing until an Owner sends the invitation again, which rotates it.
 */
const SEED_INVITATION_TOKEN_HASH = '0'.repeat(64);
