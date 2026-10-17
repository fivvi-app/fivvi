/**
 * System rows every environment needs, production included. Data migrations insert them
 * (`migrations/0001_system_greeting_hello.sql`, updated by `0002_system_greeting_hello_title.sql`),
 * never the seed, because production doesn't run the seed (E003). The integration test checks
 * that the migrations and these values agree.
 */

/**
 * The greeting `GET /v1/hello` reads (#93). `hello.title` must exist in `packages/i18n`: the apps
 * render the key from their catalogs (#34).
 */
export const HELLO_GREETING = { slug: 'hello', i18nKey: 'hello.title' } as const;
