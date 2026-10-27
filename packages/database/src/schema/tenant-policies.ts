import { sql } from 'drizzle-orm';
import { type AnyPgColumn, pgPolicy } from 'drizzle-orm/pg-core';

/**
 * The database role the app connects as (ADR-006). It owns nothing and cannot bypass RLS; every
 * standard policy is written for it. The role itself is created by migration `0007` (minimally)
 * and finished by the release step (login, password, table privileges).
 */
export const APP_ROLE = 'fivvi_app';

// The tenant context is set per transaction by the API (`set_config(…, true)`); these SQL
// functions (migration `0007`) read it and return NULL when it is unset, so an unset context
// matches no row.
const workspaceIds = sql`app_workspace_ids()`;
const accountId = sql`app_account_id()`;
const clientId = sql`app_client_id()`;

/**
 * The standard workspace policy: the app role reads and writes only rows of the workspaces in
 * the transaction's context. `WITH CHECK` stops a write from placing or moving a row into
 * another workspace. `column` is `organization_id` of a business table and `id` of
 * `organizations` itself.
 */
export function workspacePolicy(table: string, column: AnyPgColumn) {
  return pgPolicy(`${table}_workspace`, {
    as: 'permissive',
    for: 'all',
    to: APP_ROLE,
    using: sql`${column} = ANY (${workspaceIds})`,
    withCheck: sql`${column} = ANY (${workspaceIds})`,
  });
}

/**
 * The client variant (Q2): when the context comes from a client route (it names a client), a row
 * must also belong to that client. Restrictive, so it narrows the workspace policy and never
 * widens it; a team context names no client and is unaffected.
 */
export function clientPolicy(table: string, column: AnyPgColumn) {
  return pgPolicy(`${table}_client`, {
    as: 'restrictive',
    for: 'all',
    to: APP_ROLE,
    using: sql`${clientId} IS NULL OR ${column} = ${clientId}`,
    withCheck: sql`${clientId} IS NULL OR ${column} = ${clientId}`,
  });
}

/**
 * An account reads its own rows in any workspace. The middleware needs it to find out what the
 * account is in a workspace before it sets the workspace in the context. Read-only: rows are
 * written only within the workspace context.
 */
export function ownAccountPolicy(table: string, column: AnyPgColumn) {
  return pgPolicy(`${table}_own_account`, {
    as: 'permissive',
    for: 'select',
    to: APP_ROLE,
    using: sql`${column} = ${accountId}`,
  });
}
