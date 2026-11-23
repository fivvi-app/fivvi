-- Hand edit of the generated file: the foreign key sessions_cancelled_by_fk says
-- ON DELETE SET NULL ("cancelled_by_team_member_id"), as sessions_created_by_fk and
-- sessions_updated_by_fk do (see 0021, 0024): a plain SET NULL would also clear organization_id,
-- which is part of the composite key and not null. Removing a team member never blocks on the
-- sessions they cancelled, and the record of the cancellation (the time, the initiator) stays.
CREATE TYPE "public"."cancellation_initiator" AS ENUM('client', 'workspace');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cancelled_by_team_member_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cancellation_initiator" "cancellation_initiator";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cancellation_message" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cancellation_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cancelled_by_fk" FOREIGN KEY ("organization_id","cancelled_by_team_member_id") REFERENCES "public"."team_members"("organization_id","id") ON DELETE SET NULL ("cancelled_by_team_member_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cancellation_record_complete" CHECK (("sessions"."cancelled_at" IS NULL) = ("sessions"."cancellation_initiator" IS NULL)
        AND ("sessions"."cancelled_at" IS NOT NULL OR ("sessions"."cancelled_by_team_member_id" IS NULL AND "sessions"."cancellation_message" IS NULL))
        AND ("sessions"."cancelled_at" IS NULL OR "sessions"."status" = 'cancelled'));