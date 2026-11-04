CREATE TYPE "public"."location_type" AS ENUM('organization_location', 'external_gym', 'client_home', 'outdoor', 'online', 'other');--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "location_type" NOT NULL,
	"postcode" text,
	"house_number" text,
	"house_number_addition" text,
	"street" text,
	"city" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "locations_name_valid" CHECK (btrim("locations"."name") <> '' AND char_length("locations"."name") <= 120),
	CONSTRAINT "locations_postcode_format" CHECK ("locations"."postcode" IS NULL OR "locations"."postcode" ~ '^[1-9][0-9]{3} [A-Z]{2}$'),
	CONSTRAINT "locations_house_number_format" CHECK ("locations"."house_number" IS NULL OR "locations"."house_number" ~ '^[0-9]{1,5}$'),
	CONSTRAINT "locations_address_all_or_nothing" CHECK (("locations"."postcode" IS NULL AND "locations"."house_number" IS NULL AND "locations"."street" IS NULL AND "locations"."city" IS NULL AND "locations"."house_number_addition" IS NULL)
        OR ("locations"."postcode" IS NOT NULL AND "locations"."house_number" IS NOT NULL AND "locations"."street" IS NOT NULL AND "locations"."city" IS NOT NULL)),
	CONSTRAINT "locations_address_text_valid" CHECK (("locations"."street" IS NULL OR (btrim("locations"."street") <> '' AND char_length("locations"."street") <= 120))
        AND ("locations"."city" IS NULL OR (btrim("locations"."city") <> '' AND char_length("locations"."city") <= 120))
        AND ("locations"."house_number_addition" IS NULL OR (btrim("locations"."house_number_addition") <> '' AND char_length("locations"."house_number_addition") <= 10)))
);
--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_organization_id_default_unique" ON "locations" USING btree ("organization_id") WHERE "locations"."is_default";--> statement-breakpoint
CREATE POLICY "locations_workspace" ON "locations" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("locations"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("locations"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
-- Force RLS on the new business table, as the conventions check demands (see 0009 and 0013).
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
