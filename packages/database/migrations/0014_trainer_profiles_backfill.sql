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
-- but F002's create transaction makes the creator the first Owner, so the earliest Owner of each
-- workspace (by created_at, then id) is the creator.
INSERT INTO "trainer_profiles" ("organization_id", "team_member_id")
SELECT DISTINCT ON ("organization_id") "organization_id", "id"
FROM "team_members"
WHERE "role" = 'owner'
ORDER BY "organization_id", "created_at", "id"
ON CONFLICT ("team_member_id") DO NOTHING;
