CREATE TABLE "workspace_invoice_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"street" text NOT NULL,
	"house_number" text NOT NULL,
	"house_number_addition" text,
	"postcode" text NOT NULL,
	"city" text NOT NULL,
	"kvk_number" text NOT NULL,
	"vat_number" text NOT NULL,
	"question_email" text,
	"no_vat" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invoice_details_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "workspace_invoice_details_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "workspace_invoice_details_legal_name_valid" CHECK (char_length("workspace_invoice_details"."legal_name") <= 120 AND btrim("workspace_invoice_details"."legal_name") <> ''),
	CONSTRAINT "workspace_invoice_details_address_valid" CHECK (char_length("workspace_invoice_details"."street") <= 120 AND btrim("workspace_invoice_details"."street") <> '' AND char_length("workspace_invoice_details"."city") <= 120 AND btrim("workspace_invoice_details"."city") <> ''
        AND ("workspace_invoice_details"."house_number_addition" IS NULL OR char_length("workspace_invoice_details"."house_number_addition") <= 10 AND btrim("workspace_invoice_details"."house_number_addition") <> '')
        AND "workspace_invoice_details"."house_number" ~ '^[0-9]{1,5}$' AND "workspace_invoice_details"."postcode" ~ '^[1-9][0-9]{3} [A-Z]{2}$'),
	CONSTRAINT "workspace_invoice_details_kvk_number_format" CHECK ("workspace_invoice_details"."kvk_number" ~ '^[0-9]{8}$'),
	CONSTRAINT "workspace_invoice_details_vat_number_format" CHECK ("workspace_invoice_details"."vat_number" ~ '^NL[0-9]{9}B[0-9]{2}$'),
	CONSTRAINT "workspace_invoice_details_question_email_valid" CHECK ("workspace_invoice_details"."question_email" IS NULL OR ("workspace_invoice_details"."question_email" = lower("workspace_invoice_details"."question_email") AND char_length("workspace_invoice_details"."question_email") <= 254 AND "workspace_invoice_details"."question_email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);
--> statement-breakpoint
ALTER TABLE "workspace_invoice_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_invoice_details" ADD CONSTRAINT "workspace_invoice_details_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "workspace_invoice_details_workspace" ON "workspace_invoice_details" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("workspace_invoice_details"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("workspace_invoice_details"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
ALTER TABLE "workspace_invoice_details" FORCE ROW LEVEL SECURITY;
