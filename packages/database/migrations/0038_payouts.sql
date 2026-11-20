-- Hand edit of the generated file: the three new business tables force RLS, as the conventions
-- check demands (see 0009, 0013, 0017, 0021, 0023, 0028 and 0030), and payout_status_changes is
-- append-only: a trigger refuses every update and delete, and a truncate, for every role, so the
-- history of a payout cannot be rewritten. It runs AFTER the row change so that row-level security
-- (WITH CHECK) answers first, as it does for every other table; the exception then undoes the
-- statement.
CREATE TYPE "public"."payout_fee_kind" AS ENUM('ideal', 'direct_debit', 'refund', 'failed_direct_debit', 'reversal', 'other');--> statement-breakpoint
CREATE TYPE "public"."payout_line_type" AS ENUM('payment', 'refund', 'chargeback', 'fee', 'other');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('open', 'pending', 'paidout', 'failed');--> statement-breakpoint
CREATE TABLE "payout_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payout_id" uuid NOT NULL,
	"provider_line_id" text NOT NULL,
	"type" "payout_line_type" NOT NULL,
	"fee_kind" "payout_fee_kind",
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"fee_count" integer,
	"matched_payment_id" uuid,
	"matched_refund_id" uuid,
	"matched_chargeback_id" uuid,
	"matched" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_lines_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payout_lines_organization_id_payout_id_provider_line_id_unique" UNIQUE("organization_id","payout_id","provider_line_id"),
	CONSTRAINT "payout_lines_provider_line_id_valid" CHECK (btrim("payout_lines"."provider_line_id") <> ''),
	CONSTRAINT "payout_lines_fee_kind_matches_type" CHECK (("payout_lines"."type" = 'fee') = ("payout_lines"."fee_kind" IS NOT NULL)),
	CONSTRAINT "payout_lines_fee_count_valid" CHECK ("payout_lines"."fee_count" IS NULL OR ("payout_lines"."type" = 'fee' AND "payout_lines"."fee_count" >= 1)),
	CONSTRAINT "payout_lines_one_match" CHECK (num_nonnulls("payout_lines"."matched_payment_id", "payout_lines"."matched_refund_id", "payout_lines"."matched_chargeback_id") <= 1),
	CONSTRAINT "payout_lines_link_means_matched" CHECK ("payout_lines"."matched" OR num_nonnulls("payout_lines"."matched_payment_id", "payout_lines"."matched_refund_id", "payout_lines"."matched_chargeback_id") = 0)
);
--> statement-breakpoint
ALTER TABLE "payout_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payout_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payout_id" uuid NOT NULL,
	"from_status" "payout_status",
	"to_status" "payout_status" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" "payment_status_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_status_changes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payout_status_changes_from_differs" CHECK ("payout_status_changes"."from_status" IS NULL OR "payout_status_changes"."from_status" <> "payout_status_changes"."to_status")
);
--> statement-breakpoint
ALTER TABLE "payout_status_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_settlement_id" text NOT NULL,
	"reference" text,
	"settled_at" timestamp with time zone,
	"amount_cents" integer NOT NULL,
	"status" "payout_status" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payouts_organization_id_provider_settlement_id_unique" UNIQUE("organization_id","provider_settlement_id"),
	CONSTRAINT "payouts_provider_settlement_id_valid" CHECK (btrim("payouts"."provider_settlement_id") <> ''),
	CONSTRAINT "payouts_reference_valid" CHECK ("payouts"."reference" IS NULL OR btrim("payouts"."reference") <> '')
);
--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_payout_fk" FOREIGN KEY ("organization_id","payout_id") REFERENCES "public"."payouts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_matched_payment_fk" FOREIGN KEY ("organization_id","matched_payment_id") REFERENCES "public"."payments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_matched_refund_fk" FOREIGN KEY ("organization_id","matched_refund_id") REFERENCES "public"."payment_refunds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_matched_chargeback_fk" FOREIGN KEY ("organization_id","matched_chargeback_id") REFERENCES "public"."payment_chargebacks"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_status_changes" ADD CONSTRAINT "payout_status_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_status_changes" ADD CONSTRAINT "payout_status_changes_payout_fk" FOREIGN KEY ("organization_id","payout_id") REFERENCES "public"."payouts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payout_lines_organization_id_matched_payment_id_idx" ON "payout_lines" USING btree ("organization_id","matched_payment_id") WHERE "payout_lines"."matched_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payout_lines_organization_id_matched_refund_id_idx" ON "payout_lines" USING btree ("organization_id","matched_refund_id") WHERE "payout_lines"."matched_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payout_lines_organization_id_matched_chargeback_id_idx" ON "payout_lines" USING btree ("organization_id","matched_chargeback_id") WHERE "payout_lines"."matched_chargeback_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payout_status_changes_organization_id_payout_id_idx" ON "payout_status_changes" USING btree ("organization_id","payout_id","occurred_at");--> statement-breakpoint
CREATE INDEX "payouts_organization_id_settled_at_idx" ON "payouts" USING btree ("organization_id","settled_at");--> statement-breakpoint
CREATE POLICY "payout_lines_workspace" ON "payout_lines" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payout_lines"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payout_lines"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "payout_status_changes_workspace" ON "payout_status_changes" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payout_status_changes"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payout_status_changes"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "payouts_workspace" ON "payouts" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("payouts"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("payouts"."organization_id" = ANY (app_workspace_ids()));
--> statement-breakpoint
ALTER TABLE "payouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payout_status_changes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payout_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "payout_status_changes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'payout_status_changes is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "payout_status_changes_append_only" AFTER UPDATE OR DELETE ON "payout_status_changes" FOR EACH ROW EXECUTE FUNCTION "payout_status_changes_append_only"();--> statement-breakpoint
CREATE TRIGGER "payout_status_changes_no_truncate" BEFORE TRUNCATE ON "payout_status_changes" FOR EACH STATEMENT EXECUTE FUNCTION "payout_status_changes_append_only"();
