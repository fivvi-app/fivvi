-- Hand edit of the generated file: the foreign key sessions_updated_by_fk says
-- ON DELETE SET NULL ("updated_by_team_member_id"), as sessions_created_by_fk does (see 0021): a
-- plain SET NULL would also clear organization_id, which is part of the composite key and not null.
-- Rows that exist start with their planner as the one who changed them last.
ALTER TABLE "sessions" ADD COLUMN "updated_by_team_member_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_updated_by_fk" FOREIGN KEY ("organization_id","updated_by_team_member_id") REFERENCES "public"."team_members"("organization_id","id") ON DELETE SET NULL ("updated_by_team_member_id") ON UPDATE no action;--> statement-breakpoint
UPDATE "sessions" SET "updated_by_team_member_id" = "created_by_team_member_id" WHERE "created_by_team_member_id" IS NOT NULL;
