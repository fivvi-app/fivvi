import type { BuildExtraConfigColumns } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  type PgColumnBuilderBase,
  type PgTableExtraConfigValue,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id } from './columns.ts';
import { organizations } from './organizations.ts';
import { clientPolicy, ownAccountPolicy, workspacePolicy } from './tenant-policies.ts';

export interface BusinessTableOptions<Column extends string> {
  /**
   * The column that names a client of the workspace (`id` for `clients` itself). A table with one
   * gets the client variant of the policy (Q2): a client route sees and writes only its own rows.
   */
  clientColumn?: Column | 'id';
  /**
   * The column that holds an account. The account may read its own rows in any workspace
   * (`team_members`, `clients`), which is how the API finds out what it is in a workspace.
   */
  accountColumn?: Column;
}

/**
 * Declares a business table (ADR-006). Every table that holds a workspace's data is made with
 * this helper and nothing else gives it `organization_id`, so each one gets, in one place:
 *
 * - `id`, a uuid primary key, and `organization_id`, a non-null reference to `organizations`;
 * - an index that starts with `organization_id`;
 * - `unique (organization_id, id)`, so other business tables can point at a row with a composite
 *   foreign key `(organization_id, <x>_id) -> (organization_id, id)`: a row of workspace A can
 *   then never point at a row of workspace B (AC2, `foreignKey()` from `drizzle-orm/pg-core`);
 * - RLS enabled, and the standard workspace policy for the app role (`tenant-policies.ts`), plus
 *   the client and own-account variants when the options ask for them.
 *
 * RLS is also *forced* for every table, which Drizzle can't express: add
 * `ALTER TABLE … FORCE ROW LEVEL SECURITY` in a custom migration with the table's migration
 * (`pnpm db:generate --custom`). The conventions check in the integration test fails until you do.
 */
export function businessTable<
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
>(
  name: TName,
  columns: TColumns,
  extraConfig?: (
    self: BuildExtraConfigColumns<TName, TColumns & TenantColumns, 'pg'>,
  ) => PgTableExtraConfigValue[],
  options: BusinessTableOptions<Extract<keyof TColumns, string>> = {},
) {
  const table = pgTable(
    name,
    {
      id: id(),
      organizationId: uuid('organization_id')
        .notNull()
        .references(() => organizations.id),
      ...columns,
    },
    (self) => {
      const column = (key: string) =>
        (self as unknown as Record<string, AnyPgColumn>)[key] as AnyPgColumn;
      return [
        index(`${name}_organization_id_idx`).on(self.organizationId),
        unique(`${name}_organization_id_id_unique`).on(self.organizationId, self.id),
        workspacePolicy(name, self.organizationId),
        ...(options.clientColumn ? [clientPolicy(name, column(options.clientColumn))] : []),
        ...(options.accountColumn ? [ownAccountPolicy(name, column(options.accountColumn))] : []),
        ...(extraConfig?.(self as never) ?? []),
      ];
    },
  );
  return table;
}

type TenantColumns = {
  id: ReturnType<typeof id>;
  organizationId: ReturnType<ReturnType<typeof uuid>['notNull']>;
};
