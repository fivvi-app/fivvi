CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TABLE "trainer_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_locale" text,
	"inviter_team_member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_invitations_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "trainer_invitations_name_valid" CHECK (btrim("trainer_invitations"."name") <> '' AND char_length("trainer_invitations"."name") <= 120),
	CONSTRAINT "trainer_invitations_email_lowercase" CHECK ("trainer_invitations"."email" = lower("trainer_invitations"."email")),
	CONSTRAINT "trainer_invitations_email_locale_supported" CHECK ("trainer_invitations"."email_locale" IS NULL OR "trainer_invitations"."email_locale" IN ('nl-NL', 'en'))
);
--> statement-breakpoint
ALTER TABLE "trainer_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trainer_invitations" ADD CONSTRAINT "trainer_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_invitations" ADD CONSTRAINT "trainer_invitations_inviter_fk" FOREIGN KEY ("organization_id","inviter_team_member_id") REFERENCES "public"."team_members"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trainer_invitations_token_hash_unique" ON "trainer_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "trainer_invitations_organization_id_email_pending_unique" ON "trainer_invitations" USING btree ("organization_id","email") WHERE "trainer_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "trainer_invitations_organization_id_created_at_idx" ON "trainer_invitations" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE POLICY "trainer_invitations_workspace" ON "trainer_invitations" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("trainer_invitations"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("trainer_invitations"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
-- Force RLS on the new business table, as the conventions check demands (see 0009, 0013 and 0017).
ALTER TABLE "trainer_invitations" FORCE ROW LEVEL SECURITY;
