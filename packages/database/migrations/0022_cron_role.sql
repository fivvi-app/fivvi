-- The cron's database role (E012, ADR-006, ADR-027). Created here without a login and without any
-- grant, so a migrated database always has it; the release step gives it its password
-- (`ensureCronRole`) and `runMigrations` its table privileges (`CRON_TABLE_PRIVILEGES`). Roles
-- belong to the server, not to the database: several databases on one server (tests, previews)
-- may run this at the same moment, so a duplicate is not an error.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fivvi_cron') THEN
    CREATE ROLE fivvi_cron NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;
END
$$;
