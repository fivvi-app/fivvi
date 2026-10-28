import { sql } from 'drizzle-orm';
import { executorOf, type TenantScope } from '../tenant-scope.ts';

/** The tenant context as Postgres sees it in the scope's transaction; `null` for what is unset. */
export interface StoredContext {
  accountId: string | null;
  workspaceIds: string[] | null;
  clientId: string | null;
}

/**
 * Reads back what the context functions return in the scope's transaction, so a test can prove
 * what the database holds, not only what the scope object says (E011, AC9). Tests only.
 */
export async function readTenantContext(scope: TenantScope): Promise<StoredContext> {
  const [row] = (
    await executorOf(scope).execute(
      sql`select app_account_id()::text as account, app_workspace_ids()::text[] as workspaces,
                 app_client_id()::text as client`,
    )
  ).rows;
  return {
    accountId: (row?.account as string | null) ?? null,
    workspaceIds: (row?.workspaces as string[] | null) ?? null,
    clientId: (row?.client as string | null) ?? null,
  };
}

/**
 * Every row of a table, read through the scope's transaction with no workspace filter, the way a
 * repository that forgot its filter would. RLS is then the only barrier: the self-test of the
 * isolation suite uses it to show the suite notices when a table has no policy (E011, AC16).
 * Tests only.
 */
export async function selectEverythingInScope(
  scope: TenantScope,
  table: string,
): Promise<Record<string, unknown>[]> {
  const { rows } = await executorOf(scope).execute(
    sql`select to_jsonb(t) as row from ${sql.identifier(table)} t`,
  );
  return (rows as { row: Record<string, unknown> }[]).map((entry) => entry.row);
}
