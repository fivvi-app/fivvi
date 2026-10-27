import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../src/index.ts';
import { APP_ROLE } from '../src/schema/index.ts';

/** The workspace table itself: the root of isolation, filtered on `id` instead of `organization_id`. */
export const WORKSPACE_TABLE = 'organizations';

export interface TenancyRules {
  /** Tables in `public` that hold no business data. Each needs a reason (the value). */
  nonBusinessTables: Record<string, string>;
  /** `SECURITY DEFINER` functions that were reviewed, by name (`schema.name` outside `public`). */
  definerFunctions: string[];
  /** Extra permissive policies a business table may have next to the standard one, by table. */
  extraPolicies: Record<string, string[]>;
}

interface TableRow {
  name: string;
  rls: boolean;
  forced: boolean;
  organization_notnull: boolean | null;
  organization_type: string | null;
}

interface ForeignKeyRow {
  name: string;
  source: string;
  target: string;
  source_columns: string[];
  target_columns: string[];
}

interface PolicyRow {
  table_name: string;
  name: string;
  permissive: 'PERMISSIVE' | 'RESTRICTIVE';
  roles: string[];
  cmd: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  qual: string | null;
  with_check: string | null;
}

/** Schemas that hold user objects: not the system catalogs, TOAST or per-session temp schemas. */
const USER_SCHEMA = sql`n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname !~ '^pg_(toast|temp)'`;

/** `name` in `public`, `schema.name` anywhere else. */
function qualified(schema: string, name: string): string {
  return schema === 'public' ? name : `${schema}.${name}`;
}

