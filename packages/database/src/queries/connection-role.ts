import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';

export interface ConnectionRoleReport {
  /** The role the connection logged in as (`session_user`). A role name is not a secret. */
  role: string;
  /**
   * What breaks the app role's guarantees (AC4), each a short sentence for a start-up error.
   * Empty for a role that RLS fully applies to.
   */
  problems: string[];
}

interface RoleRow extends Record<string, unknown> {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolreplication: boolean;
  owned_tables: number;
  member_of: string[];
}

/**
 * Reads what the connection's login role may do and lists everything that breaks AC4: a
 * superuser or a role with `BYPASSRLS` ignores every policy; a role that owns a table is exempt
 * from RLS unless forced, and can change the policies; a role that can create roles or
 * databases, or replicate, can make itself more; a member of another role (the privileged role
 * above all) can `SET ROLE` to it. Only `fivvi_app`, as the release step configures it
 * (`ensureAppRole`), passes. The API refuses to start with a role that does not (`startup.ts`).
 */
export async function inspectConnectionRole(db: DatabaseExecutor): Promise<ConnectionRoleReport> {
  const { rows } = await db.execute<RoleRow>(
    sql`select r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
               r.rolreplication,
               (select count(*)::int
                  from pg_class c
                  join pg_namespace n on n.oid = c.relnamespace
                 where c.relowner = r.oid
                   and c.relkind in ('r', 'p', 'v', 'm', 'f')
                   and n.nspname not in ('pg_catalog', 'information_schema')
                   and n.nspname not like 'pg\_toast%') as owned_tables,
               coalesce(
                 (select array_agg(p.rolname::text order by p.rolname)
                    from pg_auth_members m
                    join pg_roles p on p.oid = m.roleid
                   where m.member = r.oid),
                 '{}'::text[]) as member_of
          from pg_roles r
         where r.rolname = session_user`,
  );
  const [row] = rows;
  if (!row) throw new Error('The connection role is not in pg_roles.');
  const problems: string[] = [];
  if (row.rolsuper) problems.push('it is a superuser, so RLS does not apply to it');
  if (row.rolbypassrls) problems.push('it has BYPASSRLS, so RLS does not apply to it');
  if (row.owned_tables > 0) {
    problems.push('it owns a table, so RLS does not bind it and it can change the policies');
  }
  if (row.member_of.length) {
    problems.push(
      `it is a member of ${row.member_of.map((name) => `"${name}"`).join(', ')}, which it can SET ROLE to`,
    );
  }
  if (row.rolcreaterole) problems.push('it can create roles');
  if (row.rolcreatedb) problems.push('it can create databases');
  if (row.rolreplication) problems.push('it can replicate');
  return { role: row.rolname, problems };
}
