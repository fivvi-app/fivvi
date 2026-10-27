CREATE TYPE "public"."team_role" AS ENUM('owner', 'trainer');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "clients_organization_id_account_id_unique" UNIQUE("organization_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "team_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "team_members_organization_id_account_id_unique" UNIQUE("organization_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_account_id_idx" ON "clients" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "team_members_account_id_idx" ON "team_members" USING btree ("account_id");--> statement-breakpoint
CREATE POLICY "organizations_workspace" ON "organizations" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("organizations"."id" = ANY (app_workspace_ids())) WITH CHECK ("organizations"."id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "clients_workspace" ON "clients" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("clients"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("clients"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "clients_client" ON "clients" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "clients"."id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "clients"."id" = app_client_id());--> statement-breakpoint
CREATE POLICY "clients_own_account" ON "clients" AS PERMISSIVE FOR SELECT TO "fivvi_app" USING ("clients"."account_id" = app_account_id());--> statement-breakpoint
CREATE POLICY "team_members_workspace" ON "team_members" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("team_members"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("team_members"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "team_members_own_account" ON "team_members" AS PERMISSIVE FOR SELECT TO "fivvi_app" USING ("team_members"."account_id" = app_account_id());