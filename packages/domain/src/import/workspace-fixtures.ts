import {
  authUsers,
  clients,
  type Database,
  locations,
  organizations,
  teamMembers,
  trainerProfiles,
} from '@fivvi/database';
import { eq } from 'drizzle-orm';
import type { WorkspaceSnapshot } from './check.ts';

// The synthetic workspaces the dry-run CLI loads into a local scratch database (E015, AC15).
// Everything here is made up, at example.com.

interface FixtureClient {
  readonly name: string;
  readonly email: string;
}

interface WorkspaceFixture {
  readonly name: string;
  readonly slug: string;
  readonly owner: string;
  readonly trainers: readonly string[];
  readonly clients: readonly FixtureClient[];
}

const JOHNS_GYM = {
  name: "John's Gym",
  slug: 'johns-gym',
  owner: 'john@example.com',
  trainers: ['sarah@example.com', 'tom@example.com'],
  clients: [],
} as const satisfies WorkspaceFixture;

/** The fixtures by name: `johns-gym` (John, with Sarah and Tom joined) and the same with a client. */
export const WORKSPACE_FIXTURES = {
  'johns-gym': JOHNS_GYM,
  'johns-gym-existing-client': {
    ...JOHNS_GYM,
    clients: [{ name: 'Anna de Vries', email: 'anna.de.vries@example.com' }],
  },
} as const satisfies Record<string, WorkspaceFixture>;

export type WorkspaceFixtureName = keyof typeof WORKSPACE_FIXTURES;

export function isWorkspaceFixtureName(name: string): name is WorkspaceFixtureName {
  return Object.hasOwn(WORKSPACE_FIXTURES, name);
}

/** Writes the fixture workspace with its team and clients; returns the workspace's ID. */
export async function loadWorkspaceFixture(
  db: Database,
  name: WorkspaceFixtureName,
): Promise<string> {
  const fixture: WorkspaceFixture = WORKSPACE_FIXTURES[name];
  return await db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(organizations)
      .values({
        name: fixture.name,
        slug: fixture.slug,
        defaultLocale: 'nl-NL',
        timeZone: 'Europe/Amsterdam',
      })
      .returning({ id: organizations.id });
    if (!workspace) throw new Error('The fixture workspace was not created.');
    await tx.insert(locations).values({
      organizationId: workspace.id,
      name: fixture.name,
      type: 'organization_location',
      isDefault: true,
    });
    const people = [
      { email: fixture.owner, role: 'owner' as const },
      ...fixture.trainers.map((email) => ({ email, role: 'trainer' as const })),
    ];
    for (const person of people) {
      const [account] = await tx
        .insert(authUsers)
        .values({
          email: person.email,
          name: person.email.split('@')[0] ?? '',
          emailVerified: true,
        })
        .returning({ id: authUsers.id });
      if (!account) throw new Error('The fixture account was not created.');
      const [member] = await tx
        .insert(teamMembers)
        .values({ organizationId: workspace.id, accountId: account.id, role: person.role })
        .returning({ id: teamMembers.id });
      if (!member) throw new Error('The fixture team member was not created.');
      if (person.role === 'trainer') {
        await tx
          .insert(trainerProfiles)
          .values({ organizationId: workspace.id, teamMemberId: member.id });
      }
    }
    for (const client of fixture.clients) {
      await tx
        .insert(clients)
        .values({ organizationId: workspace.id, name: client.name, email: client.email });
    }
    return workspace.id;
  });
}

/** The read-only snapshot of a workspace that the check and the plan work on. */
export async function readWorkspaceSnapshot(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceSnapshot> {
  const [workspace] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, workspaceId));
  if (!workspace) throw new Error('The workspace does not exist.');
  const trainers = await db
    .select({ email: authUsers.email })
    .from(trainerProfiles)
    .innerJoin(teamMembers, eq(teamMembers.id, trainerProfiles.teamMemberId))
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(eq(trainerProfiles.organizationId, workspaceId));
  const existing = await db
    .select({ id: clients.id, email: clients.email })
    .from(clients)
    .where(eq(clients.organizationId, workspaceId));
  return {
    name: workspace.name,
    trainerEmails: trainers.map((trainer) => trainer.email),
    clients: existing,
  };
}
