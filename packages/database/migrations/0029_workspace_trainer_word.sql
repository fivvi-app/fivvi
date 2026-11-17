-- F068 (#739): the workspace's word for its trainers. The default is the data migration: every workspace
-- that exists before this column reads 'trainer', and so does every new one (creating a workspace doesn't ask).
CREATE TYPE "public"."trainer_word" AS ENUM('trainer', 'instructeur', 'docent', 'coach');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trainer_word" "trainer_word" DEFAULT 'trainer' NOT NULL;