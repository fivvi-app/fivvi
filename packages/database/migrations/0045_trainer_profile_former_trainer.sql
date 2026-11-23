-- Hand edit of the generated file: the foreign key trainer_profiles_team_member_fk says
-- ON DELETE SET NULL ("team_member_id"), as sessions_trainer_profile_fk does (see 0021): a plain SET NULL
-- would also clear organization_id, which is part of the composite key and not null. Removing a team
-- member (F003) now keeps their trainer profile as a former trainer instead of deleting it (it was
-- ON DELETE CASCADE), so past sessions still show who taught them (F023); the removal records
-- removed_at, removed_team_member_id and removed_name on the profile just before the record goes.
ALTER TABLE "trainer_profiles" DROP CONSTRAINT "trainer_profiles_team_member_fk";
--> statement-breakpoint
ALTER TABLE "trainer_profiles" ALTER COLUMN "team_member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ADD COLUMN "removed_team_member_id" uuid;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ADD COLUMN "removed_name" text;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_team_member_fk" FOREIGN KEY ("organization_id","team_member_id") REFERENCES "public"."team_members"("organization_id","id") ON DELETE SET NULL ("team_member_id") ON UPDATE no action;