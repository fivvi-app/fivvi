/**
 * System rows every environment needs, production included. Data migrations insert them
 * (`migrations/0001_system_greeting_hello.sql`), never the seed, because production doesn't
 * run the seed (E003). The integration test checks that the migration and these values agree.
 */

/** The greeting the M1 "hello" slice reads. `system.hello` must exist in `packages/i18n`. */
export const HELLO_GREETING = { slug: 'hello', i18nKey: 'system.hello' } as const;
