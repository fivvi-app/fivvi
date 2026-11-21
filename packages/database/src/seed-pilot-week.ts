import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client.ts';
import {
  authUsers,
  clients,
  groupClasses,
  locations,
  organizations,
  sessionParticipants,
  sessions,
  teamMembers,
  trainerProfiles,
} from './schema/index.ts';

/**
 * The pilot-shaped week of the workspace calendar (F014, spec #458): a workspace of its own,
 * "Pilot Gym" (`pilot-gym`), with the spec's week of Monday 21 to Sunday 27 September 2026 laid out
 * as the spec has it (Europe/Amsterdam, summer time) and filled to the size of the pilot, 15 class
 * dates and 30 private sessions, so the calendar and day routes and the web calendar have a full
 * week to read (AC10, AC15).
 *
 * Why not John's Gym: Tuesday 22 September 2026 of John's Gym is already F013's day (the personal
 * calendar, `seedPersonalCalendar`), with Sarah's Anna, Mark and Kracht at other times than this
 * spec's, and the tests and previews of F013 read Sarah's day as it is. A second week on the same
 * day would change it. So this week lives in a workspace whose people are not those of F013's
 * accounts: Paula (Owner, also trains, the spec's John), Sven (the spec's Sarah) and Noor (the
 * spec's Tom), and clients with their own names. Nothing here touches the accounts or the sessions
 * of the other seeded workspaces, and Sarah's, John's and Tom's days stay as they were.
 *
 * Synthetic: `@example.com` addresses and made-up names; never in production (`seed` returns first).
 */

/** The workspace of the pilot week. */
export const PILOT_WORKSPACE = { name: 'Pilot Gym', slug: 'pilot-gym' } as const;

/** The Monday of the pilot week; the days are `PILOT_MONDAY` plus 0 to 6. */
export const PILOT_MONDAY = '2026-09-21';

const TIME_ZONE = 'Europe/Amsterdam';

/** The people of the workspace: the Owner also trains. */
const PILOT_PEOPLE = [
  { key: 'paula', email: 'paula@example.com', name: 'Paula', role: 'owner' },
  { key: 'sven', email: 'sven@example.com', name: 'Sven', role: 'trainer' },
  { key: 'noor', email: 'noor@example.com', name: 'Noor', role: 'trainer' },
] as const;

type PilotPerson = (typeof PILOT_PEOPLE)[number]['key'];

/** Ten clients, every one with an `@example.com` address. */
const PILOT_CLIENTS = [
  'Eva Visser',
  'Daan Mulder',
  'Fleur Bos',
  'Jesse Vos',
  'Lotte Dekker',
  'Milan Smit',
  'Nina Kok',
  'Ruben Hendriks',
  'Sanne Jacobs',
  'Thijs Meijer',
] as const;

const emailOf = (name: string) => `${name.toLowerCase().replace(/ /g, '.')}@example.com`;

/**
 * The classes of the week: the Dutch name, an optional English one, the usual trainer (none:
 * *Trainer nodig*), capacity and length.
 */
const PILOT_CLASSES = [
  { nameNl: 'Kracht', nameEn: 'Strength', trainer: 'sven', capacity: 8, minutes: 60 },
  { nameNl: 'Boxing', nameEn: null, trainer: null, capacity: 12, minutes: 60 },
  { nameNl: 'Mobility', nameEn: null, trainer: 'noor', capacity: 12, minutes: 45 },
  { nameNl: 'Bootcamp', nameEn: null, trainer: 'paula', capacity: 15, minutes: 60 },
] as const satisfies readonly {
  nameNl: string;
  nameEn: string | null;
  trainer: PilotPerson | null;
  capacity: number;
  minutes: number;
}[];

interface PilotClassDate {
  readonly weekday: number;
  readonly start: string;
  readonly className: (typeof PILOT_CLASSES)[number]['nameNl'];
  readonly status?: 'cancelled';
}

/**
 * The 15 class dates, Monday (1) to Saturday (6). From the spec: Kracht on Tuesday 10:00 with
 * Sven, a cancelled Kracht on Tuesday 18:00 and Boxing on Thursday 19:15 with no trainer. A class
 * date has its class's trainer and capacity, no two of one trainer overlap, and none overlaps the
 * private sessions below.
 */
