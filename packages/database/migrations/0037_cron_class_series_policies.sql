-- The daily task that keeps class series 12 weeks ahead (F022, ticket #453) runs as the cron role,
-- which sets no workspace context: for the three business tables it touches it needs a policy of
-- its own, or the forced RLS shows it no row. It reads every series and moves `materialized_until`
-- forward (`class_series`), adds the missing dates (INSERT on `sessions`, no read of them) and reads
-- the key columns of the default location it gives them (`locations`). The privileges list
-- (`CRON_TABLE_PRIVILEGES`, `CRON_SELECT_COLUMNS`, `CRON_UPDATE_COLUMNS`) grants no more than that.
CREATE POLICY "locations_cron_select" ON "locations" AS PERMISSIVE FOR SELECT TO "fivvi_cron" USING (true);--> statement-breakpoint
CREATE POLICY "sessions_cron_insert" ON "sessions" AS PERMISSIVE FOR INSERT TO "fivvi_cron" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "class_series_cron_select" ON "class_series" AS PERMISSIVE FOR SELECT TO "fivvi_cron" USING (true);--> statement-breakpoint
CREATE POLICY "class_series_cron_update" ON "class_series" AS PERMISSIVE FOR UPDATE TO "fivvi_cron" USING (true) WITH CHECK (true);