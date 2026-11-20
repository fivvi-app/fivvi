-- Hand edit of the generated file (F052, ticket #784):
-- - both new business tables force RLS, as the conventions check demands (see 0009, 0013, 0017,
--   0021, 0023 and 0028);
-- - offers_current_version_fk is DEFERRABLE INITIALLY DEFERRED: an offer and its first version
--   point at each other, so they are written in one transaction, in either order, and the offer
--   is never without a current version once it commits. Drizzle cannot write the clause;
-- - offer_versions is immutable: a trigger refuses every update and delete, for every role (as
--   payment_status_changes is append-only, 0028). It runs AFTER the row change so that row-level
--   security answers first; the exception then undoes the statement. A change of an offer is a
--   new version that becomes its current one;
-- - the backfill gives every workspace that exists before offers do the three default plans of
--   `DEFAULT_OFFER_PLANS` (packages/domain), switched off, without a price and without a VAT
--   rate. It is a copy made once: a later change of the template never touches these rows. It
--   inserts only the default plans a workspace lacks, so running it twice creates nothing more.
CREATE TYPE "public"."offer_billing_cycle" AS ENUM('month', 'four_weeks');--> statement-breakpoint
CREATE TYPE "public"."offer_credit_kind" AS ENUM('group', 'private');--> statement-breakpoint
CREATE TYPE "public"."offer_end_of_term" AS ENUM('stop', 'continue');--> statement-breakpoint
CREATE TYPE "public"."offer_kind" AS ENUM('membership', 'credit_pack', 'credit_plan', 'single_class_pass');--> statement-breakpoint
CREATE TYPE "public"."offer_origin" AS ENUM('default', 'owner');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('off', 'on', 'archived');--> statement-breakpoint
CREATE TYPE "public"."offer_validity_unit" AS ENUM('day', 'week', 'month');--> statement-breakpoint
CREATE TABLE "offer_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name_nl" text NOT NULL,
	"name_en" text,
	"description_nl" text,
	"description_en" text,
	"price_cents" integer,
	"vat_rate_basis_points" integer,
	"billing_cycle" "offer_billing_cycle",
	"term_months" integer,
	"minimum_term_months" integer,
	"end_of_term" "offer_end_of_term",
	"classes_per_week" integer,
	"credits" integer,
	"validity_amount" integer,
	"validity_unit" "offer_validity_unit",
	"carry_over_limit" integer,
	"once_per_client" boolean DEFAULT false NOT NULL,
	"members_only" boolean DEFAULT false NOT NULL,
	"cutoff_minutes" integer NOT NULL,
	"makeups_per_month" integer,
	"returns_per_month" integer,
	"covered_class_ids" uuid[],
	"renewal_window_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_versions_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "offer_versions_organization_id_id_offer_id_unique" UNIQUE("organization_id","id","offer_id"),
	CONSTRAINT "offer_versions_organization_id_offer_id_version_unique" UNIQUE("organization_id","offer_id","version"),
	CONSTRAINT "offer_versions_version_valid" CHECK ("offer_versions"."version" >= 1),
	CONSTRAINT "offer_versions_name_nl_valid" CHECK (btrim("offer_versions"."name_nl") <> '' AND char_length("offer_versions"."name_nl") <= 80),
	CONSTRAINT "offer_versions_name_en_valid" CHECK ("offer_versions"."name_en" IS NULL OR (btrim("offer_versions"."name_en") <> '' AND char_length("offer_versions"."name_en") <= 80)),
	CONSTRAINT "offer_versions_descriptions_valid" CHECK (("offer_versions"."description_nl" IS NULL OR (btrim("offer_versions"."description_nl") <> '' AND char_length("offer_versions"."description_nl") <= 500))
        AND ("offer_versions"."description_en" IS NULL OR (btrim("offer_versions"."description_en") <> '' AND char_length("offer_versions"."description_en") <= 500))),
	CONSTRAINT "offer_versions_price_valid" CHECK ("offer_versions"."price_cents" IS NULL OR "offer_versions"."price_cents" BETWEEN 1 AND 1000000),
	CONSTRAINT "offer_versions_vat_rate_valid" CHECK ("offer_versions"."vat_rate_basis_points" IS NULL OR "offer_versions"."vat_rate_basis_points" IN (2100, 900)),
	CONSTRAINT "offer_versions_terms_valid" CHECK (("offer_versions"."term_months" IS NULL OR "offer_versions"."term_months" BETWEEN 1 AND 24)
        AND ("offer_versions"."minimum_term_months" IS NULL OR "offer_versions"."minimum_term_months" BETWEEN 0 AND 12)
        AND ("offer_versions"."classes_per_week" IS NULL OR "offer_versions"."classes_per_week" BETWEEN 1 AND 7)
        AND ("offer_versions"."credits" IS NULL OR "offer_versions"."credits" BETWEEN 1 AND 200)
        AND ("offer_versions"."carry_over_limit" IS NULL OR "offer_versions"."carry_over_limit" BETWEEN 0 AND 50)
        AND ("offer_versions"."makeups_per_month" IS NULL OR "offer_versions"."makeups_per_month" BETWEEN 0 AND 10)
        AND ("offer_versions"."returns_per_month" IS NULL OR "offer_versions"."returns_per_month" >= 0)
        AND ("offer_versions"."renewal_window_days" IS NULL OR "offer_versions"."renewal_window_days" BETWEEN 0 AND 365)),
	CONSTRAINT "offer_versions_validity_valid" CHECK (("offer_versions"."validity_amount" IS NULL) = ("offer_versions"."validity_unit" IS NULL)
        AND ("offer_versions"."validity_amount" IS NULL OR "offer_versions"."validity_amount" >= 1)),
	CONSTRAINT "offer_versions_cutoff_valid" CHECK ("offer_versions"."cutoff_minutes" BETWEEN 0 AND 4320 AND "offer_versions"."cutoff_minutes" % 60 = 0),
	CONSTRAINT "offer_versions_covered_class_ids_valid" CHECK ("offer_versions"."covered_class_ids" IS NULL OR cardinality("offer_versions"."covered_class_ids") >= 1)
);
--> statement-breakpoint
ALTER TABLE "offer_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "offer_kind" NOT NULL,
	"credit_kind" "offer_credit_kind",
	"status" "offer_status" DEFAULT 'off' NOT NULL,
	"origin" "offer_origin" NOT NULL,
	"default_plan" text,
	"current_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "offers_organization_id_default_plan_unique" UNIQUE("organization_id","default_plan"),
	CONSTRAINT "offers_credit_kind_valid" CHECK (("offers"."kind" IN ('credit_pack', 'credit_plan')) = ("offers"."credit_kind" IS NOT NULL)),
	CONSTRAINT "offers_default_plan_valid" CHECK (("offers"."origin" = 'default') = ("offers"."default_plan" IS NOT NULL)
        AND ("offers"."default_plan" IS NULL OR btrim("offers"."default_plan") <> ''))
);
--> statement-breakpoint
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_offer_fk" FOREIGN KEY ("organization_id","offer_id") REFERENCES "public"."offers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_current_version_fk" FOREIGN KEY ("organization_id","current_version_id","id") REFERENCES "public"."offer_versions"("organization_id","id","offer_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE POLICY "offer_versions_workspace" ON "offer_versions" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("offer_versions"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("offer_versions"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
CREATE POLICY "offers_workspace" ON "offers" AS PERMISSIVE FOR ALL TO "fivvi_app" USING ("offers"."organization_id" = ANY (app_workspace_ids())) WITH CHECK ("offers"."organization_id" = ANY (app_workspace_ids()));--> statement-breakpoint
ALTER TABLE "offers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "offer_versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "offer_versions_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'offer_versions is immutable' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "offer_versions_immutable" AFTER UPDATE OR DELETE ON "offer_versions" FOR EACH ROW EXECUTE FUNCTION "offer_versions_immutable"();--> statement-breakpoint
CREATE TRIGGER "offer_versions_no_truncate" BEFORE TRUNCATE ON "offer_versions" FOR EACH STATEMENT EXECUTE FUNCTION "offer_versions_immutable"();--> statement-breakpoint
-- Backfill: the default plans of every existing workspace (idempotent per default plan).
WITH "plans" ("default_plan", "kind", "credit_kind", "name_nl", "name_en", "billing_cycle", "term_months", "minimum_term_months", "end_of_term", "classes_per_week", "credits", "validity_amount", "validity_unit", "carry_over_limit", "cutoff_minutes", "makeups_per_month", "returns_per_month", "renewal_window_days") AS (
	VALUES
		('membership', 'membership'::"offer_kind", NULL::"offer_credit_kind", 'Abonnement', 'Membership', 'month'::"offer_billing_cycle", 6, NULL::integer, 'stop'::"offer_end_of_term", 2, NULL::integer, NULL::integer, NULL::"offer_validity_unit", NULL::integer, 720, 2, NULL::integer, 30),
		('group_credit_pack', 'credit_pack'::"offer_kind", 'group'::"offer_credit_kind", 'Groepscreditpakket', 'Group credit pack', NULL::"offer_billing_cycle", NULL::integer, NULL::integer, NULL::"offer_end_of_term", NULL::integer, 10, 3, 'month'::"offer_validity_unit", NULL::integer, 720, NULL::integer, NULL::integer, 30),
		('private_credit_plan', 'credit_plan'::"offer_kind", 'private'::"offer_credit_kind", 'Privécreditabonnement', 'Private credit plan', 'month'::"offer_billing_cycle", NULL::integer, 3, 'stop'::"offer_end_of_term", NULL::integer, 4, NULL::integer, NULL::"offer_validity_unit", 0, 1440, NULL::integer, 2, 30)
),
"missing" AS (
	SELECT o."id" AS "organization_id", gen_random_uuid() AS "offer_id", gen_random_uuid() AS "version_id", p.*
	FROM "organizations" o
	CROSS JOIN "plans" p
	WHERE NOT EXISTS (
		SELECT 1 FROM "offers" x WHERE x."organization_id" = o."id" AND x."default_plan" = p."default_plan"
	)
),
"new_offers" AS (
	INSERT INTO "offers" ("id", "organization_id", "kind", "credit_kind", "status", "origin", "default_plan", "current_version_id")
	SELECT "offer_id", "organization_id", "kind", "credit_kind", 'off', 'default', "default_plan", "version_id" FROM "missing"
	RETURNING "id"
)
INSERT INTO "offer_versions" ("id", "organization_id", "offer_id", "version", "name_nl", "name_en", "billing_cycle", "term_months", "minimum_term_months", "end_of_term", "classes_per_week", "credits", "validity_amount", "validity_unit", "carry_over_limit", "cutoff_minutes", "makeups_per_month", "returns_per_month", "renewal_window_days")
SELECT "version_id", "organization_id", "offer_id", 1, "name_nl", "name_en", "billing_cycle", "term_months", "minimum_term_months", "end_of_term", "classes_per_week", "credits", "validity_amount", "validity_unit", "carry_over_limit", "cutoff_minutes", "makeups_per_month", "returns_per_month", "renewal_window_days" FROM "missing";
