-- Data migration: the greeting the M1 "hello" slice reads. It is system data that every
-- environment needs, including production, which never runs the seed (E003).
-- Must match HELLO_GREETING in src/system-data.ts (the integration test checks it).
INSERT INTO "system_greetings" ("slug", "i18n_key")
VALUES ('hello', 'system.hello')
ON CONFLICT ("slug") DO NOTHING;
