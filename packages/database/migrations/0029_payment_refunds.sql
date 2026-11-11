-- Hand edit of the generated file: the three new business tables force RLS, as the conventions
-- check demands (see 0009, 0013, 0017, 0021, 0023 and 0028), and payment_refund_status_changes is
-- append-only: a trigger refuses every update and delete, for every role, so the history of a
-- refund cannot be rewritten. It runs AFTER the row change so that row-level security (WITH CHECK)
-- answers first, as it does for every other table; the exception then undoes the statement.
CREATE TYPE "public"."payment_refund_status" AS ENUM('requested', 'queued', 'pending', 'refunded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "payment_chargebacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"provider_chargeback_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"bank_reason" text,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_chargebacks_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_chargebacks_amount_cents_positive" CHECK ("payment_chargebacks"."amount_cents" >= 1),
	CONSTRAINT "payment_chargebacks_provider_chargeback_id_valid" CHECK (btrim("payment_chargebacks"."provider_chargeback_id") <> ''),
	CONSTRAINT "payment_chargebacks_bank_reason_valid" CHECK ("payment_chargebacks"."bank_reason" IS NULL OR btrim("payment_chargebacks"."bank_reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "payment_chargebacks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_refund_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"from_status" "payment_refund_status",
	"to_status" "payment_refund_status" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" "payment_status_source" NOT NULL,
	"provider_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refund_status_changes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_refund_status_changes_refund_id_to_status_unique" UNIQUE("refund_id","to_status"),
	CONSTRAINT "payment_refund_status_changes_from_differs" CHECK ("payment_refund_status_changes"."from_status" IS NULL OR "payment_refund_status_changes"."from_status" <> "payment_refund_status_changes"."to_status")
);
--> statement-breakpoint
ALTER TABLE "payment_refund_status_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text,
	"revoke_credits" boolean DEFAULT false NOT NULL,
	"provider_refund_id" text,
	"requested_by_team_member_id" uuid,
	"status" "payment_refund_status" DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_refunds_organization_id_id_client_id_unique" UNIQUE("organization_id","id","client_id"),
	CONSTRAINT "payment_refunds_amount_cents_positive" CHECK ("payment_refunds"."amount_cents" >= 1),
	CONSTRAINT "payment_refunds_reason_valid" CHECK ("payment_refunds"."reason" IS NULL OR (btrim("payment_refunds"."reason") <> '' AND char_length("payment_refunds"."reason") <= 500)),
	CONSTRAINT "payment_refunds_provider_refund_id_valid" CHECK ("payment_refunds"."provider_refund_id" IS NULL OR btrim("payment_refunds"."provider_refund_id") <> '')
);
--> statement-breakpoint
ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_chargebacks" ADD CONSTRAINT "payment_chargebacks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_chargebacks" ADD CONSTRAINT "payment_chargebacks_payment_fk" FOREIGN KEY ("organization_id","payment_id","client_id") REFERENCES "public"."payments"("organization_id","id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund_status_changes" ADD CONSTRAINT "payment_refund_status_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund_status_changes" ADD CONSTRAINT "payment_refund_status_changes_refund_fk" FOREIGN KEY ("organization_id","refund_id","client_id") REFERENCES "public"."payment_refunds"("organization_id","id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_fk" FOREIGN KEY ("organization_id","payment_id","client_id") REFERENCES "public"."payments"("organization_id","id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_requested_by_fk" FOREIGN KEY ("organization_id","requested_by_team_member_id") REFERENCES "public"."team_members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_chargebacks_provider_chargeback_id_unique" ON "payment_chargebacks" USING btree ("provider_chargeback_id");--> statement-breakpoint
CREATE INDEX "payment_chargebacks_organization_id_payment_id_idx" ON "payment_chargebacks" USING btree ("organization_id","payment_id","received_at");--> statement-breakpoint
CREATE INDEX "payment_refund_status_changes_organization_id_refund_id_idx" ON "payment_refund_status_changes" USING btree ("organization_id","refund_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_provider_refund_id_unique" ON "payment_refunds" USING btree ("provider_refund_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_organization_id_payment_id_idx" ON "payment_refunds" USING btree ("organization_id","payment_id","created_at");--> statement-breakpoint
CREATE POLICY "payment_chargebacks_workspace" ON "payment_chargebacks" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payment_chargebacks"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payment_chargebacks"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "payment_chargebacks_client" ON "payment_chargebacks" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "payment_chargebacks"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "payment_chargebacks"."client_id" = app_client_id());--> statement-breakpoint
CREATE POLICY "payment_refund_status_changes_workspace" ON "payment_refund_status_changes" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payment_refund_status_changes"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payment_refund_status_changes"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "payment_refund_status_changes_client" ON "payment_refund_status_changes" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "payment_refund_status_changes"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "payment_refund_status_changes"."client_id" = app_client_id());--> statement-breakpoint
CREATE POLICY "payment_refunds_workspace" ON "payment_refunds" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payment_refunds"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payment_refunds"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "payment_refunds_client" ON "payment_refunds" AS RESTRICTIVE FOR ALL TO "fivvi_app" USING (app_client_id() IS NULL OR "payment_refunds"."client_id" = app_client_id()) WITH CHECK (app_client_id() IS NULL OR "payment_refunds"."client_id" = app_client_id());
--> statement-breakpoint
ALTER TABLE "payment_refunds" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_refund_status_changes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_chargebacks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "payment_refund_status_changes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'payment_refund_status_changes is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "payment_refund_status_changes_append_only" AFTER UPDATE OR DELETE ON "payment_refund_status_changes" FOR EACH ROW EXECUTE FUNCTION "payment_refund_status_changes_append_only"();--> statement-breakpoint
CREATE TRIGGER "payment_refund_status_changes_no_truncate" BEFORE TRUNCATE ON "payment_refund_status_changes" FOR EACH STATEMENT EXECUTE FUNCTION "payment_refund_status_changes_append_only"();
