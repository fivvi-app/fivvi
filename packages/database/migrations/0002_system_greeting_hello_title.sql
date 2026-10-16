-- Data migration: the hello greeting's key becomes `hello.title`, the key the hello screens render from their catalogs
-- (#34, #93). `system.hello` (0001) is in no catalog. Only the original key is replaced, so it is safe to re-run.
-- Must match HELLO_GREETING in src/system-data.ts (the integration test checks it).
UPDATE "system_greetings"
SET "i18n_key" = 'hello.title'
WHERE "slug" = 'hello' AND "i18n_key" = 'system.hello';
