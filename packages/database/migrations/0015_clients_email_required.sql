-- F006 (#395, spec #174 decision 5): every client has an email address. `email` becomes NOT NULL and
-- the partial unique index a plain one. A client row without an address stops this migration (SET
-- NOT NULL fails): no address is made up. The clients routes have had no screen since they went
-- live, so outside the seed no such row should exist; fix the row, then migrate again.
--
-- One exception, the seed's own row: the persistent development environment was seeded with the
-- client "Mark Jansen" of John's Gym (`johns-gym`) without an address; the seed now gives him
-- `mark@example.com`, and the statement below gives that same address to that row, and only to
-- it (that workspace, that name, no address yet). Production is unaffected: the seed never ran
-- there, so the statement matches nothing.
UPDATE "clients" SET "email" = 'mark@example.com'
WHERE "email" IS NULL
  AND "name" = 'Mark Jansen'
  AND "organization_id" IN (SELECT "id" FROM "organizations" WHERE "slug" = 'johns-gym');--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "clients_email_lowercase";--> statement-breakpoint
DROP INDEX "clients_organization_id_email_unique";--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_organization_id_email_unique" ON "clients" USING btree ("organization_id","email");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_email_lowercase" CHECK ("clients"."email" = lower("clients"."email"));