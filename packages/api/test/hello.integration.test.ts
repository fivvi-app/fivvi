import { z } from '@hono/zod-openapi';
import {
  createDatabase,
  type DatabaseClient,
  type DatabaseExecutor,
  findSystemGreeting,
  HELLO_GREETING,
  systemGreetings,
} from '@trainer-hub/database';
import { createCaptureTransport, createErrorReporter } from '@trainer-hub/observability';
import {
  cloneTemplateDatabase,
  type TestDatabase,
  withRollback,
} from '@trainer-hub/testing/database';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type ApiDependencies,
  createApp,
  HelloResponseSchema,
  NO_DEPENDENCIES,
} from '../src/index.ts';

const StrictHelloResponse = z.strictObject(HelloResponseSchema.shape);

/** The app as apps/web wires it, reading through `db` (here: the test's transaction). */
function appReading(db: DatabaseExecutor, dependencies: Partial<ApiDependencies> = {}) {
  return createApp({
    ...NO_DEPENDENCIES,
    findSystemGreeting: (slug) => findSystemGreeting(db, slug),
    ...dependencies,
  });
}

describe('E008 GET /v1/hello reads the greeting from system_greetings (#93)', () => {
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

  it.each(['nl-NL', 'en'] as const)('returns the key stored for hello in %s', async (locale) => {
    await withRollback(client.db, async (tx) => {
      const res = await appReading(tx).request(`/v1/hello?locale=${locale}`);

      expect(res.status).toBe(200);
      expect(StrictHelloResponse.parse(await res.json())).toEqual({
        greetingKey: HELLO_GREETING.i18nKey,
        locale,
      });
    });
  });

  it('follows the hello row: changing its key changes the response', async () => {
    await withRollback(client.db, async (tx) => {
      // The migrated hello row is the only system greeting.
      await tx.update(systemGreetings).set({ i18nKey: 'system.helloAgain' });

      const res = await appReading(tx).request('/v1/hello?locale=en');

      expect(res.status).toBe(200);
      expect(StrictHelloResponse.parse(await res.json())).toEqual({
        greetingKey: 'system.helloAgain',
        locale: 'en',
      });
    });
  });

  it('rejects an unsupported locale with a validation error', async () => {
    await withRollback(client.db, async (tx) => {
      const res = await appReading(tx).request('/v1/hello?locale=de-DE');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        code: 'validation_failed',
        issues: [{ path: 'locale', code: 'invalid_value' }],
      });
    });
  });

  it('a missing hello row gives the documented 500 and is reported, never a key', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createCaptureTransport();
    const errorReporter = createErrorReporter({
      env: { SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1' },
      transport,
    });

    await withRollback(client.db, async (tx) => {
      await tx.delete(systemGreetings);

      const res = await appReading(tx, { errorReporter }).request('/v1/hello?locale=en');
      await errorReporter.flush();

      expect(res.status).toBe(500);
      expect(await res.text()).toBe('Internal Server Error');
      expect(log).toHaveBeenCalledOnce();
      expect(transport.events).toHaveLength(1);
      expect(transport.events[0]).toMatchObject({ tags: { route: '/v1/hello' } });
    });
  });
});
