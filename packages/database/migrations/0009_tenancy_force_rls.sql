-- Tenant isolation, part 3 (E011, ADR-006): force RLS on every business table. ENABLE alone
-- exempts the table's owner; FORCE makes the owner subject to the policies too, so only a role
-- with BYPASSRLS (or a superuser) can read around them. Drizzle can't express it, so every
-- migration that adds a business table adds its line here or in a migration of its own; the
-- conventions check in the integration test fails for a table without it.
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;
