import { and, count, desc, eq, sql } from 'drizzle-orm';
import {
  accessLog,
  type accessLogAction,
  authUsers,
  clients,
  teamMembers,
} from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The access log of a workspace, through a workspace scope (E014, ticket #1173; spec #477). The
// rules (the closed list of actions, who may act without a team member, which action names a
// client or an object) are in `packages/domain/src/privacy/access-log.ts`, which also defines the
// `AccessLogStore` port that `accessLogStore` implements; the table repeats the ones it can. Each
// function names the scope's workspace itself (barrier 1); RLS says the same underneath (barrier 2).
// The entries hold IDs and a time and nothing else; the names are looked up when the log is read.

export type AccessLogActionName = (typeof accessLogAction.enumValues)[number];

/** An entry as the domain writer hands it over: IDs, the action and the time. */
export interface AccessLogEntryRecord {
  readonly action: AccessLogActionName;
  readonly actorTeamMemberId: string | null;
  readonly subjectClientId: string | null;
  readonly objectId: string | null;
  readonly occurredAt: Date;
}

/** Adds an entry to the scope's workspace. */
export async function appendAccessLog(
  scope: WorkspaceScope,
  entry: AccessLogEntryRecord,
): Promise<void> {
  await executorOf(scope).insert(accessLog).values({
    organizationId: scope.workspaceId,
    actorTeamMemberId: entry.actorTeamMemberId,
    action: entry.action,
    subjectClientId: entry.subjectClientId,
    objectId: entry.objectId,
    occurredAt: entry.occurredAt,
  });
}

/** The scope's access log as the domain's `AccessLogStore` port. */
export function accessLogStore(scope: WorkspaceScope) {
  return { append: (entry: AccessLogEntryRecord) => appendAccessLog(scope, entry) };
}

/**
 * One entry of the Owner's list, the names resolved now. `actorName` is the team member's name (the
 * address when they have given none), `null` when the entry has no team member (the daily cleanup)
 * or the team member has left the team; `clientName` is the client's name, `null` when the entry is
 * about no client (`clientId` is `null` too) or the client is gone (`clientId` stays, so the list can
 * still be filtered by it). No other field: no free text exists to show.
 */
export interface AccessLogItem {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: AccessLogActionName;
  readonly actorTeamMemberId: string | null;
  readonly actorName: string | null;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly objectId: string | null;
}

export interface AccessLogPage {
  readonly items: AccessLogItem[];
  /** How many entries match, over all pages. */
  readonly total: number;
}

export interface AccessLogQuery {
  readonly clientId?: string;
  readonly action?: AccessLogActionName;
  readonly limit: number;
  readonly offset: number;
}

/**
 * One page of the scope's workspace's log, newest first (entries of one moment by their ID, so
 * the order is stable), optionally of one client and one action. The client's and the team
 * member's names are joined in at read time and come back `null` when the row is gone.
 */
export async function listAccessLog(
  scope: WorkspaceScope,
  query: AccessLogQuery,
): Promise<AccessLogPage> {
  const db = executorOf(scope);
  const where = and(
    eq(accessLog.organizationId, scope.workspaceId),
    query.clientId ? eq(accessLog.subjectClientId, query.clientId) : undefined,
    query.action ? eq(accessLog.action, query.action) : undefined,
  );
  const [items, [counted]] = await Promise.all([
    db
      .select({
        id: accessLog.id,
        occurredAt: accessLog.occurredAt,
        action: accessLog.action,
        actorTeamMemberId: accessLog.actorTeamMemberId,
        actorName: sql<
          string | null
        >`coalesce(nullif(btrim(${authUsers.name}), ''), ${authUsers.email})`,
        clientId: accessLog.subjectClientId,
        clientName: clients.name,
        objectId: accessLog.objectId,
      })
      .from(accessLog)
      .leftJoin(
        teamMembers,
        and(
          eq(teamMembers.organizationId, accessLog.organizationId),
          eq(teamMembers.id, accessLog.actorTeamMemberId),
        ),
      )
      .leftJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
      .leftJoin(
        clients,
        and(
          eq(clients.organizationId, accessLog.organizationId),
          eq(clients.id, accessLog.subjectClientId),
        ),
      )
      .where(where)
      .orderBy(desc(accessLog.occurredAt), desc(accessLog.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(accessLog).where(where),
  ]);
  return { items, total: counted?.total ?? 0 };
}
