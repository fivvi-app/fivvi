CREATE TYPE "public"."billing_details_changed_by" AS ENUM('client', 'team');--> statement-breakpoint
CREATE TABLE "client_billing_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"as_company" boolean DEFAULT false NOT NULL,
	"company_name" text,
	"street" text,
	"house_number" text,
	"house_number_addition" text,
	"postcode" text,
	"city" text,
	"vat_number" text,
	"changed_by" "billing_details_changed_by" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_billing_details_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "client_billing_details_organization_id_client_id_unique" UNIQUE("organization_id","client_id"),
	CONSTRAINT "client_billing_details_company_shape" CHECK (("client_billing_details"."as_company"
          AND "client_billing_details"."company_name" IS NOT NULL AND "client_billing_details"."street" IS NOT NULL
          AND "client_billing_details"."house_number" IS NOT NULL AND "client_billing_details"."postcode" IS NOT NULL
          AND "client_billing_details"."city" IS NOT NULL)
        OR (NOT "client_billing_details"."as_company"
          AND "client_billing_details"."company_name" IS NULL AND "client_billing_details"."street" IS NULL
          AND "client_billing_details"."house_number" IS NULL AND "client_billing_details"."house_number_addition" IS NULL
          AND "client_billing_details"."postcode" IS NULL AND "client_billing_details"."city" IS NULL AND "client_billing_details"."vat_number" IS NULL)),
	CONSTRAINT "client_billing_details_text_valid" CHECK (("client_billing_details"."company_name" IS NULL OR char_length("client_billing_details"."company_name") <= 120 AND btrim("client_billing_details"."company_name") <> '')
        AND ("client_billing_details"."street" IS NULL OR char_length("client_billing_details"."street") <= 120 AND btrim("client_billing_details"."street") <> '')
        AND ("client_billing_details"."city" IS NULL OR char_length("client_billing_details"."city") <= 120 AND btrim("client_billing_details"."city") <> '')
        AND ("client_billing_details"."house_number_addition" IS NULL OR char_length("client_billing_details"."house_number_addition") <= 10 AND btrim("client_billing_details"."house_number_addition") <> '')
        AND ("client_billing_details"."house_number" IS NULL OR "client_billing_details"."house_number" ~ '^[0-9]{1,5}$')
        AND ("client_billing_details"."postcode" IS NULL OR "client_billing_details"."postcode" ~ '^[1-9][0-9]{3} [A-Z]{2}$')),
	CONSTRAINT "client_billing_details_vat_number_format" CHECK ("client_billing_details"."vat_number" IS NULL OR "client_billing_details"."vat_number" ~ '^NL[0-9]{9}B[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "client_billing_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_billing_details" ADD CONSTRAINT "client_billing_details_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing_details" ADD CONSTRAINT "client_billing_details_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "client_billing_details_workspace" ON "client_billing_details" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("client_billing_details"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("client_billing_details"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "client_billing_details_client" ON "client_billing_details" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "client_billing_details"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "client_billing_details"."client_id" = app_client_id());--> statement-breakpoint
ALTER TABLE "client_billing_details" FORCE ROW LEVEL SECURITY;
