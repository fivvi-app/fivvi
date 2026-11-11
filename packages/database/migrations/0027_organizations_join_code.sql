-- F029 (#898): the join link's code and renewal time. Adding the column with the volatile default
-- `new_join_code()` evaluates it once per row, so this is also the data migration: every workspace
-- that exists before the column gets its own code (an empty database does nothing), and a new
-- workspace gets one from the same default. Not renewed yet: `join_link_renewed_at` stays empty.
ALTER TABLE "organizations" ADD COLUMN "join_code" text DEFAULT new_join_code() NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "join_link_renewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_join_code_unique" UNIQUE("join_code");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_join_code_format" CHECK ("organizations"."join_code" ~ '^[0-9A-HJKMNP-TV-Z]{8}$');