-- Tenant isolation, part 1 (E011, ADR-006): the app role and the functions that read the
-- request's tenant context. The policies that use them come with the first business tables.

-- The role the app connects as. Created here without a login and without any grant, so a
-- migrated database always has it and the policies below can name it; the release step gives
-- it its password and its table privileges. Roles belong to the server, not to the database:
-- several databases on one server (tests, previews) may run this at the same moment, so a
-- duplicate is not an error.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fivvi_app') THEN
    CREATE ROLE fivvi_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;
END
$$;
--> statement-breakpoint

-- The tenant context is set per transaction by the API with `set_config(name, value, true)`,
-- so it disappears at commit or rollback and can't leak between pooled requests. After the end
-- of a transaction a custom setting reads as an empty string, not NULL: both mean "unset".
-- Every function returns NULL when unset, and a comparison with NULL matches no row, so a
-- query without a context sees nothing (fail closed). They run as their caller (no
-- SECURITY DEFINER) and read only settings.

-- The workspaces this transaction may touch: comma-separated workspace ids.
CREATE FUNCTION app_workspace_ids() RETURNS uuid[]
  LANGUAGE sql STABLE
  AS $$ SELECT string_to_array(nullif(current_setting('app.workspace_ids', true), ''), ',')::uuid[] $$;
--> statement-breakpoint

-- The signed-in account of this transaction.
CREATE FUNCTION app_account_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.account_id', true), '')::uuid $$;
--> statement-breakpoint

-- The client record of this transaction, set only for a route that a client calls for their own
-- records (Q2). Unset for a team route.
CREATE FUNCTION app_client_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.client_id', true), '')::uuid $$;
