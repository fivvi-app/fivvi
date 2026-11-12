-- Hand edit of the generated file: both tables force RLS (the conventions check demands it for
-- access_log, and deletion_log is written by the cron role and by the app role under policies, so
-- the owner must not skip them), and both logs are write-once: a trigger refuses every update, for
-- every role. It runs AFTER the row change so that row-level security (WITH CHECK) answers first,
-- as it does for every other table; the exception then undoes the statement. Delete stays open:
-- the daily retention tasks delete old entries (R12, the deletion log's 30 days).
CREATE TYPE "public"."access_log_action" AS ENUM('client.exported', 'client.trashed', 'client.restored', 'client.purged', 'workspace.exported', 'client.retention_kept', 'note.viewed', 'note.changed');--> statement-breakpoint
CREATE TABLE "access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_team_member_id" uuid,
	"action" "access_log_action" NOT NULL,
	"subject_client_id" uuid,
	"object_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_log_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "access_log_object_matches_action" CHECK (("access_log"."action" IN ('note.viewed', 'note.changed')) = ("access_log"."object_id" IS NOT NULL)),
	CONSTRAINT "access_log_client_matches_action" CHECK (("access_log"."action" = 'workspace.exported') = ("access_log"."subject_client_id" IS NULL)),
	CONSTRAINT "access_log_actor_matches_action" CHECK ("access_log"."actor_team_member_id" IS NOT NULL OR "access_log"."action" IN ('client.trashed', 'client.purged'))
);
--> statement-breakpoint
ALTER TABLE "access_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deletion_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_log_table_name_valid" CHECK ("deletion_log"."table_name" ~ '^[a-z][a-z0-9_]{0,62}$')
);
--> statement-breakpoint
ALTER TABLE "deletion_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_log_organization_id_occurred_at_idx" ON "access_log" USING btree ("organization_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "access_log_organization_id_subject_client_id_idx" ON "access_log" USING btree ("organization_id","subject_client_id","occurred_at");--> statement-breakpoint
CREATE INDEX "access_log_occurred_at_idx" ON "access_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "deletion_log_deleted_at_idx" ON "deletion_log" USING btree ("deleted_at");--> statement-breakpoint
CREATE POLICY "access_log_workspace" ON "access_log" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("access_log"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("access_log"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "deletion_log_cron" ON "deletion_log" AS PERMISSIVE FOR ALL TO "fivvi_cron" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "deletion_log_app_insert" ON "deletion_log" AS PERMISSIVE FOR INSERT TO "fivvi_app" WITH CHECK ("deletion_log"."organization_id" = ANY (app_workspace_ids()));
--> statement-breakpoint
ALTER TABLE "access_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deletion_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "write_once_log_no_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% is write-once', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "access_log_no_update" AFTER UPDATE ON "access_log" FOR EACH ROW EXECUTE FUNCTION "write_once_log_no_update"();--> statement-breakpoint
CREATE TRIGGER "deletion_log_no_update" AFTER UPDATE ON "deletion_log" FOR EACH ROW EXECUTE FUNCTION "write_once_log_no_update"();
