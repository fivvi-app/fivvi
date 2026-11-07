import { createApiHandler, NO_DEPENDENCIES } from '@fivvi/api';
import {
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  findSystemGreeting,
  systemGreetings,
} from '@fivvi/database';
import { type Locale, locales } from '@fivvi/i18n';
import { cloneTemplateDatabase, type TestDatabase, withRollback } from '@fivvi/testing/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inProcessApiClient } from './api-client';

/** What the generated client reads from `GET /v1/hello`, with the API reading through `db`. */
async function greetingKey(db: DatabaseExecutor, locale: Locale): Promise<string | undefined> {
  const handler = createApiHandler({
    ...NO_DEPENDENCIES,
    findSystemGreeting: (slug) => findSystemGreeting(db, slug),
  });
  const { data } = await inProcessApiClient(handler).GET('/v1/hello', {
    params: { query: { locale } },
  });
  return data?.greetingKey;
}

// Server components read the API through this client (#94). It started as the hello page's test,
// which F064 (#637) removed with the page; the API route and its row stay.
describe('E018 the in-process client follows the database (#94)', () => {
  let database: TestDatabase;
  let client: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    client = createDatabase({ url: database.url, maxConnections: 2 });
  });

  afterAll(async () => {
    await client?.close();
    await database?.drop();
  });

  it.each(locales)(
    'reads the hello row’s key, and a new key once the row changes, in %s',
    async (locale) => {
      await withRollback(client.db, async (tx) => {
        expect(await greetingKey(tx, locale)).toBe('hello.title');

        // The migrated hello row is the only system greeting.
        await tx.update(systemGreetings).set({ i18nKey: 'notFound.title' });

        expect(await greetingKey(tx, locale)).toBe('notFound.title');
      });
    },
  );
});
