import { sql } from 'drizzle-orm';
import type { Database, DatabaseExecutor } from './client.ts';

// The database side of the restore drill (E016, spec #479): markers that prove a restore went to
// the chosen point in time, and row counts that compare a restored database with its source. The
// drill script reaches it through `src/scripts/restore.ts`, the one file on the privileged
// allow-list for the reason `restore`. Nothing here selects a column of a business table: the
// markers are the drill's own rows, the counts are `count(*)`, and the names come from the catalog.

/** The drill table, owned by the privileged role. Created by the first marker, dropped by `removeDrill`. */
export const DRILL_TABLE = 'restore_drill_markers';

export type MarkerKind = 'before' | 'after';

export const MARKER_KINDS: readonly MarkerKind[] = ['before', 'after'];

export interface MarkerReport {
  /** The marker written before the point is in the database (it should be). */
  before: boolean;
  /** The marker written after the point is in the database (it should not be). */
  after: boolean;
  /** `before` and not `after`: the restore went to the chosen point. */
  ok: boolean;
}

/**
 * Writes the marker `kind` into the drill table, creating the table first. `point` is the chosen
 * point in time the marker is for; the row also holds the database's own clock. Writing a kind
 * again replaces its row.
 */
export async function writeMarker(db: Database, kind: MarkerKind, point: Date): Promise<void> {
  if (!MARKER_KINDS.includes(kind)) throw new Error('A marker is "before" or "after".');
  await db.execute(sql`
    create table if not exists ${sql.identifier(DRILL_TABLE)} (
      kind text primary key check (kind in ('before', 'after')),
      point timestamptz not null,
      written_at timestamptz not null default now()
    )`);
  await db.execute(sql`
    insert into ${sql.identifier(DRILL_TABLE)} (kind, point) values (${kind}, ${point.toISOString()}::timestamptz)
    on conflict (kind) do update set point = excluded.point, written_at = now()`);
}

/** Which markers a database holds. A database without the drill table holds neither. */
export async function checkMarkers(db: Database): Promise<MarkerReport> {
  const exists = await db.execute<{ found: boolean }>(
    sql`select to_regclass(${`public.${DRILL_TABLE}`}) is not null as found`,
  );
  if (!exists.rows[0]?.found) return { before: false, after: false, ok: false };
  const { rows } = await db.execute<{ kind: string }>(
    sql`select kind from ${sql.identifier(DRILL_TABLE)}`,
  );
  const kinds = new Set(rows.map((row) => row.kind));
  const before = kinds.has('before');
  const after = kinds.has('after');
  return { before, after, ok: before && !after };
}

/** Drops the drill table with its markers. Returns whether there was one. */
export async function removeDrill(db: Database): Promise<boolean> {
  const exists = await db.execute<{ found: boolean }>(
    sql`select to_regclass(${`public.${DRILL_TABLE}`}) is not null as found`,
  );
  await db.execute(sql`drop table if exists ${sql.identifier(DRILL_TABLE)}`);
  return exists.rows[0]?.found === true;
}

export interface TableCount {
  /** `schema.table`. */
  table: string;
  rows: number;
  /**
   * Rows that were created or changed after the point (`created_at` or `updated_at` later than
   * it), 0 for a table without those columns. Only read from the source.
   */
  changedAfter: number;
}

/**
 * What a connection needs to count every row: a superuser or a role with `BYPASSRLS`. The tables
 * force row-level security, so for any other role `count(*)` would silently count the rows the
 * policies allow (none), and a restore would look empty.
 */
async function assertSeesEveryRow(db: DatabaseExecutor): Promise<void> {
  const { rows } = await db.execute<{ sees_all: boolean }>(
    sql`select (rolsuper or rolbypassrls) as sees_all from pg_roles where rolname = current_user`,
  );
  if (rows[0]?.sees_all !== true) {
    throw new Error(
      'The connection cannot count every row: its role is neither a superuser nor BYPASSRLS, so row-level security would hide rows.',
    );
  }
}

/**
 * The row count of every table of the database, from the catalog (`information_schema`), except
 * the drill table. `at` also counts the rows changed after that point. Reads in one
 * repeatable-read, read-only transaction, so the counts are of one moment.
 */
