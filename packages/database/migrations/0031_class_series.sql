-- Hand edit of the generated file: the foreign key class_series_trainer_profile_fk says
-- ON DELETE SET NULL ("trainer_profile_id"), as sessions_trainer_profile_fk does (see 0021): a plain
-- SET NULL would also clear organization_id, which is part of the composite key and not null; the
-- column list (Postgres 15+) clears only the usual trainer, so the series becomes "Trainer nodig"
-- when the trainer's profile goes. Drizzle cannot write the list. The generated file also cut the
-- rrule check short at the first semicolon, and RLS is forced for the new table as the conventions
-- check demands (see 0009, 0013, 0017, 0021 and 0023).
CREATE TABLE "class_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_class_id" uuid NOT NULL,
	"rrule" text NOT NULL,
	"local_start_time" time NOT NULL,
	"duration_minutes" integer NOT NULL,
	"time_zone" text NOT NULL,
	"trainer_profile_id" uuid,
	"capacity" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"materialized_until" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_series_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "class_series_rrule_weekly" CHECK ("class_series"."rrule" ~ '^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$'),
	CONSTRAINT "class_series_capacity_valid" CHECK ("class_series"."capacity" BETWEEN 1 AND 100),
	CONSTRAINT "class_series_duration_valid" CHECK ("class_series"."duration_minutes" BETWEEN 15 AND 240 AND "class_series"."duration_minutes" % 5 = 0),
	CONSTRAINT "class_series_ends_after_starts" CHECK ("class_series"."ends_on" IS NULL OR "class_series"."ends_on" >= "class_series"."starts_on"),
	CONSTRAINT "class_series_version_positive" CHECK ("class_series"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "class_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "occurrence_date" date;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "detached_fields" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_group_class_fk" FOREIGN KEY ("organization_id","group_class_id") REFERENCES "public"."group_classes"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_series" ADD CONSTRAINT "class_series_trainer_profile_fk" FOREIGN KEY ("organization_id","trainer_profile_id") REFERENCES "public"."trainer_profiles"("organization_id","id") ON DELETE SET NULL ("trainer_profile_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_series_organization_id_group_class_id_idx" ON "class_series" USING btree ("organization_id","group_class_id");--> statement-breakpoint
CREATE INDEX "class_series_materialized_until_idx" ON "class_series" USING btree ("materialized_until");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_series_fk" FOREIGN KEY ("organization_id","series_id") REFERENCES "public"."class_series"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_series_id_occurrence_date_unique" UNIQUE("series_id","occurrence_date");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_series_has_occurrence_date" CHECK (("sessions"."series_id" IS NULL) = ("sessions"."occurrence_date" IS NULL));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_detached_fields_valid" CHECK ("sessions"."detached_fields" <@ ARRAY['time', 'trainer', 'capacity', 'location']::text[]);--> statement-breakpoint
CREATE POLICY "class_series_workspace" ON "class_series" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("class_series"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("class_series"."organization_id" = ANY (app_workspace_ids()));
--> statement-breakpoint
ALTER TABLE "class_series" FORCE ROW LEVEL SECURITY;
