import { sql } from 'drizzle-orm';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The reader of the data export (E014, spec #477, tickets #1177 and #1178), through a workspace
// scope. It is generic on purpose: the privacy registry (`packages/domain`) says which tables and
// columns an export holds, so a later feature's table joins the export by declaring its fields, and
// nothing here names a table. Every query names the scope's workspace itself (barrier 1) and RLS
// says the same underneath (barrier 2). The table and column names come from the registry, are
// checked against the catalog (a name that is not a column of the table fails) and are quoted.

/** How a table's rows are found for one client: her own row, her `client_id`, or the sessions she was in. */
export type ExportClientLink = 'self' | 'client_id' | 'sessions';

export interface ExportRequest {
  readonly table: string;
  readonly fields: readonly string[];
  /** For one client's export: how her rows are found; with `clientId`. Without both: the whole workspace. */
  readonly clientLink?: ExportClientLink;
  readonly clientId?: string;
}

/** A column as exported: `time` for a timestamp, which comes back as a `Date`. */
export interface ExportColumnInfo {
  readonly name: string;
  readonly time: boolean;
}

/** A row by column name: a time is a `Date`, a number column a string or number as the driver gives it. */
export type ExportRow = Record<string, string | number | boolean | null | Date | object>;

const NAME = /^[a-z][a-z0-9_]*$/;
const TIMESTAMP = 'timestamp with time zone';
const UTC_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';
/** How many rows a batch reads: the export is streamed batch by batch, never held whole. */
export const EXPORT_BATCH_SIZE = 1000;

function checkNames(request: ExportRequest): void {
  if (![request.table, ...request.fields].every((name) => NAME.test(name))) {
    throw new Error('An export names a table or a column that is not a plain name.');
  }
}

/** The columns of the request, in its order, with which are times. */
export async function exportColumns(
  scope: WorkspaceScope,
  request: ExportRequest,
): Promise<ExportColumnInfo[]> {
  checkNames(request);
  const { rows } = await executorOf(scope).execute(
    sql`select column_name, data_type from information_schema.columns
        where table_schema = 'public' and table_name = ${request.table}`,
  );
  const types = new Map(
    (rows as { column_name: string; data_type: string }[]).map((row) => [
      row.column_name,
      row.data_type,
    ]),
  );
  return request.fields.map((name) => {
    const type = types.get(name);
    if (type === undefined) throw new Error('An export names a column that the table does not have.');
    return { name, time: type === TIMESTAMP };
  });
}

function whereOf(scope: WorkspaceScope, request: ExportRequest) {
  const own = sql.identifier(request.table === 'organizations' ? 'id' : 'organization_id');
  const clauses = [sql`${own} = ${scope.workspaceId}`];
  if (request.clientLink && request.clientId) {
    const client = request.clientId;
    if (request.clientLink === 'self') clauses.push(sql`"id" = ${client}`);
    else if (request.clientLink === 'client_id') clauses.push(sql`"client_id" = ${client}`);
    else {
      clauses.push(
        sql`"id" in (select "session_id" from "session_participants"
            where "organization_id" = ${scope.workspaceId} and "client_id" = ${client})`,
      );
    }
  }
  return clauses;
}

/** How many rows the export of the table holds for this workspace (and client). */
export async function countExportRows(
  scope: WorkspaceScope,
  request: ExportRequest,
): Promise<number> {
  checkNames(request);
  const { rows } = await executorOf(scope).execute(
    sql`select count(*)::int as n from ${sql.identifier(request.table)} where ${sql.join(whereOf(scope, request), sql` and `)}`,
  );
  return Number((rows[0] as { n: number }).n);
}

/**
 * The rows of the export of one table, in batches by ID (keyset paging: a batch is one query, so
 * memory holds one batch). Only this workspace's rows, and with a client link only hers.
 */
export async function* readExportRows(
  scope: WorkspaceScope,
  request: ExportRequest,
  columns: readonly ExportColumnInfo[],
  batchSize: number = EXPORT_BATCH_SIZE,
): AsyncGenerator<ExportRow[]> {
  checkNames(request);
  const db = executorOf(scope);
  const select = sql.join(
    columns.map((column) =>
      column.time
        ? sql`to_char(${sql.identifier(column.name)} at time zone 'UTC', ${UTC_FORMAT}) as ${sql.identifier(column.name)}`
        : sql`${sql.identifier(column.name)}`,
    ),
    sql`, `,
  );
  let after: string | undefined;
  for (;;) {
    const clauses = [...whereOf(scope, request)];
    if (after !== undefined) clauses.push(sql`"id" > ${after}::uuid`);
    const { rows } = await db.execute(
      sql`select ${select}, "id"::text as "__id" from ${sql.identifier(request.table)}
          where ${sql.join(clauses, sql` and `)} order by "id" limit ${batchSize}`,
    );
    if (rows.length === 0) return;
    const batch = (rows as Record<string, unknown>[]).map((row) => {
      const shaped: ExportRow = {};
      for (const column of columns) {
        const value = row[column.name];
        shaped[column.name] =
          column.time && typeof value === 'string'
            ? new Date(value)
            : (value as ExportRow[string]);
      }
      return shaped;
    });
    yield batch;
    if (rows.length < batchSize) return;
    after = String((rows[rows.length - 1] as Record<string, unknown>).__id);
  }
}
