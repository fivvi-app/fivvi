import { createApiHandler, NO_DEPENDENCIES } from '@trainer-hub/api';
import {
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  findSystemGreeting,
  systemGreetings,
} from '@trainer-hub/database';
import { type Locale, locales, messages } from '@trainer-hub/i18n';
import {
  cloneTemplateDatabase,
  type TestDatabase,
  withRollback,
} from '@trainer-hub/testing/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Hello } from '../app/hello';
import { render } from '../test/render';
import { inProcessApiClient } from './api-client';
import { loadGreeting } from './greeting';

/** The hello page as the server renders it, with the API reading through `db`. */
async function helloPage(db: DatabaseExecutor, locale: Locale): Promise<string> {
  const handler = createApiHandler({
    ...NO_DEPENDENCIES,
    findSystemGreeting: (slug) => findSystemGreeting(db, slug),
  });
  const greeting = await loadGreeting(inProcessApiClient(handler), locale);
  return render(locale, <Hello greeting={greeting} firstName="" />);
}

describe('E018 web hello page follows the database (#94)', () => {
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
    'renders the hello row’s key, and a new key once the row changes, in %s',
    async (locale) => {
      await withRollback(client.db, async (tx) => {
        expect(await helloPage(tx, locale)).toContain(`<h1>${messages[locale].hello.title}</h1>`);

        // The migrated hello row is the only system greeting.
        await tx.update(systemGreetings).set({ i18nKey: 'notFound.title' });

        const html = await helloPage(tx, locale);
        expect(html).toContain(`<h1>${messages[locale].notFound.title}</h1>`);
        expect(html).not.toContain(messages[locale].hello.title);
      });
    },
  );
});
