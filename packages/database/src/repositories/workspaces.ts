import { randomUUID } from 'node:crypto';
import type { Locale, TrainerWord } from '@fivvi/i18n';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  authUsers,
  clients,
  locations,
  organizations,
  teamMembers,
  trainerProfiles,
} from '../schema/index.ts';
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
  /** The word the product uses for the workspace's trainers (F068); the role stays Trainer. */
  readonly trainerWord: TrainerWord;
}

/** What a list of workspaces shows (the picker, the signed-in home): the name and the URL name. */
export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly trainerWord: TrainerWord;
  /** What the account is in it: the page decides from this who sees the settings. */
  readonly role: TeamRole;
  /** Whether the account has a trainer profile in it, that is whether it trains there (F005). */
  readonly trainsHere: boolean;
}

/**
 * What a client sees of a workspace they belong to: the name, the URL name and the word the
 * workspace uses for its trainers (F068), nothing else.
 */
export interface ClientWorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly trainerWord: TrainerWord;
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
  /** Whether the Owner trains here: the rule of `packages/domain` (F005), made in the same transaction. */
  readonly ownerTrains: boolean;
}

/**
 * Creates the workspace, its one location (F015), the account's Owner role in it (with a trainer
 * profile when the creator trains, F005) and, when given, the account's name, in
 * the scope's transaction: a failure later in the request rolls all of it back. `undefined` when
 * the slug is taken (the caller tries the next one; a workspace of someone else can't be seen,
 * so the unique index decides), and then nothing was created.
 *
 * The caller has already decided the account may create a workspace (the rule of
 * `packages/domain`). An account may create several (F012), so nothing here limits the count.
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
      trainerWord: organizations.trainerWord,
    });
  if (!workspace) {
    // Back to the context the request had, so nothing names a workspace that doesn't exist.
    await setContext(db, { accountId, workspaceIds });
    return undefined;
  }
  // The workspace's one location, named after it, without an address (F015 AC1, AC2): in this
  // transaction, so a workspace never exists without one.
  await db.insert(locations).values({
    organizationId: id,
    name: workspace.name,
    type: 'organization_location',
    isDefault: true,
  });
  const [owner] = await db
    .insert(teamMembers)
    .values({ organizationId: id, accountId, role: 'owner' })
    .returning({ id: teamMembers.id });
  if (!owner) throw new Error('The Owner’s team role was not created.');
  if (input.ownerTrains) {
    await db.insert(trainerProfiles).values({ organizationId: id, teamMemberId: owner.id });
  }
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
      trainerWord: organizations.trainerWord,
      role: teamMembers.role,
      trainerProfileId: trainerProfiles.id,
    })
    .from(organizations)
    .innerJoin(teamMembers, eq(teamMembers.organizationId, organizations.id))
    .leftJoin(
      trainerProfiles,
      and(
        eq(trainerProfiles.organizationId, teamMembers.organizationId),
        eq(trainerProfiles.teamMemberId, teamMembers.id),
      ),
    )
    .where(and(eq(teamMembers.accountId, accountId), inArray(organizations.id, [...workspaceIds])))
    .orderBy(asc(organizations.name), asc(organizations.slug))
    .then((rows) =>
      rows.map(({ trainerProfileId, ...workspace }) => ({
        ...workspace,
        trainsHere: trainerProfileId !== null,
      })),
    );
}

/**
 * The workspaces where the scope's account has a client relationship, by name: where a person
 * who is only a client lands after sign-in (F030). A client record linked to the account counts
 * as joined; F029 and F032 narrow that to the joined ones when join requests and invitations
 * exist. A team role alone lists nothing, and neither does a workspace outside the scope's
 * context (RLS says the same).
 */
export function listClientWorkspaces(scope: TenantScope): Promise<ClientWorkspaceSummary[]> {
  const db = executorOf(scope);
  const { accountId, workspaceIds } = scope.context;
  if (workspaceIds.length === 0) return Promise.resolve([]);
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      trainerWord: organizations.trainerWord,
    })
    .from(organizations)
    .innerJoin(clients, eq(clients.organizationId, organizations.id))
    .where(and(eq(clients.accountId, accountId), inArray(organizations.id, [...workspaceIds])))
    .orderBy(asc(organizations.name), asc(organizations.slug));
}

const workspaceColumns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  defaultLocale: organizations.defaultLocale,
  timeZone: organizations.timeZone,
  trainerWord: organizations.trainerWord,
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
  /** The word for the workspace's trainers (F068); checked by the caller to be one of the four. */
  readonly trainerWord?: TrainerWord;
}

/**
 * Changes the name, the default communication language and/or the word for trainers of the scope's workspace and
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
    ...(changes.trainerWord === undefined ? {} : { trainerWord: changes.trainerWord }),
  };
  if (Object.keys(values).length === 0) return findWorkspace(scope);
  const [workspace] = await executorOf(scope)
    .update(organizations)
    .set(values)
    .where(eq(organizations.id, scope.workspaceId))
    .returning(workspaceColumns);
  return workspace;
}

/** The join link of a workspace (F029): the code in `/j/{code}` and when it was last renewed. */
export interface JoinLinkView {
  readonly code: string;
  /** When the Owner last renewed it; `null` while the code is the one the workspace started with. */
  readonly renewedAt: Date | null;
}

const joinLinkColumns = {
  code: organizations.joinCode,
  renewedAt: organizations.joinLinkRenewedAt,
};

/** The join link of the workspace of a workspace route's scope. `undefined` when RLS shows no such row. */
export async function findJoinLink(scope: WorkspaceScope): Promise<JoinLinkView | undefined> {
  const [link] = await executorOf(scope)
    .select(joinLinkColumns)
    .from(organizations)
    .where(eq(organizations.id, scope.workspaceId));
  return link;
}

/**
 * Replaces the workspace's join code with a new one (`new_join_code()`, from Postgres's CSPRNG)
 * and stores `renewedAt`. The old code names no workspace from the moment this commits. The caller
 * has decided the account may (F004: `join_link.renew`). Two codes colliding is a 1-in-10^12 event
 * that the unique index refuses: the request fails and renewing again makes another code.
 */
export async function renewJoinLink(
  scope: WorkspaceScope,
  renewedAt: Date,
): Promise<JoinLinkView | undefined> {
  const [link] = await executorOf(scope)
    .update(organizations)
    .set({ joinCode: sql`new_join_code()`, joinLinkRenewedAt: renewedAt })
    .where(eq(organizations.id, scope.workspaceId))
    .returning(joinLinkColumns);
  return link;
}
