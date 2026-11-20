-- The retention tasks of E014 (ticket #1181) run as the cron role, which sets no workspace context:
-- for the two business tables they delete from (closed trainer invitations, R3; access-log entries,
-- R12) it needs a policy of its own, or the forced RLS shows it no row. SELECT and DELETE only,
-- and the privileges list (`CRON_TABLE_PRIVILEGES`) grants no more than that.
CREATE POLICY "access_log_cron_select" ON "access_log" AS PERMISSIVE FOR SELECT TO "fivvi_cron" USING (true);--> statement-breakpoint
CREATE POLICY "access_log_cron_delete" ON "access_log" AS PERMISSIVE FOR DELETE TO "fivvi_cron" USING (true);--> statement-breakpoint
CREATE POLICY "trainer_invitations_cron_select" ON "trainer_invitations" AS PERMISSIVE FOR SELECT TO "fivvi_cron" USING (true);--> statement-breakpoint
CREATE POLICY "trainer_invitations_cron_delete" ON "trainer_invitations" AS PERMISSIVE FOR DELETE TO "fivvi_cron" USING (true);