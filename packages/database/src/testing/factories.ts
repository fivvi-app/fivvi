import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { authUsers, clients, organizations, teamMembers } from '../schema/index.ts';

// Test factories for the tenancy core (TESTING.md §5.2). Each creates a valid record with
// sensible defaults, so a test states only what matters to it, and each takes the executor it
// runs on (the database or a `withRollback` transaction). They write directly, so they need a
// connection that is not subject to RLS (the privileged role), or a context that allows the write.
//
// Every record carries something unique to search for: the markers below where the record has a
// text column (an account's email and name), the record's own uuid where it has none yet (a
// workspace until F002 adds its name, a team role, a client until F006 adds the profile). A test
// that asks "does this body contain anything of workspace A" searches for A's ids and markers.

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

/** A workspace. Its uuid is its marker until F002 adds a name. */
export async function createWorkspace(db: Executor): Promise<{ id: string }> {
  return first(
    await db.insert(organizations).values({}).returning({ id: organizations.id }),
    'workspace',
  );
}

/** An account (a person's global login) whose email and name carry a unique marker. */
export async function createAccount(
  db: Executor,
  options: { label?: string } = {},
): Promise<{ id: string; email: string; marker: string }> {
  const marker = uniqueMarker(options.label ?? 'account');
  const email = `${marker}@example.com`;
  const row = first(
    await db
      .insert(authUsers)
      .values({ email, name: marker, emailVerified: true })
      .returning({ id: authUsers.id }),
    'account',
  );
  return { id: row.id, email, marker };
}

/** The team role (Owner or Trainer, default Trainer) of an account in a workspace. */
export async function addTeamRole(
  db: Executor,
  options: { workspaceId: string; accountId: string; role?: 'owner' | 'trainer' },
): Promise<{ id: string }> {
  return first(
    await db
      .insert(teamMembers)
      .values({
        organizationId: options.workspaceId,
        accountId: options.accountId,
        role: options.role ?? 'trainer',
      })
      .returning({ id: teamMembers.id }),
    'team role',
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

/** A client of a workspace, linked to an account or (a quick-added client) to none. */
export async function addClient(
  db: Executor,
  options: { workspaceId: string; accountId?: string },
): Promise<{ id: string }> {
  return first(
    await db
      .insert(clients)
      .values({ organizationId: options.workspaceId, accountId: options.accountId ?? null })
      .returning({ id: clients.id }),
    'client',
  );
}
