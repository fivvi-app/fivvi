import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { clients, teamMembers } from '../schema/index.ts';
import type { Place, TenantScope } from '../tenant-scope.ts';
import { executorOf } from '../tenant-scope.ts';

// Where an account is a team member or a client. The first two functions run before a scope
// exists (they are how it is built), on a transaction that holds only the account; the core
// tables let an account read its own rows (`*_own_account` policies), and the queries also name
// the account themselves. Neither is exported from the package.

/** The account's own place in one workspace. */
export async function findPlace(
  tx: DatabaseExecutor,
  accountId: string,
  workspaceId: string,
): Promise<Place> {
  const [team] = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.accountId, accountId), eq(teamMembers.organizationId, workspaceId)))
    .limit(1);
  const [client] = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.accountId, accountId), eq(clients.organizationId, workspaceId)))
    .limit(1);
  return {
    ...(team ? { teamRole: team.role } : {}),
    ...(client ? { clientId: client.id } : {}),
  };
}

/** The workspaces where the account has the relationship asked for. */
export async function findWorkspaceIdsOf(
  tx: DatabaseExecutor,
  accountId: string,
  relationship: 'team' | 'client' | 'any',
): Promise<string[]> {
  const ids = new Set<string>();
  if (relationship !== 'client') {
    const rows = await tx
      .select({ id: teamMembers.organizationId })
      .from(teamMembers)
      .where(eq(teamMembers.accountId, accountId));
    for (const row of rows) ids.add(row.id);
  }
  if (relationship !== 'team') {
    const rows = await tx
      .select({ id: clients.organizationId })
      .from(clients)
      .where(eq(clients.accountId, accountId));
    for (const row of rows) ids.add(row.id);
  }
  return [...ids].sort();
}

export interface WorkspacePlace extends Place {
  readonly workspaceId: string;
}

/**
 * The caller's own places in the workspaces of the scope's context: one entry per workspace
 * where it is a team member, a client or both. An account scope holds only the workspaces the
 * route asked for, so nothing else is listed.
 */
export async function listMyWorkspaces(scope: TenantScope): Promise<WorkspacePlace[]> {
  const db = executorOf(scope);
  const { accountId, workspaceIds } = scope.context;
  if (workspaceIds.length === 0) return [];
  const roles = await db
    .select({ workspaceId: teamMembers.organizationId, role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.accountId, accountId),
        inArray(teamMembers.organizationId, [...workspaceIds]),
      ),
    );
  const memberships = await db
    .select({ workspaceId: clients.organizationId, clientId: clients.id })
    .from(clients)
    .where(
      and(eq(clients.accountId, accountId), inArray(clients.organizationId, [...workspaceIds])),
    );
  return workspaceIds
    .map((workspaceId) => {
      const teamRole = roles.find((row) => row.workspaceId === workspaceId)?.role;
      const clientId = memberships.find((row) => row.workspaceId === workspaceId)?.clientId;
      return {
        workspaceId,
        ...(teamRole ? { teamRole } : {}),
        ...(clientId ? { clientId } : {}),
      };
    })
    .filter((place) => place.teamRole || place.clientId);
}
