import { randomUUID } from 'node:crypto';
import type { Locale } from '@fivvi/i18n';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { authUsers, organizations, teamMembers } from '../schema/index.ts';
import {
  executorOf,
  setContext,
  type TeamRole,
  type TenantScope,
  type WorkspaceScope,
} from '../tenant-scope.ts';

// Creating a workspace (F002, ADR-022). The row of a workspace is out of reach of the RLS policy
// `organizations_workspace` until its id is in the request's context, and the id of a workspace
// that doesn't exist yet can't be in a context the middleware built. So the create chooses the id
// first, adds it to the context of the transaction, and only then inserts the workspace and the
// Owner's team role (barrier 2, RLS, stays on: it checks the write).

export interface WorkspaceView {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly defaultLocale: Locale;
  readonly timeZone: string;
}

/** What a list of workspaces shows (the picker, the signed-in home): the name and the URL name. */
export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** What the account is in it: the page decides from this who sees the settings. */
  readonly role: TeamRole;
}

export interface NewWorkspace {
  /** Trimmed and checked by the caller. */
  readonly name: string;
  /** The URL name; unique across workspaces. */
  readonly slug: string;
  readonly defaultLocale: Locale;
  readonly timeZone: string;
  /** The account's own name, set in the same transaction when given. */
  readonly ownerName?: string;
}

export interface WorkspaceCreationClaim {
  /** Whether the account has a team role (Owner or Trainer) in any workspace, as of now. */
  readonly hasTeamRole: boolean;
}

/**
 * Claims the right to create a workspace for the scope's account, until the transaction ends:
 * takes a lock on the account, so two requests of one account at once can't both pass the
 * rule "no team role yet", and reads the account's team roles fresh (not from the context,
 * which a request built before the lock). The caller decides from `hasTeamRole`.
 */
export async function claimWorkspaceCreation(scope: TenantScope): Promise<WorkspaceCreationClaim> {
  const db = executorOf(scope);
  const { accountId } = scope.context;
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`workspace-creation:${accountId}`}, 0))`,
  );
  const [role] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(eq(teamMembers.accountId, accountId))
    .limit(1);
  return { hasTeamRole: role !== undefined };
}

/**
 * Creates the workspace, the account's Owner role in it and, when given, the account's name, in
 * the scope's transaction: a failure later in the request rolls all of it back. `undefined` when
 * the slug is taken (the caller tries the next one; a workspace of someone else can't be seen,
 * so the unique index decides), and then nothing was created.
 *
 * The caller has already decided the account may create a workspace (`claimWorkspaceCreation`
 * and the rule of `packages/domain`).
 */
export async function createWorkspaceWithOwner(
  scope: TenantScope,
  input: NewWorkspace,
): Promise<WorkspaceView | undefined> {
  const db = executorOf(scope);
  const { accountId, workspaceIds } = scope.context;
  const id = randomUUID();
  await setContext(db, { accountId, workspaceIds: [...workspaceIds, id] });
  const [workspace] = await db
    .insert(organizations)
    .values({
      id,
      name: input.name,
      slug: input.slug,
      defaultLocale: input.defaultLocale,
      timeZone: input.timeZone,
    })
    .onConflictDoNothing({ target: organizations.slug })
    .returning({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      defaultLocale: organizations.defaultLocale,
      timeZone: organizations.timeZone,
    });
  if (!workspace) {
    // Back to the context the request had, so nothing names a workspace that doesn't exist.
    await setContext(db, { accountId, workspaceIds });
    return undefined;
  }
  await db.insert(teamMembers).values({ organizationId: id, accountId, role: 'owner' });
  if (input.ownerName !== undefined) {
    await db.update(authUsers).set({ name: input.ownerName }).where(eq(authUsers.id, accountId));
  }
  return workspace;
}

/**
 * The workspaces where the scope's account has a team role (Owner or Trainer), by name: the ones
 * it goes to after sign-in. A workspace it is only a client of is not listed, whatever the scope
 * holds, and neither is one outside the scope's context (RLS says the same).
 */
export function listTeamWorkspaces(scope: TenantScope): Promise<WorkspaceSummary[]> {
  const db = executorOf(scope);
  const { accountId, workspaceIds } = scope.context;
  if (workspaceIds.length === 0) return Promise.resolve([]);
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: teamMembers.role,
    })
    .from(organizations)
    .innerJoin(teamMembers, eq(teamMembers.organizationId, organizations.id))
    .where(and(eq(teamMembers.accountId, accountId), inArray(organizations.id, [...workspaceIds])))
    .orderBy(asc(organizations.name), asc(organizations.slug));
}

const workspaceColumns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  defaultLocale: organizations.defaultLocale,
  timeZone: organizations.timeZone,
};

/** The workspace of a workspace route's scope. `undefined` when RLS shows no such row. */
export async function findWorkspace(scope: WorkspaceScope): Promise<WorkspaceView | undefined> {
  const [workspace] = await executorOf(scope)
    .select(workspaceColumns)
    .from(organizations)
    .where(eq(organizations.id, scope.workspaceId));
  return workspace;
}

/** What an Owner may change of a workspace: the fields given change, the others stay. */
export interface WorkspaceChanges {
  /** Trimmed and checked by the caller. */
  readonly name?: string;
  /** The default communication language (ADR-017); checked by the caller to be a catalog locale. */
  readonly defaultLocale?: Locale;
}

/**
 * Changes the name and/or the default communication language of the scope's workspace and
 * nothing else: the slug stays, so links and QR codes keep working. The caller has checked the
 * values and decided the account may. With nothing to change it just reads the workspace.
 */
export async function updateWorkspace(
  scope: WorkspaceScope,
  changes: WorkspaceChanges,
): Promise<WorkspaceView | undefined> {
  const values = {
    ...(changes.name === undefined ? {} : { name: changes.name }),
    ...(changes.defaultLocale === undefined ? {} : { defaultLocale: changes.defaultLocale }),
  };
  if (Object.keys(values).length === 0) return findWorkspace(scope);
  const [workspace] = await executorOf(scope)
    .update(organizations)
    .set(values)
    .where(eq(organizations.id, scope.workspaceId))
    .returning(workspaceColumns);
  return workspace;
}
