CREATE TABLE "trainer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_profiles_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "trainer_profiles_team_member_id_unique" UNIQUE("team_member_id")
);
--> statement-breakpoint
ALTER TABLE "trainer_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_team_member_fk" FOREIGN KEY ("organization_id","team_member_id") REFERENCES "public"."team_members"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "trainer_profiles_workspace" ON "trainer_profiles" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("trainer_profiles"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("trainer_profiles"."organization_id" = ANY (app_workspace_ids()));