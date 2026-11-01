import type { Locale } from '@fivvi/i18n';
import { and, asc, count, eq, type SQL, sql } from 'drizzle-orm';
import { clients } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The clients of a workspace, through a tenant scope. Each function names the scope's workspace
// itself (barrier 1) and, for a scope that acts as a client, the client's own record only
// (Q2); RLS says the same underneath (barrier 2). Another workspace's or another client's
// record is simply not there.
//
// What a client view holds is what the team sees: never the account link (F006 AC4). The link is
// read by `findClientOfAccount` and written by `createClient`, and goes no further.

export interface ClientView {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly email: string | null;
  readonly emailLocale: Locale | null;
}

const columns = {
  id: clients.id,
  workspaceId: clients.organizationId,
  name: clients.name,
  email: clients.email,
  emailLocale: clients.emailLocale,
};

function visibleTo(scope: WorkspaceScope) {
  const inWorkspace = eq(clients.organizationId, scope.workspaceId);
  // A client route sees one client only. Without a client id there is nothing to see.
  return scope.actingAs === 'client'
    ? and(inWorkspace, eq(clients.id, scope.context.clientId ?? ''))
    : inWorkspace;
}

/** `%`, `_` and `\` in text typed into a search stand for themselves, not for a pattern. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

/** The clause that matches a search: part of the name or of the email address, accents and case ignored. */
function matches(search: string): SQL {
  const pattern = likePattern(search);
  return sql`(lower(unaccent(${clients.name})) like lower(unaccent(${pattern}))
    or lower(unaccent(coalesce(${clients.email}, ''))) like lower(unaccent(${pattern})))`;
}

export interface ClientPage {
  readonly items: ClientView[];
  /** How many clients match, over all pages. */
  readonly total: number;
}

const byName = [sql`lower(unaccent(${clients.name}))`, asc(clients.name), asc(clients.id)] as const;

/** The clients the scope may see: all of the workspace's for a team member, the caller's own as a client. */
export function listClients(scope: WorkspaceScope): Promise<ClientView[]> {
  return executorOf(scope)
    .select(columns)
    .from(clients)
    .where(visibleTo(scope))
    .orderBy(...byName);
}

/**
 * One page of the clients the scope may see, sorted by name. `search` matches part of a name or
 * of an email address, ignoring case and accents, in the database (F006 AC6).
 */
export async function searchClients(
  scope: WorkspaceScope,
  options: { search?: string; limit: number; offset: number },
): Promise<ClientPage> {
  const db = executorOf(scope);
  const search = options.search?.trim();
  const where = and(visibleTo(scope), search ? matches(search) : undefined);
  const [items, [counted]] = await Promise.all([
    db
      .select(columns)
      .from(clients)
      .where(where)
      .orderBy(...byName)
      .limit(options.limit)
      .offset(options.offset),
    db.select({ total: count() }).from(clients).where(where),
  ]);
  return { items, total: counted?.total ?? 0 };
}

/** One client, or `undefined` when it doesn't exist in the scope's workspace or isn't the caller's own. */
export async function findClient(
  scope: WorkspaceScope,
  clientId: string,
): Promise<ClientView | undefined> {
  const [row] = await executorOf(scope)
    .select(columns)
    .from(clients)
    .where(and(visibleTo(scope), eq(clients.id, clientId)))
    .limit(1);
  return row;
}

/** The client of the workspace that has the email address (lower case), if any. */
export async function findClientByEmail(
  scope: WorkspaceScope,
  email: string,
): Promise<{ id: string } | undefined> {
  const [row] = await executorOf(scope)
    .select({ id: clients.id })
    .from(clients)
    .where(and(visibleTo(scope), eq(clients.email, email)))
    .limit(1);
  return row;
}

/** The client of the workspace that is linked to the account, if any. Reads the link; shows nothing of it. */
export async function findClientOfAccount(
  scope: WorkspaceScope,
  accountId: string,
): Promise<{ id: string } | undefined> {
  const [row] = await executorOf(scope)
    .select({ id: clients.id })
    .from(clients)
    .where(and(visibleTo(scope), eq(clients.accountId, accountId)))
    .limit(1);
  return row;
}

export interface NewClient {
  readonly name: string;
  readonly email?: string | null;
  readonly emailLocale?: Locale | null;
  /** The account the client is linked to; leave it out for none. */
  readonly accountId?: string | null;
}

/**
 * Adds a client to the scope's workspace, never another. `undefined` when the workspace already
 * has a client with that email address or for that account (a parallel request got there first):
 * nothing is added, and the caller looks the existing client up. A client route can't add
 * clients (RLS refuses it).
 */
export async function createClient(
  scope: WorkspaceScope,
  input: NewClient,
): Promise<ClientView | undefined> {
  const [row] = await executorOf(scope)
    .insert(clients)
    .values({ organizationId: scope.workspaceId, ...input })
    .onConflictDoNothing()
    .returning(columns);
  return row;
}

export interface ClientChanges {
  readonly name?: string;
  /** The new email address (lower case); `null` clears it. */
  readonly email?: string | null;
  /** The new language for emails; `null` follows the workspace default. */
  readonly emailLocale?: Locale | null;
  /** The account the client is linked to; `null` removes the link. Leave it out to keep the link. */
  readonly accountId?: string | null;
}

/** Whether the failure is Postgres refusing a second row for a unique index or constraint (23505). */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Changes a client of the scope's workspace, only the fields given. `undefined` when the client
 * is not there (another workspace's, or not the caller's own). `'taken'` when a parallel request
 * gave the email address, or the account, to another client of the workspace first: nothing
 * changed, and the caller looks the other client up. The change runs in a savepoint, so that
 * refusal does not abort the request's transaction. A client route can't edit clients (RLS
 * refuses it).
 */
export async function updateClient(
  scope: WorkspaceScope,
  clientId: string,
  changes: ClientChanges,
): Promise<ClientView | 'taken' | undefined> {
  const given = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(given).length === 0) return findClient(scope, clientId);
  try {
    return await executorOf(scope).transaction(async (savepoint) => {
      const [row] = await savepoint
        .update(clients)
        .set(given)
        .where(and(visibleTo(scope), eq(clients.id, clientId)))
        .returning(columns);
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'taken';
    throw error;
  }
}