export async function countTables(db: Database, at?: Date): Promise<TableCount[]> {
  return db.transaction(
    async (tx) => {
      await assertSeesEveryRow(tx);
      const tables = await tx.execute<{ table_schema: string; table_name: string }>(sql`
        select table_schema, table_name from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema not in ('pg_catalog', 'information_schema')
          and table_schema not like 'pg\\_toast%'
          and not (table_schema = 'public' and table_name = ${DRILL_TABLE})
        order by table_schema, table_name`);
      const counts: TableCount[] = [];
      for (const { table_schema: schema, table_name: name } of tables.rows) {
        const target = sql`${sql.identifier(schema)}.${sql.identifier(name)}`;
        const total = await tx.execute<{ n: string }>(
          sql`select count(*)::text as n from ${target}`,
        );
        let changedAfter = 0;
        if (at) {
          const columns = await tx.execute<{ column_name: string }>(sql`
            select column_name from information_schema.columns
            where table_schema = ${schema} and table_name = ${name}
              and column_name in ('created_at', 'updated_at')
              and data_type = 'timestamp with time zone'`);
          if (columns.rows.length > 0) {
            const stamp = sql`${at.toISOString()}::timestamptz`;
            const later = sql.join(
              columns.rows.map((column) => sql`${sql.identifier(column.column_name)} > ${stamp}`),
              sql` or `,
            );
            const changed = await tx.execute<{ n: string }>(
              sql`select count(*)::text as n from ${target} where ${later}`,
            );
            changedAfter = Number(changed.rows[0]?.n ?? 0);
          }
        }
        counts.push({
          table: `${schema}.${name}`,
          rows: Number(total.rows[0]?.n ?? 0),
          changedAfter,
        });
      }
      return counts;
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

export type CountStatus =
  /** The same count. */
  | 'match'
  /** Fewer or more rows, by no more than the rows changed after the point. */
  | 'within-changes'
  /** The counts differ by more than the rows changed after the point. */
  | 'differs'
  | 'missing-in-restored'
  | 'missing-in-source';

export interface CountComparison {
  table: string;
  source: number | undefined;
  restored: number | undefined;
  changedAfter: number;
  status: CountStatus;
}

/**
 * Compares the counts of the source (taken now, with the rows changed after the point) with the
 * counts of the database restored to that point. A table passes when its counts are equal, or
 * differ by no more than the source's rows changed after the point: those are the rows a restore
 * to the point cannot have.
 */
export function compareCounts(
  source: readonly TableCount[],
  restored: readonly TableCount[],
): CountComparison[] {
  const fromSource = new Map(source.map((entry) => [entry.table, entry]));
  const fromRestored = new Map(restored.map((entry) => [entry.table, entry]));
  const tables = [...new Set([...fromSource.keys(), ...fromRestored.keys()])].sort();
  return tables.map((table) => {
    const a = fromSource.get(table);
    const b = fromRestored.get(table);
    const changedAfter = a?.changedAfter ?? 0;
    let status: CountStatus;
    if (!a) status = 'missing-in-source';
    else if (!b) status = 'missing-in-restored';
    else if (a.rows === b.rows) status = 'match';
    else if (Math.abs(a.rows - b.rows) <= changedAfter) status = 'within-changes';
    else status = 'differs';
    return { table, source: a?.rows, restored: b?.rows, changedAfter, status };
  });
}

export function countsPass(comparison: readonly CountComparison[]): boolean {
  return comparison.every((entry) => entry.status === 'match' || entry.status === 'within-changes');
}

/** One line per table: names and numbers only. */
export function formatCounts(
  comparison: readonly CountComparison[],
  names: { source: string; restored: string },
): string[] {
  const cell = (value: number | undefined) => (value === undefined ? '-' : String(value));
  return [
    `table | ${names.source} | ${names.restored} | changed after the point | result`,
    ...comparison.map(
      (entry) =>
        `${entry.table} | ${cell(entry.source)} | ${cell(entry.restored)} | ${entry.changedAfter} | ${entry.status}`,
    ),
  ];
}
