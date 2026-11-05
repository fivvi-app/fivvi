-- Two narrow doors into trainer_invitations for a person who is not on the team yet (F011, spec
-- #422). Like the tenant context functions of 0007 they read a transaction-local setting, return
-- NULL when it is unset (a comparison with NULL matches no row) and run as their caller. Only the
-- invitation repositories set them: the token hash from the link of an invitation, and the address
-- the sign-in gate asks about. Both policies are read-only.
CREATE FUNCTION app_invitation_token_hash() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.invitation_token_hash', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app_invitation_email() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.invitation_email', true), '') $$;
--> statement-breakpoint
CREATE POLICY "trainer_invitations_by_token" ON "trainer_invitations" AS PERMISSIVE FOR SELECT TO "fivvi_app" USING ("trainer_invitations"."token_hash" = app_invitation_token_hash());--> statement-breakpoint
CREATE POLICY "trainer_invitations_by_email" ON "trainer_invitations" AS PERMISSIVE FOR SELECT TO "fivvi_app" USING ("trainer_invitations"."email" = app_invitation_email());
