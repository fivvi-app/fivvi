import { and, eq } from 'drizzle-orm';
import { clients } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The clients of a workspace, through a tenant scope. Each function names the scope's workspace
// itself (barrier 1) and, for a scope that acts as a client, the client's own record only
// (Q2); RLS says the same underneath (barrier 2). Another workspace's or another client's
// record is simply not there.

export interface ClientView {
  readonly id: string;
  readonly workspaceId: string;
  readonly accountId: string | null;
}

const columns = {
  id: clients.id,
  workspaceId: clients.organizationId,
  accountId: clients.accountId,
};

function visibleTo(scope: WorkspaceScope) {
  const inWorkspace = eq(clients.organizationId, scope.workspaceId);
  // A client route sees one client only. Without a client id there is nothing to see.
  return scope.actingAs === 'client'
    ? and(inWorkspace, eq(clients.id, scope.context.clientId ?? ''))
    : inWorkspace;
}

/** The clients the scope may see: all of the workspace's for a team member, the caller's own as a client. */
export function listClients(scope: WorkspaceScope): Promise<ClientView[]> {
  return executorOf(scope)
    .select(columns)
    .from(clients)
    .where(visibleTo(scope))
    .orderBy(clients.id);
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

/** Adds a client to the scope's workspace, never another. A client route can't add clients (RLS refuses it). */
export async function createClient(
  scope: WorkspaceScope,
  input: { accountId?: string },
): Promise<ClientView> {
  const [row] = await executorOf(scope)
    .insert(clients)
    .values({ organizationId: scope.workspaceId, accountId: input.accountId ?? null })
    .returning(columns);
  if (!row) throw new Error('The client was not created.');
  return row;
}
