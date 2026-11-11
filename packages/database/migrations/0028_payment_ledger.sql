-- Hand edit of the generated file: the three new business tables force RLS, as the conventions
-- check demands (see 0009, 0013, 0017, 0021 and 0023), and payment_status_changes is append-only:
-- a trigger refuses every update and delete, for every role, so the ledger cannot be rewritten.
-- It runs AFTER the row change so that row-level security (WITH CHECK) answers first, as it does for
-- every other table; the exception then undoes the statement.
CREATE TYPE "public"."payment_kind" AS ENUM('first', 'recurring', 'oneoff');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('agreement_first', 'agreement_due', 'open_amount', 'single_class_pass');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('open', 'pending', 'paid', 'failed', 'canceled', 'expired', 'refunded', 'charged_back');--> statement-breakpoint
CREATE TYPE "public"."payment_status_source" AS ENUM('webhook', 'fetch', 'job');--> statement-breakpoint
CREATE TABLE "payment_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_customers_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_customers_organization_id_client_id_unique" UNIQUE("organization_id","client_id"),
	CONSTRAINT "payment_customers_organization_id_provider_customer_id_unique" UNIQUE("organization_id","provider_customer_id"),
	CONSTRAINT "payment_customers_provider_customer_id_valid" CHECK (btrim("payment_customers"."provider_customer_id") <> '')
);
--> statement-breakpoint
ALTER TABLE "payment_customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"from_status" "payment_status",
	"to_status" "payment_status" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" "payment_status_source" NOT NULL,
	"provider_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_status_changes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_status_changes_payment_id_to_status_unique" UNIQUE("payment_id","to_status"),
	CONSTRAINT "payment_status_changes_from_differs" CHECK ("payment_status_changes"."from_status" IS NULL OR "payment_status_changes"."from_status" <> "payment_status_changes"."to_status")
);
--> statement-breakpoint
ALTER TABLE "payment_status_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"purpose_reference_id" uuid,
	"business_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"description" text NOT NULL,
	"supplied" jsonb NOT NULL,
	"provider_payment_id" text,
	"provider_mandate_id" text,
	"status" "payment_status" DEFAULT 'open' NOT NULL,
	"testmode" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payments_organization_id_business_key_unique" UNIQUE("organization_id","business_key"),
	CONSTRAINT "payments_organization_id_id_client_id_unique" UNIQUE("organization_id","id","client_id"),
	CONSTRAINT "payments_amount_cents_positive" CHECK ("payments"."amount_cents" >= 1),
	CONSTRAINT "payments_currency_eur" CHECK ("payments"."currency" = 'EUR'),
	CONSTRAINT "payments_business_key_valid" CHECK (btrim("payments"."business_key") <> ''),
	CONSTRAINT "payments_description_valid" CHECK (btrim("payments"."description") <> '' AND char_length("payments"."description") <= 255)
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_status_changes" ADD CONSTRAINT "payment_status_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_status_changes" ADD CONSTRAINT "payment_status_changes_payment_fk" FOREIGN KEY ("organization_id","payment_id","client_id") REFERENCES "public"."payments"("organization_id","id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_status_changes_organization_id_payment_id_idx" ON "payment_status_changes" USING btree ("organization_id","payment_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_id_unique" ON "payments" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE INDEX "payments_organization_id_client_id_created_at_idx" ON "payments" USING btree ("organization_id","client_id","created_at");--> statement-breakpoint
CREATE POLICY "payment_customers_workspace" ON "payment_customers" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payment_customers"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payment_customers"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "payment_customers_client" ON "payment_customers" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "payment_customers"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "payment_customers"."client_id" = app_client_id());--> statement-breakpoint
CREATE POLICY "payment_status_changes_workspace" ON "payment_status_changes" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payment_status_changes"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payment_status_changes"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "payment_status_changes_client" ON "payment_status_changes" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "payment_status_changes"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "payment_status_changes"."client_id" = app_client_id());--> statement-breakpoint
CREATE POLICY "payments_workspace" ON "payments" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payments"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payments"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "payments_client" ON "payments" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "payments"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "payments"."client_id" = app_client_id());
--> statement-breakpoint
ALTER TABLE "payment_customers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_status_changes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "payment_status_changes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'payment_status_changes is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "payment_status_changes_append_only" AFTER UPDATE OR DELETE ON "payment_status_changes" FOR EACH ROW EXECUTE FUNCTION "payment_status_changes_append_only"();--> statement-breakpoint
CREATE TRIGGER "payment_status_changes_no_truncate" BEFORE TRUNCATE ON "payment_status_changes" FOR EACH STATEMENT EXECUTE FUNCTION "payment_status_changes_append_only"();
