import { and, lte, ne, or } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import {
  accessLog,
  authRateLimits,
  authSessions,
  authVerifications,
  deletionLog,
  trainerInvitations,
} from '../schema/index.ts';

// The deletes of the daily retention tasks (E014, ticket #1181; `retention-policy.md` §2). Each
// takes the cutoff the domain computed from the period (`retentionCutoff`, a row that started at
// or before it is past its boundary) and deletes exactly those rows, in one statement, so a
// second run finds nothing. For the cron role's connection: its table privileges and its policies
// let it find and delete these rows and do nothing else with them. Rows of a workspace come back
// as `{ id, workspaceId }`, so the task can write the deletion log; nothing else of a row leaves.

/** A deleted row of a workspace's table: IDs only, the log's input. */
export interface DeletedRow {
  readonly id: string;
  readonly workspaceId: string;
}

/** R2: sign-in codes and links that expired at or before the cutoff. Returns how many. */
export async function deleteSignInTokens(db: DatabaseExecutor, cutoff: Date): Promise<number> {
  const rows = await db
    .delete(authVerifications)
    .where(lte(authVerifications.expiresAt, cutoff))
    .returning({ id: authVerifications.id });
  return rows.length;
}

/**
 * R10 (Q26): sign-in sessions that have expired and were last used at or before the cutoff.
 * `updated_at` is the last use. A session that has not expired stays, however long it was unused.
 */
export async function deleteExpiredSessions(
  db: DatabaseExecutor,
  now: Date,
  lastUsedCutoff: Date,
): Promise<number> {
  const rows = await db
    .delete(authSessions)
    .where(and(lte(authSessions.expiresAt, now), lte(authSessions.updatedAt, lastUsedCutoff)))
    .returning({ id: authSessions.id });
  return rows.length;
}

/** R14: rate-limit rows last written at or before the cutoff. Returns how many. */
export async function deleteOldRateLimits(db: DatabaseExecutor, cutoff: Date): Promise<number> {
  const rows = await db
    .delete(authRateLimits)
    .where(lte(authRateLimits.updatedAt, cutoff))
    .returning({ id: authRateLimits.id });
  return rows.length;
}

/**
 * R3: trainer invitations that were closed at or before the cutoff. An invitation closes when it
 * expires, or when it is accepted, declined or withdrawn, whichever comes first; a closed
 * invitation does not change again, so its `updated_at` is the day it closed.
 */
export async function deleteClosedInvitations(
  db: DatabaseExecutor,
  cutoff: Date,
): Promise<DeletedRow[]> {
  const rows = await db
    .delete(trainerInvitations)
    .where(
      or(
        lte(trainerInvitations.expiresAt, cutoff),
        and(ne(trainerInvitations.status, 'pending'), lte(trainerInvitations.updatedAt, cutoff)),
      ),
    )
    .returning({ id: trainerInvitations.id, workspaceId: trainerInvitations.organizationId });
  return rows;
}

/** R12: access-log entries written at or before the cutoff, of every workspace. */
export function deleteOldAccessLogEntries(
  db: DatabaseExecutor,
  cutoff: Date,
): Promise<DeletedRow[]> {
  return db
    .delete(accessLog)
    .where(lte(accessLog.occurredAt, cutoff))
    .returning({ id: accessLog.id, workspaceId: accessLog.organizationId });
}

/** §3.5: deletion-log entries written at or before the cutoff. Returns how many. */
export async function deleteOldDeletionLogEntries(
  db: DatabaseExecutor,
  cutoff: Date,
): Promise<number> {
  const rows = await db
    .delete(deletionLog)
    .where(lte(deletionLog.deletedAt, cutoff))
    .returning({ id: deletionLog.id });
  return rows.length;
}
