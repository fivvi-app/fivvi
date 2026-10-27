import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client.ts';
import { findPlace, findWorkspaceIdsOf } from './repositories/places.ts';
import type { teamRole } from './schema/index.ts';

// The tenant scope of a request (E011, ADR-006, spec #145). A request that touches business data
// runs in one transaction whose context (the account, the workspaces it may touch, and for a
// client route the client) is set with `set_config(…, true)`: transaction-local, so it ends with
// the commit or rollback and can't leak to the next request on a pooled connection.
//
// Repositories take a `TenantScope`, never a raw executor, and the only way to get one is
// `inWorkspaceScope` or `inAccountScope` below. Both open the transaction, set the context, and
// hand the scope to `run`; the scope is only valid inside it. The executor behind a scope is
// reachable only inside this package (`executorOf`, not exported from `index.ts`).

/** The team roles of a workspace (`team_role` in Postgres). */
export type TeamRole = (typeof teamRole.enumValues)[number];

/** What an account is in one workspace: a team role, a client relationship, both or neither. */
export interface Place {
  readonly teamRole?: TeamRole;
  /** The account's own client record in the workspace. */
  readonly clientId?: string;
}

/** How a workspace request runs: as a team member (any client rows are the workspace's), or as a client (own records only). */
export type ActingAs = 'team' | 'client';

export interface TenantContext {
  readonly accountId: string;
  /** The workspaces this transaction may touch. One for a workspace route, the account's own for an account route. */
  readonly workspaceIds: readonly string[];
  /**
   * The account's team role in the workspace (workspace route), if it has one. Like `clientId`,
   * it describes the caller's place, not the hat worn for this request: an account can have
   * both. Handlers and repositories branch on `actingAs` for which one applies.
   */
  readonly teamRole?: TeamRole;
  /** The account's client id in the workspace (workspace route), if it has one. See `teamRole`. */
  readonly clientId?: string;
  /**
   * Workspace route only: the hat worn for this request. The one to branch on, not `teamRole` or
   * `clientId`. As a client the database context names `clientId` too (Q2).
   */
  readonly actingAs?: ActingAs;
}

declare const tenantScopeBrand: unique symbol;

/** A request's tenant context. What every repository function takes. */
export interface TenantScope {
  readonly [tenantScopeBrand]: true;
  readonly context: TenantContext;
}

/** The scope of a workspace route: exactly one workspace. */
export interface WorkspaceScope extends TenantScope {
  readonly workspaceId: string;
  readonly actingAs: ActingAs;
}

const executors = new WeakMap<TenantScope, DatabaseExecutor>();

/** The transaction behind a scope. For the repositories of this package only. */
export function executorOf(scope: TenantScope): DatabaseExecutor {
  const executor = executors.get(scope);
  if (!executor) throw new Error('Not a tenant scope.');
  return executor;
}

function openScope<S extends TenantScope>(
  tx: DatabaseExecutor,
  scope: Omit<S, typeof tenantScopeBrand>,
): S {
  const frozen = Object.freeze({ ...scope }) as unknown as S;
  executors.set(frozen, tx);
  return frozen;
}

/**
 * Sets the three context settings in one statement, replacing whatever was set before. An empty
 * string means unset (the context functions read it as NULL, which matches no row).
 */
