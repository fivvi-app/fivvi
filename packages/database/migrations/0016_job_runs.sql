CREATE TYPE "public"."job_run_outcome" AS ENUM('succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"task_name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"outcome" "job_run_outcome" NOT NULL,
	"message" text,
	CONSTRAINT "job_runs_message_length" CHECK ("job_runs"."message" is null or char_length("job_runs"."message") <= 200)
);
--> statement-breakpoint
CREATE INDEX "job_runs_task_name_started_at_idx" ON "job_runs" USING btree ("task_name","started_at");--> statement-breakpoint
CREATE INDEX "job_runs_started_at_idx" ON "job_runs" USING btree ("started_at");