async function rows<T>(db: DatabaseExecutor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

/** Whitespace and outer parentheses of a deparsed expression do not matter. */
function normalise(expression: string | null): string {
  return (expression ?? '')
    .replace(/\s+/g, ' ')
    .replace(/public\./g, '')
    .replace(/^\((.*)\)$/, '$1')
    .trim();
}

/** The table of clients, and the column of it that names a client. */
export const CLIENT_TABLE = 'clients';

function isClientExpression(expression: string | null, column: string): boolean {
  return normalise(expression) === `(app_client_id() IS NULL) OR (${column} = app_client_id())`;
}

function isWorkspaceExpression(expression: string | null, column: string): boolean {
  return normalise(expression) === `${column} = ANY (app_workspace_ids())`;
}

/**
 * Checks the migrated database against the tenancy conventions of E011 (AC1, AC2) and returns
 * one line per violation, each naming the table (or function) and what is missing. An empty
 * list means the conventions hold.
 *
 * AC1: every table in `public` is the workspace table, on the non-business allow-list, or a
 * business table with a non-null `organization_id` referencing `organizations`, RLS enabled and
 * forced, the standard workspace policy for the app role covering all four commands, and an
 * index that starts with `organization_id`.
 *
 * AC20: a business table with a client column (`client_id`, a foreign key to `clients`, or `id`
 * of `clients` itself) also has the client policy for the app role: restrictive, covering all
 * commands, USING and WITH CHECK, so a client route sees and writes only its own client's rows.
 *
 * AC2: foreign keys between business tables include `organization_id` on both sides; a view on
 * a business table is `security_invoker`; a `SECURITY DEFINER` function is on the reviewed list.
 * Views and functions are looked for in every schema except the system ones, and objects that
 * belong to an extension are skipped.
 */
export async function findTenancyViolations(
  db: DatabaseExecutor,
  rules: TenancyRules,
): Promise<string[]> {
  const violations: string[] = [];

  const tables = await rows<TableRow>(
    db,
    sql`select c.relname as name,
               c.relrowsecurity as rls,
               c.relforcerowsecurity as forced,
               a.attnotnull as organization_notnull,
               format_type(a.atttypid, a.atttypmod) as organization_type
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_attribute a
          on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
  );
  const names = tables.map((table) => table.name);

  for (const name of Object.keys(rules.nonBusinessTables)) {
    if (!names.includes(name)) {
      violations.push(`${name}: on the non-business allow-list but not a table`);
    }
  }
  if (!names.includes(WORKSPACE_TABLE)) {
    violations.push(`${WORKSPACE_TABLE}: the workspace table does not exist`);
  }

  const business = tables.filter(
    (table) => table.name !== WORKSPACE_TABLE && !(table.name in rules.nonBusinessTables),
  );
  const rooted = [...business, ...tables.filter((table) => table.name === WORKSPACE_TABLE)];
  const businessNames = new Set(business.map((table) => table.name));

  const foreignKeys = await rows<ForeignKeyRow>(
    db,
    sql`select con.conname as name, src.relname as source, dst.relname as target,
               (select array_agg(a.attname::text order by k.ord)
                from unnest(con.conkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
               ) as source_columns,
               (select array_agg(a.attname::text order by k.ord)
                from unnest(con.confkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum
               ) as target_columns
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_class dst on dst.oid = con.confrelid
        join pg_namespace n on n.oid = src.relnamespace
        where con.contype = 'f' and n.nspname = 'public'`,
  );
  const indexes = await rows<{ table_name: string; first_column: string }>(
    db,
    sql`select t.relname as table_name, a.attname::text as first_column
        from pg_index i
        join pg_class t on t.oid = i.indrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_attribute a on a.attrelid = t.oid and a.attnum = i.indkey[0]
        where n.nspname = 'public' and i.indisvalid and i.indpred is null and i.indexprs is null`,
  );
  const clientIdColumns = new Set(
    (
      await rows<{ table_name: string }>(
        db,
        sql`select c.relname as table_name
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and a.attname = 'client_id' and not a.attisdropped
              and a.attnum > 0`,
      )
    ).map((row) => row.table_name),
  );
  const policies = await rows<PolicyRow>(
    db,
    sql`select tablename as table_name, policyname as name, permissive, roles::text[] as roles,
               cmd, qual, with_check
        from pg_policies where schemaname = 'public'`,
  );

  for (const table of rooted) {
    const isWorkspace = table.name === WORKSPACE_TABLE;
    const scopeColumn = isWorkspace ? 'id' : 'organization_id';

    if (!isWorkspace) {
      if (table.organization_type === null) {
        violations.push(`${table.name}: missing organization_id column`);
      } else {
        if (table.organization_type !== 'uuid' || !table.organization_notnull) {
          violations.push(`${table.name}: organization_id must be a non-null uuid`);
        }
        const referencesWorkspace = foreignKeys.some(
          (fk) =>
            fk.source === table.name &&
            fk.target === WORKSPACE_TABLE &&
            fk.source_columns.length === 1 &&
            fk.source_columns[0] === 'organization_id' &&
            fk.target_columns[0] === 'id',
        );
        if (!referencesWorkspace) {
          violations.push(`${table.name}: organization_id does not reference ${WORKSPACE_TABLE}`);
        }
      }
      const hasIndex = indexes.some(
        (index) => index.table_name === table.name && index.first_column === 'organization_id',
      );
      if (!hasIndex) {
        violations.push(`${table.name}: missing an index that starts with organization_id`);
      }
    }

    if (!table.rls) violations.push(`${table.name}: row-level security is not enabled`);
    if (!table.forced) violations.push(`${table.name}: row-level security is not forced`);

    const own = policies.filter((policy) => policy.table_name === table.name);
    const permissive = own.filter((policy) => policy.permissive === 'PERMISSIVE');
    const forAppRole = (policy: PolicyRow) =>
      policy.roles.length === 1 && policy.roles[0] === APP_ROLE;
    const standard = permissive.filter(forAppRole);
    const reads = (command: PolicyRow['cmd']) =>
      standard.some(
        (policy) =>
          (policy.cmd === 'ALL' || policy.cmd === command) &&
          isWorkspaceExpression(policy.qual, scopeColumn),
      );
    const writes = (command: PolicyRow['cmd']) =>
      standard.some(
        (policy) =>
          (policy.cmd === 'ALL' || policy.cmd === command) &&
          isWorkspaceExpression(policy.with_check, scopeColumn),
      );
    const missing = [
      ...(['SELECT', 'UPDATE', 'DELETE'] as const).filter((command) => !reads(command)),
      ...(['INSERT', 'UPDATE'] as const).filter((command) => !writes(command)),
    ];
    if (missing.length > 0) {
      const detail = [...new Set(missing)].join(', ');
      violations.push(
        `${table.name}: missing the workspace policy for ${APP_ROLE} (${scopeColumn} in the context's workspaces, USING and WITH CHECK) on ${detail}`,
      );
    }

    // A table with a client column narrows the workspace policy to the context's client (Q2).
    const clientColumns = new Set<string>();
    if (table.name === CLIENT_TABLE) clientColumns.add('id');
    if (clientIdColumns.has(table.name)) clientColumns.add('client_id');
    for (const fk of foreignKeys) {
      if (fk.source !== table.name || fk.target !== CLIENT_TABLE) continue;
      fk.target_columns.forEach((target, position) => {
        const source = fk.source_columns[position];
        if (target === 'id' && source) clientColumns.add(source);
      });
    }
    for (const column of clientColumns) {
      const hasClientPolicy = own.some(
        (policy) =>
          policy.permissive === 'RESTRICTIVE' &&
          forAppRole(policy) &&
          policy.cmd === 'ALL' &&
          isClientExpression(policy.qual, column) &&
          isClientExpression(policy.with_check, column),
      );
      if (!hasClientPolicy) {
        violations.push(
          `${table.name}: missing the client policy for ${APP_ROLE} (${column} is the context's client when it names one, USING and WITH CHECK, restrictive, all commands)`,
        );
      }
    }

    // Any other permissive policy widens access, so each one must have been reviewed.
    const allowed = rules.extraPolicies[table.name] ?? [];
    for (const policy of permissive) {
      const isStandard =
        forAppRole(policy) &&
        policy.cmd === 'ALL' &&
        isWorkspaceExpression(policy.qual, scopeColumn) &&
        isWorkspaceExpression(policy.with_check, scopeColumn);
      if (!isStandard && !allowed.includes(policy.name)) {
        violations.push(`${table.name}: unreviewed permissive policy ${policy.name}`);
      }
    }
  }

  for (const fk of foreignKeys) {
    if (!businessNames.has(fk.source) || !businessNames.has(fk.target)) continue;
    const sourcePosition = fk.source_columns.indexOf('organization_id');
    const targetPosition = fk.target_columns.indexOf('organization_id');
    if (sourcePosition === -1 || targetPosition === -1 || sourcePosition !== targetPosition) {
      violations.push(
        `${fk.source}: foreign key ${fk.name} to ${fk.target} must include organization_id on both sides`,
      );
    }
  }

  const views = await rows<{
    schema: string;
    name: string;
    kind: string;
    table_name: string;
    options: string[] | null;
  }>(
    db,
    sql`select distinct n.nspname::text as schema, v.relname as name, v.relkind::text as kind,
               t.relname as table_name, v.reloptions::text[] as options
        from pg_depend d
        join pg_rewrite r on d.classid = 'pg_rewrite'::regclass and r.oid = d.objid
        join pg_class v on v.oid = r.ev_class
        join pg_class t on d.refclassid = 'pg_class'::regclass and t.oid = d.refobjid
        join pg_namespace n on n.oid = v.relnamespace
        join pg_namespace tn on tn.oid = t.relnamespace and tn.nspname = 'public'
        where v.relkind in ('v', 'm') and v.oid <> t.oid
          and ${USER_SCHEMA}
          and not exists (
            select 1 from pg_depend e
            where e.classid = 'pg_class'::regclass and e.objid = v.oid and e.deptype = 'e'
          )`,
  );
  for (const view of views) {
    const label = qualified(view.schema, view.name);
    if (!businessNames.has(view.table_name) && view.table_name !== WORKSPACE_TABLE) continue;
    const invoker = (view.options ?? []).some((option) =>
      /^security_invoker=(true|on|yes|1)$/i.test(option),
    );
    if (view.kind === 'm') {
      violations.push(
        `${label}: a materialized view on ${view.table_name} is not filtered per workspace`,
      );
    } else if (!invoker) {
      violations.push(`${label}: view on ${view.table_name} is not security_invoker`);
    }
  }

  const definers = await rows<{ schema: string; name: string }>(
    db,
    sql`select n.nspname::text as schema, p.proname as name
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where p.prosecdef
          and ${USER_SCHEMA}
          and not exists (
            select 1 from pg_depend e
            where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e'
          )
        order by n.nspname, p.proname`,
  );
  for (const definer of definers) {
    const label = qualified(definer.schema, definer.name);
    if (!rules.definerFunctions.includes(label)) {
      violations.push(`${label}: SECURITY DEFINER function is not on the reviewed list`);
    }
  }

  return violations;
}

/**
 * Every table the RLS suite must cover: the workspace table and each business table, that is
 * every table in `public` that is not on the non-business allow-list.
 */
export async function listIsolatedTables(
  db: DatabaseExecutor,
  rules: Pick<TenancyRules, 'nonBusinessTables'>,
): Promise<string[]> {
  const tables = await rows<{ name: string }>(
    db,
    sql`select tablename as name from pg_tables where schemaname = 'public' order by tablename`,
  );
  return tables.map((table) => table.name).filter((name) => !(name in rules.nonBusinessTables));
}

/**
 * AC15: one line for each table of the RLS suite (`listIsolatedTables`) that has no isolation
 * factory, naming the table. The suite fails on any.
 */
export async function findTablesWithoutIsolationFactory(
  db: DatabaseExecutor,
  rules: Pick<TenancyRules, 'nonBusinessTables'>,
  factories: Readonly<Record<string, unknown>>,
): Promise<string[]> {
  return (await listIsolatedTables(db, rules))
    .filter((name) => !(name in factories))
    .map((name) => `${name}: no isolation factory (add it to isolationFactories)`);
}