export const PILOT_CLASS_DATES: readonly PilotClassDate[] = [
  { weekday: 1, start: '12:15', className: 'Mobility' },
  { weekday: 1, start: '18:00', className: 'Kracht' },
  { weekday: 2, start: '10:00', className: 'Kracht' },
  { weekday: 2, start: '18:00', className: 'Kracht', status: 'cancelled' },
  { weekday: 3, start: '12:15', className: 'Mobility' },
  { weekday: 3, start: '18:00', className: 'Bootcamp' },
  { weekday: 3, start: '18:00', className: 'Kracht' },
  { weekday: 4, start: '10:00', className: 'Kracht' },
  { weekday: 4, start: '12:15', className: 'Mobility' },
  { weekday: 4, start: '19:15', className: 'Boxing' },
  { weekday: 5, start: '18:00', className: 'Bootcamp' },
  { weekday: 5, start: '18:00', className: 'Kracht' },
  { weekday: 6, start: '10:00', className: 'Mobility' },
  { weekday: 6, start: '11:15', className: 'Bootcamp' },
  { weekday: 6, start: '12:30', className: 'Kracht' },
];

/**
 * The slots of a weekday Monday to Friday: six private sessions of an hour, 30 in the week. On
 * Tuesday the first is the spec's 07:00 with Sven and the third its 11:00 with Noor.
 */
const PILOT_PRIVATE_SLOTS: readonly { readonly start: string; readonly trainer: PilotPerson }[] = [
  { start: '07:00', trainer: 'sven' },
  { start: '09:00', trainer: 'noor' },
  { start: '11:00', trainer: 'noor' },
  { start: '13:00', trainer: 'paula' },
  { start: '16:00', trainer: 'sven' },
  { start: '17:00', trainer: 'noor' },
];

/**
 * Seeds the pilot week, once: a workspace that has a session in the week already (the seed's or
 * an Owner's change) is left alone, so what someone moved or cancelled since stays. Returns the
 * workspace's ID, for the parts of the seed that every workspace gets (booking links, offers).
 */
