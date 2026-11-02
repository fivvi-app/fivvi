-- F006 (#395, spec #174 decision 5): every client has an email address. `email` becomes NOT NULL and
-- the partial unique index a plain one. A client row without an address stops this migration (SET
-- NOT NULL fails): no address is made up. The clients routes have had no screen since they went
-- live, so outside the seed no such row should exist; fix the row, then migrate again.

ALTER TABLE "clients" DROP CONSTRAINT "clients_email_lowercase";--> statement-breakpoint
DROP INDEX "clients_organization_id_email_unique";--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_organization_id_email_unique" ON "clients" USING btree ("organization_id","email");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_email_lowercase" CHECK ("clients"."email" = lower("clients"."email"));