-- Hand edit of the generated file (F025): the new business table forces RLS, as the conventions
-- check demands (see 0009, 0013, 0017, 0021, 0023 and 0028), and session_participant_status_changes
-- is append-only: a trigger refuses every update and delete, for every role, so the history cannot
-- be rewritten. It runs AFTER the row change so that row-level security (WITH CHECK) answers first,
-- as it does for every other table; the exception then undoes the statement. The unique key of
-- session_participants that the history's foreign key needs comes before that key (Drizzle puts it after).
CREATE TYPE "public"."participant_status_actor_type" AS ENUM('team_member', 'client', 'system');--> statement-breakpoint
CREATE TYPE "public"."participant_status_initiator" AS ENUM('client', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."participant_status_source" AS ENUM('web', 'ios', 'android', 'system');--> statement-breakpoint
CREATE TABLE "session_participant_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_participant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"from_status" "attendance_status",
	"to_status" "attendance_status" NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"actor_type" "participant_status_actor_type" NOT NULL,
	"actor_team_member_id" uuid,
	"actor_account_id" uuid,
	"initiated_by" "participant_status_initiator",
	"source" "participant_status_source" NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_participant_status_changes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "session_participant_status_changes_request_id_unique" UNIQUE("organization_id","client_request_id"),
	CONSTRAINT "session_participant_status_changes_from_differs" CHECK ("session_participant_status_changes"."from_status" IS NULL OR "session_participant_status_changes"."from_status" <> "session_participant_status_changes"."to_status"),
	CONSTRAINT "session_participant_status_changes_actor_matches_type" CHECK (("session_participant_status_changes"."actor_type" = 'team_member' AND "session_participant_status_changes"."actor_team_member_id" IS NOT NULL)
        OR ("session_participant_status_changes"."actor_type" = 'client' AND "session_participant_status_changes"."actor_account_id" IS NOT NULL)
        OR ("session_participant_status_changes"."actor_type" = 'system' AND "session_participant_status_changes"."actor_team_member_id" IS NULL AND "session_participant_status_changes"."actor_account_id" IS NULL)),
	CONSTRAINT "session_participant_status_changes_request_id_valid" CHECK ("session_participant_status_changes"."client_request_id" IS NULL OR btrim("session_participant_status_changes"."client_request_id") <> '')
);
--> statement-breakpoint
ALTER TABLE "session_participant_status_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_participants" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_organization_id_id_client_id_unique" UNIQUE("organization_id","id","client_id");--> statement-breakpoint
ALTER TABLE "session_participant_status_changes" ADD CONSTRAINT "session_participant_status_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participant_status_changes" ADD CONSTRAINT "session_participant_status_changes_participant_fk" FOREIGN KEY ("organization_id","session_participant_id","client_id") REFERENCES "public"."session_participants"("organization_id","id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_participant_status_changes_participant_idx" ON "session_participant_status_changes" USING btree ("organization_id","session_participant_id","changed_at","id");--> statement-breakpoint
CREATE POLICY "session_participant_status_changes_workspace" ON "session_participant_status_changes" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("session_participant_status_changes"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("session_participant_status_changes"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "session_participant_status_changes_client" ON "session_participant_status_changes" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "session_participant_status_changes"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "session_participant_status_changes"."client_id" = app_client_id());
--> statement-breakpoint
ALTER TABLE "session_participant_status_changes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "session_participant_status_changes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'session_participant_status_changes is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "session_participant_status_changes_append_only" AFTER UPDATE OR DELETE ON "session_participant_status_changes" FOR EACH ROW EXECUTE FUNCTION "session_participant_status_changes_append_only"();--> statement-breakpoint
CREATE TRIGGER "session_participant_status_changes_no_truncate" BEFORE TRUNCATE ON "session_participant_status_changes" FOR EACH STATEMENT EXECUTE FUNCTION "session_participant_status_changes_append_only"();
