-- F002 (#277): the workspace's name, URL name, default language and time zone. The columns are NOT NULL
-- without a default: nothing has created a workspace before this migration (E011 added the table, the
-- create route comes with this change), so no row needs a value, and the domain package alone decides
-- the defaults (`WORKSPACE_DEFAULTS`).
ALTER TABLE "organizations" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_locale" text NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "time_zone" text NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_format" CHECK ("organizations"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_name_not_blank" CHECK (btrim("organizations"."name") <> '');--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_default_locale_supported" CHECK ("organizations"."default_locale" IN ('nl-NL', 'en'));