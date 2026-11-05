-- Hand edit of the generated file: the foreign keys sessions_trainer_profile_fk and
-- sessions_created_by_fk say ON DELETE SET NULL (<column>). A plain SET NULL would also clear
-- organization_id, which is part of the composite key and not null; the column list (Postgres 15+)
-- clears only the trainer or the creator, so history stays when a trainer's profile or a team
-- member goes. Drizzle cannot write the list.
CREATE TYPE "public"."attendance_status" AS ENUM('booked', 'attended', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('private', 'group', 'open_gym');--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"attendance_status" "attendance_status" DEFAULT 'booked' NOT NULL,
	"agreement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_participants_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "session_participants_session_id_client_id_unique" UNIQUE("session_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "session_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "session_type" NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"trainer_profile_id" uuid,
	"location_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"series_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_team_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "sessions_ends_after_starts" CHECK ("sessions"."ends_at" > "sessions"."starts_at"),
	CONSTRAINT "sessions_capacity_positive" CHECK ("sessions"."capacity" >= 1),
	CONSTRAINT "sessions_version_positive" CHECK ("sessions"."version" >= 1),
	CONSTRAINT "sessions_private_has_capacity_one" CHECK ("sessions"."type" <> 'private' OR "sessions"."capacity" = 1)
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."sessions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_trainer_profile_fk" FOREIGN KEY ("organization_id","trainer_profile_id") REFERENCES "public"."trainer_profiles"("organization_id","id") ON DELETE SET NULL ("trainer_profile_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "public"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_fk" FOREIGN KEY ("organization_id","created_by_team_member_id") REFERENCES "public"."team_members"("organization_id","id") ON DELETE SET NULL ("created_by_team_member_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_participants_organization_id_client_id_idx" ON "session_participants" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "sessions_organization_id_starts_at_idx" ON "sessions" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "sessions_organization_id_trainer_profile_id_starts_at_idx" ON "sessions" USING btree ("organization_id","trainer_profile_id","starts_at");--> statement-breakpoint
CREATE POLICY "session_participants_workspace" ON "session_participants" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("session_participants"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("session_participants"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "session_participants_client" ON "session_participants" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "session_participants"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "session_participants"."client_id" = app_client_id());--> statement-breakpoint
CREATE POLICY "sessions_workspace" ON "sessions" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("sessions"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("sessions"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
-- Force RLS on the new business tables, as the conventions check demands (see 0009, 0013 and 0017).
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_participants" FORCE ROW LEVEL SECURITY;
