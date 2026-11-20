-- F037 (#955): booking links. `new_booking_link_code()` makes a link's code: 8 characters of lower-case
-- Crockford's base32 (0-9 and a-z without i, l, o and u), from Postgres's CSPRNG (`gen_random_uuid()` is
-- made from `pg_strong_random`). It is the default of `booking_links.code`, so a code is made in one place.
-- A version 4 UUID has fixed bits at byte 6 (the version) and byte 8 (the variant); bytes 0-5 and 10-15
-- are all random. 8 of them (0-5, 10 and 11) each give 5 bits (`& 31`) for one symbol of the 32, so every
-- symbol is equally likely. It reads nothing and runs as its caller, like `new_join_code()` (0026).
-- Hand edits of the generated table: the foreign key booking_links_created_by_fk says
-- ON DELETE SET NULL (created_by_team_member_id), as sessions_created_by_fk does (see 0021): a plain SET
-- NULL would also clear organization_id, which is part of the composite key and not null; the column list
-- (Postgres 15+) clears only the maker, so a link outlives the team member who made it. Drizzle cannot
-- write the list. The expression of the unique index needs the extra parentheses Postgres wants around
-- an expression that is not a function call, and RLS is forced at the end, as the conventions check
-- demands (see 0009, 0013, 0017, 0021 and 0023).
CREATE FUNCTION new_booking_link_code() RETURNS text
  LANGUAGE sql VOLATILE
  AS $$
    SELECT string_agg(
      substr('0123456789abcdefghjkmnpqrstvwxyz', (get_byte(bytes.value, position.index) & 31) + 1, 1),
      '' ORDER BY position.ordinal
    )
    FROM (SELECT decode(replace(gen_random_uuid()::text, '-', ''), 'hex') AS value) AS bytes,
         unnest(ARRAY[0, 1, 2, 3, 4, 5, 10, 11]) WITH ORDINALITY AS position(index, ordinal)
  $$;
--> statement-breakpoint
CREATE TYPE "public"."booking_link_language" AS ENUM('visitor', 'nl', 'en');--> statement-breakpoint
CREATE TYPE "public"."booking_link_scope" AS ENUM('all', 'group', 'class', 'session');--> statement-breakpoint
CREATE TABLE "booking_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text DEFAULT new_booking_link_code() NOT NULL,
	"scope" "booking_link_scope" NOT NULL,
	"group_class_id" uuid,
	"session_id" uuid,
	"language" "booking_link_language" NOT NULL,
	"created_by_team_member_id" uuid,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_links_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "booking_links_code_unique" UNIQUE("code"),
	CONSTRAINT "booking_links_code_format" CHECK ("booking_links"."code" ~ '^[0-9a-hjkmnp-tv-z]{8}$'),
	CONSTRAINT "booking_links_target_matches_scope" CHECK (("booking_links"."scope" = 'class' AND "booking_links"."group_class_id" IS NOT NULL AND "booking_links"."session_id" IS NULL)
        OR ("booking_links"."scope" = 'session' AND "booking_links"."session_id" IS NOT NULL AND "booking_links"."group_class_id" IS NULL)
        OR ("booking_links"."scope" IN ('all', 'group') AND "booking_links"."group_class_id" IS NULL AND "booking_links"."session_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "booking_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_links" ADD CONSTRAINT "booking_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_links" ADD CONSTRAINT "booking_links_group_class_fk" FOREIGN KEY ("organization_id","group_class_id") REFERENCES "public"."group_classes"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_links" ADD CONSTRAINT "booking_links_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_links" ADD CONSTRAINT "booking_links_created_by_fk" FOREIGN KEY ("organization_id","created_by_team_member_id") REFERENCES "public"."team_members"("organization_id","id") ON DELETE SET NULL ("created_by_team_member_id") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_links_active_unique" ON "booking_links" USING btree ("organization_id","scope","language",(coalesce("group_class_id", "session_id", '00000000-0000-0000-0000-000000000000'::uuid))) WHERE "booking_links"."deactivated_at" IS NULL;--> statement-breakpoint
CREATE INDEX "booking_links_organization_id_group_class_id_idx" ON "booking_links" USING btree ("organization_id","group_class_id");--> statement-breakpoint
CREATE INDEX "booking_links_organization_id_session_id_idx" ON "booking_links" USING btree ("organization_id","session_id");--> statement-breakpoint
CREATE POLICY "booking_links_workspace" ON "booking_links" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("booking_links"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("booking_links"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
ALTER TABLE "booking_links" FORCE ROW LEVEL SECURITY;
