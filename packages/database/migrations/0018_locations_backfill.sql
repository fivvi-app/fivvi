-- Data migration (F015, AC3): give every workspace that exists before locations do its one
-- location, named after the workspace, of the type organization_location, without an address and
-- marked as the default. Every environment that already has workspaces needs it (the persistent
-- development environment now, production later); an empty database does nothing.
-- Idempotent: only a workspace without a default location gets one, so a second run inserts
-- nothing (and the unique index on the default would refuse a second one anyway).
INSERT INTO "locations" ("organization_id", "name", "type", "is_default")
SELECT o."id", o."name", 'organization_location', true
FROM "organizations" o
WHERE NOT EXISTS (
	SELECT 1 FROM "locations" l WHERE l."organization_id" = o."id" AND l."is_default"
);
