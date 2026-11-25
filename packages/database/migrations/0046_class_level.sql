CREATE TYPE "public"."class_level" AS ENUM('all_levels', 'beginner', 'intermediate', 'advanced');--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_detached_fields_valid";--> statement-breakpoint
ALTER TABLE "class_series" ADD COLUMN "level" "class_level";--> statement-breakpoint
ALTER TABLE "group_classes" ADD COLUMN "level" "class_level";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "level" "class_level";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_detached_fields_valid" CHECK ("sessions"."detached_fields" <@ ARRAY['time', 'trainer', 'capacity', 'location', 'level']::text[]);