-- Data migration (F005, AC2 and AC3): give the trainer profile to the team members that exist
-- before trainer profiles do. Every environment that already has workspaces needs it (the
-- persistent development environment now, production later); an empty database does nothing.
-- Idempotent: team_member_id is unique, so a second run inserts nothing, and a profile an Owner
-- switched off after this ran is not brought back because the migration runs once per database.

-- AC2: a Trainer always has a profile.
INSERT INTO "trainer_profiles" ("organization_id", "team_member_id")
SELECT "organization_id", "id"
FROM "team_members"
WHERE "role" = 'trainer'
ON CONFLICT ("team_member_id") DO NOTHING;
--> statement-breakpoint
-- AC3: the creator of a workspace starts with a profile. A workspace does not record its creator,
-- but F002's create transaction inserts the workspace and its first Owner together, so in Postgres
-- both rows get the same created_at (now() is the transaction's start). The Owner whose created_at
-- equals the workspace's is the creator. A creator who was removed (F003) or demoted before this
-- runs gets nobody in their place: a later Owner is not a creator and has no profile.
INSERT INTO "trainer_profiles" ("organization_id", "team_member_id")
SELECT tm."organization_id", tm."id"
FROM "team_members" tm
JOIN "organizations" o ON o."id" = tm."organization_id"
WHERE tm."role" = 'owner' AND tm."created_at" = o."created_at"
ON CONFLICT ("team_member_id") DO NOTHING;