async function setContext(
  tx: DatabaseExecutor,
  context: { accountId: string; workspaceIds: readonly string[]; clientId?: string },
): Promise<void> {
  await tx.execute(
    sql`select set_config('app.account_id', ${context.accountId}, true),
               set_config('app.workspace_ids', ${context.workspaceIds.join(',')}, true),
               set_config('app.client_id', ${context.clientId ?? ''}, true)`,
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AccountScopeInput {
  readonly accountId: string;
  /** Which workspaces the context holds: where the account has a team role, a client relationship, or either. */
  readonly workspaces: 'team' | 'client' | 'any';
}

export interface WorkspaceScopeInput {
  readonly accountId: string;
  readonly workspaceId: string;
  /**
   * Decides from the account's place whether the route runs and as what: `'team'`, `'client'`, or
   * `undefined` for a place the route's access doesn't allow. Called only for an account that
   * has a place; the workspace is set in the context only after it allows.
   */
  readonly admit: (place: Place) => ActingAs | undefined;
}

/**
 * How a workspace request ended before it ran: `no-place` (the account is neither team member nor
 * client there, or the workspace doesn't exist: the same answer) or `refused` (it has a place the
 * route doesn't allow). In both the workspace was never set in a context.
 */
export type WorkspaceEntry<T> =
  | { readonly status: 'no-place' }
  | { readonly status: 'refused' }
  | { readonly status: 'entered'; readonly value: T };

/** Opens request transactions with a tenant scope. `apps/web` creates it over the app's database. */
export interface TenantScopes {
  /** An account route: the context holds the workspaces where the account has the asked relationship. */
  inAccountScope<T>(input: AccountScopeInput, run: (scope: TenantScope) => Promise<T>): Promise<T>;
  /**
   * A workspace route: looks up the account's own place in the workspace (the core tables let an
   * account read its own rows), asks `admit`, and only then sets the workspace in the context and
   * runs. The transaction commits when `run` returns and rolls back when it throws.
   */
  inWorkspaceScope<T>(
    input: WorkspaceScopeInput,
    run: (scope: WorkspaceScope) => Promise<T>,
  ): Promise<WorkspaceEntry<T>>;
}

/** The request-transaction openers over `database` (called per request, so it may be lazy). */
export function createTenantScopes(database: () => DatabaseExecutor): TenantScopes {
  return {
    inAccountScope: (input, run) => inAccountScope(database(), input, run),
    inWorkspaceScope: (input, run) => inWorkspaceScope(database(), input, run),
  };
}

function inAccountScope<T>(
  db: DatabaseExecutor,
  input: AccountScopeInput,
  run: (scope: TenantScope) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // First only the account: that is what lets the lookup read its own rows.
    await setContext(tx, { accountId: input.accountId, workspaceIds: [] });
    const workspaceIds = await findWorkspaceIdsOf(tx, input.accountId, input.workspaces);
    await setContext(tx, { accountId: input.accountId, workspaceIds });
    return run(
      openScope<TenantScope>(tx, { context: { accountId: input.accountId, workspaceIds } }),
    );
  });
}

function inWorkspaceScope<T>(
  db: DatabaseExecutor,
  input: WorkspaceScopeInput,
  run: (scope: WorkspaceScope) => Promise<T>,
): Promise<WorkspaceEntry<T>> {
  // Not an id: no such workspace, and the database is never asked (it would fail on the cast).
  if (!UUID.test(input.workspaceId)) return Promise.resolve({ status: 'no-place' });
  return db.transaction(async (tx): Promise<WorkspaceEntry<T>> => {
    await setContext(tx, { accountId: input.accountId, workspaceIds: [] });
    const place = await findPlace(tx, input.accountId, input.workspaceId);
    if (!place.teamRole && !place.clientId) return { status: 'no-place' };
    const actingAs = input.admit(place);
    if (!actingAs) return { status: 'refused' };
    // Acting as a client names the client, which narrows client tables to their own rows (Q2);
    // as a team member it stays unset, so a trainer who is also a client sees what any trainer sees.
    const clientId = actingAs === 'client' ? place.clientId : undefined;
    await setContext(tx, {
      accountId: input.accountId,
      workspaceIds: [input.workspaceId],
      clientId,
    });
    const scope = openScope<WorkspaceScope>(tx, {
      workspaceId: input.workspaceId,
      actingAs,
      context: {
        accountId: input.accountId,
        workspaceIds: [input.workspaceId],
        ...(place.teamRole ? { teamRole: place.teamRole } : {}),
        ...(place.clientId ? { clientId: place.clientId } : {}),
        actingAs,
      },
    });
    return { status: 'entered', value: await run(scope) };
  });
}
