-- Hand edit of the generated file: the foreign key group_classes_default_trainer_fk says
-- ON DELETE SET NULL (default_trainer_profile_id), as sessions_trainer_profile_fk does (see 0021): a
-- plain SET NULL would also clear organization_id, which is part of the composite key and not null;
-- the column list (Postgres 15+) clears only the usual trainer, so a class becomes "Trainer nodig"
-- when its trainer's profile goes. Drizzle cannot write the list.
-- Sessions that exist are private (F020 wrote no other kind), so the new check on group sessions
-- holds for every row.
CREATE TABLE "group_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name_nl" text NOT NULL,
	"name_en" text,
	"description_nl" text,
	"description_en" text,
	"default_trainer_profile_id" uuid,
	"capacity" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_classes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "group_classes_name_nl_valid" CHECK (btrim("group_classes"."name_nl") <> '' AND char_length("group_classes"."name_nl") <= 80),
	CONSTRAINT "group_classes_name_en_valid" CHECK ("group_classes"."name_en" IS NULL OR (btrim("group_classes"."name_en") <> '' AND char_length("group_classes"."name_en") <= 80)),
	CONSTRAINT "group_classes_descriptions_valid" CHECK (("group_classes"."description_nl" IS NULL OR (btrim("group_classes"."description_nl") <> '' AND char_length("group_classes"."description_nl") <= 500))
        AND ("group_classes"."description_en" IS NULL OR (btrim("group_classes"."description_en") <> '' AND char_length("group_classes"."description_en") <= 500))),
	CONSTRAINT "group_classes_capacity_valid" CHECK ("group_classes"."capacity" BETWEEN 1 AND 100),
	CONSTRAINT "group_classes_duration_valid" CHECK ("group_classes"."duration_minutes" BETWEEN 15 AND 240 AND "group_classes"."duration_minutes" % 5 = 0)
);
--> statement-breakpoint
ALTER TABLE "group_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "group_class_id" uuid;--> statement-breakpoint
ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_default_trainer_fk" FOREIGN KEY ("organization_id","default_trainer_profile_id") REFERENCES "public"."trainer_profiles"("organization_id","id") ON DELETE SET NULL ("default_trainer_profile_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_class_fk" FOREIGN KEY ("organization_id","group_class_id") REFERENCES "public"."group_classes"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_organization_id_group_class_id_starts_at_idx" ON "sessions" USING btree ("organization_id","group_class_id","starts_at");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_has_class" CHECK ("sessions"."type" <> 'group' OR "sessions"."group_class_id" IS NOT NULL);--> statement-breakpoint
CREATE POLICY "group_classes_workspace" ON "group_classes" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("group_classes"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("group_classes"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
-- Force RLS on the new business table, as the conventions check demands (see 0009, 0013, 0017 and 0021).
ALTER TABLE "group_classes" FORCE ROW LEVEL SECURITY;
