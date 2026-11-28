-- Hand edit of the generated file: the foreign key sessions_substitute_for_fk says
-- ON DELETE SET NULL ("substitute_for_trainer_profile_id"), as sessions_trainer_profile_fk does (see 0021): a
-- plain SET NULL would also clear organization_id, which is part of the composite key and not null.
-- A date whose original trainer's profile goes keeps its substitute and loses only the label of whom
-- it replaced (F024).
ALTER TABLE "sessions" ADD COLUMN "substitute_for_trainer_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_substitute_for_fk" FOREIGN KEY ("organization_id","substitute_for_trainer_profile_id") REFERENCES "public"."trainer_profiles"("organization_id","id") ON DELETE SET NULL ("substitute_for_trainer_profile_id") ON UPDATE no action;
