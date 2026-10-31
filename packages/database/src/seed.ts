import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client.ts';
import { authUsers, clients, organizations, teamMembers } from './schema/index.ts';

export interface SeedOptions {
  /**
   * The `production` environment: the seed creates nothing. Production never runs it (E003);
   * this is the second lock.
   */
  production?: boolean;
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
 * so previews and tests have the multi-workspace and two-role cases of `PRODUCT.md §9`. Rows that
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
  await db
    .insert(teamMembers)
    .values([
      { organizationId: gym, accountId: owner, role: 'owner' },
      { organizationId: gym, accountId: sarah, role: 'trainer' },
      { organizationId: personalTraining, accountId: sarah, role: 'owner' },
    ])
    .onConflictDoNothing({ target: [teamMembers.organizationId, teamMembers.accountId] });
  // Idempotent without fixed IDs: a client is there already when its email address is used in
  // the workspace, or, for the one without an address, when its name is.
  const existing = await db
    .select({ name: clients.name, email: clients.email })
    .from(clients)
    .where(eq(clients.organizationId, gym));
  const missing = SEED_CLIENTS.filter(
    (client) =>
      !existing.some((row) =>
        client.email === null
          ? row.email === null && row.name === client.name
          : row.email === client.email,
      ),
  );
  if (missing.length > 0) {
    await db
      .insert(clients)
      .values(missing.map((client) => ({ organizationId: gym, ...client })))
      .onConflictDoNothing();
  }
}

/** The synthetic clients of John's Gym (F006 AC15): `@example.com` addresses, one without. */
const SEED_CLIENTS = [
  { name: 'Anna de Vries', email: 'anna@example.com', emailLocale: 'en' as const },
  { name: 'Mark Jansen', email: null, emailLocale: null },
  { name: 'Sophie Bakker', email: 'sophie.bakker@example.com', emailLocale: null },
];