export async function seedPilotWeek(db: DatabaseExecutor): Promise<string> {
  await db
    .insert(authUsers)
    .values(
      PILOT_PEOPLE.map(({ email, name }) => ({
        email,
        name,
        emailVerified: true,
        preferredLocale: 'nl-NL' as const,
      })),
    )
    .onConflictDoNothing({ target: authUsers.email });
  await db
    .insert(organizations)
    .values({
      ...PILOT_WORKSPACE,
      defaultLocale: 'nl-NL',
      timeZone: TIME_ZONE,
    })
    .onConflictDoNothing({ target: organizations.slug });
  const [workspace] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, PILOT_WORKSPACE.slug));
  if (!workspace) throw new Error('The seed did not find the pilot workspace.');
  const organizationId = workspace.id;

  const accounts = await db
    .select({ id: authUsers.id, email: authUsers.email })
    .from(authUsers)
    .where(
      inArray(
        authUsers.email,
        PILOT_PEOPLE.map(({ email }) => email),
      ),
    );
  await db
    .insert(teamMembers)
    .values(
      PILOT_PEOPLE.map(({ email, role }) => {
        const account = accounts.find((row) => row.email === email);
        if (!account) throw new Error('The seed did not find its account.');
        return { organizationId, accountId: account.id, role };
      }),
    )
    .onConflictDoNothing({ target: [teamMembers.organizationId, teamMembers.accountId] });
  const members = await db
    .select({ id: teamMembers.id, accountId: teamMembers.accountId })
    .from(teamMembers)
    .where(eq(teamMembers.organizationId, organizationId));
  await db
    .insert(trainerProfiles)
    .values(members.map(({ id }) => ({ organizationId, teamMemberId: id })))
    .onConflictDoNothing({ target: trainerProfiles.teamMemberId });
  // The workspace's one location, named after it, as the API makes it (F015).
  await db.execute(sql`
    insert into locations (organization_id, name, type, is_default)
    select o.id, o.name, 'organization_location', true
    from organizations o
    where o.id = ${organizationId}
      and not exists (select 1 from locations l where l.organization_id = o.id and l.is_default)`);

  const weekStart = sql`(${PILOT_MONDAY}::date + time '00:00') at time zone ${TIME_ZONE}`;
  const weekEnd = sql`(${PILOT_MONDAY}::date + 7 + time '00:00') at time zone ${TIME_ZONE}`;
  const [seeded] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.organizationId, organizationId),
        gte(sessions.startsAt, weekStart as never),
        lt(sessions.startsAt, weekEnd as never),
      ),
    )
    .limit(1);
  if (seeded) return organizationId;

  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.organizationId, organizationId), eq(locations.isDefault, true)));
  if (!location) throw new Error('The seed did not find the pilot workspace’s location.');
  const profiles = await db
    .select({ email: authUsers.email, id: trainerProfiles.id })
    .from(trainerProfiles)
    .innerJoin(teamMembers, eq(teamMembers.id, trainerProfiles.teamMemberId))
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(eq(trainerProfiles.organizationId, organizationId));
  const profileOf = (person: PilotPerson): string => {
    const email = PILOT_PEOPLE.find(({ key }) => key === person)?.email;
    const found = profiles.find((row) => row.email === email);
    if (!found) throw new Error('The seed did not find a trainer profile.');
    return found.id;
  };

  const existingClients = await db
    .select({ email: clients.email })
    .from(clients)
    .where(eq(clients.organizationId, organizationId));
  await db
    .insert(clients)
    .values(
      PILOT_CLIENTS.filter(
        (name) => !existingClients.some((row) => row.email === emailOf(name)),
      ).map((name) => ({ organizationId, name, email: emailOf(name) })),
    )
    .onConflictDoNothing();
  const clientRows = await db
    .select({ id: clients.id, email: clients.email })
    .from(clients)
    .where(eq(clients.organizationId, organizationId));
  const clientOf = (name: string): string => {
    const found = clientRows.find((row) => row.email === emailOf(name));
    if (!found) throw new Error('The seed did not find a client.');
    return found.id;
  };

  // A class is made once by its Dutch name; a class date copies its trainer, capacity and length.
  const existingClasses = await db
    .select({ nameNl: groupClasses.nameNl, id: groupClasses.id })
    .from(groupClasses)
    .where(eq(groupClasses.organizationId, organizationId));
  const classIds = new Map(existingClasses.map((row) => [row.nameNl, row.id]));
  for (const plan of PILOT_CLASSES) {
    if (classIds.has(plan.nameNl)) continue;
    const [created] = await db
      .insert(groupClasses)
      .values({
        organizationId,
        nameNl: plan.nameNl,
        nameEn: plan.nameEn,
        defaultTrainerProfileId: plan.trainer ? profileOf(plan.trainer) : null,
        capacity: plan.capacity,
        durationMinutes: plan.minutes,
      })
      .returning({ id: groupClasses.id });
    if (!created) throw new Error('The seed did not store a class.');
    classIds.set(plan.nameNl, created.id);
  }

  // The wall-clock times become instants with Postgres's own time zone rules, as the rest of the seed.
  const startOf = (weekday: number, start: string) =>
    sql`(${PILOT_MONDAY}::date + ${weekday - 1}::int + ${start}::time) at time zone ${TIME_ZONE}`;
  for (const date of PILOT_CLASS_DATES) {
    const plan = PILOT_CLASSES.find(({ nameNl }) => nameNl === date.className);
    const groupClassId = classIds.get(date.className);
    if (!plan || !groupClassId) throw new Error('The seed did not find a class.');
    const startsAt = startOf(date.weekday, date.start);
    await db.insert(sessions).values({
      organizationId,
      type: 'group',
      status: date.status ?? 'scheduled',
      groupClassId,
      trainerProfileId: plan.trainer ? profileOf(plan.trainer) : null,
      locationId: location.id,
      startsAt: startsAt as never,
      endsAt: sql`(${startsAt}) + ${plan.minutes} * interval '1 minute'` as never,
      capacity: plan.capacity,
    });
  }

  let next = 0;
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    for (const slot of PILOT_PRIVATE_SLOTS) {
      const startsAt = startOf(weekday, slot.start);
      const [session] = await db
        .insert(sessions)
        .values({
          organizationId,
          type: 'private',
          trainerProfileId: profileOf(slot.trainer),
          locationId: location.id,
          startsAt: startsAt as never,
          endsAt: sql`(${startsAt}) + interval '60 minutes'` as never,
          capacity: 1,
        })
        .returning({ id: sessions.id });
      if (!session) throw new Error('The seed did not store a session.');
      const name = PILOT_CLIENTS[next % PILOT_CLIENTS.length];
      next += 1;
      if (!name) throw new Error('The seed did not find a client.');
      await db
        .insert(sessionParticipants)
        .values({ organizationId, sessionId: session.id, clientId: clientOf(name) });
    }
  }
  return organizationId;
}
