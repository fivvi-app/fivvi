-- F006 (#325): the client profile. `name` is NOT NULL without a default: nothing has created a client
-- before this migration (E011 added the table, no route wrote to it), so no row needs a value. The
-- `unaccent` extension (a trusted one, shipped with Postgres) lets the client search ignore accents.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email_locale" text;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_organization_id_email_unique" ON "clients" USING btree ("organization_id","email") WHERE "clients"."email" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_name_valid" CHECK (btrim("clients"."name") <> '' AND char_length("clients"."name") <= 120);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_email_lowercase" CHECK ("clients"."email" IS NULL OR "clients"."email" = lower("clients"."email"));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_email_locale_supported" CHECK ("clients"."email_locale" IS NULL OR "clients"."email_locale" IN ('nl-NL', 'en'));