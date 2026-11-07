import { createApiHandler, NO_DEPENDENCIES } from '@fivvi/api';
import { locales } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { inProcessApiClient } from './api-client';

// The generated client calls the real API handler in-process, with a fake greeting reader instead
// of Postgres. Server components read the API this way (#94).
describe('E018 the generated client calls the API in-process (#94)', () => {
  it.each(locales)(
    'sends GET /api/v1/hello with the query in %s and reads the answer',
    async (locale) => {
      const requests: URL[] = [];
      const handle = createApiHandler({
        ...NO_DEPENDENCIES,
        findSystemGreeting: async (slug) => ({ slug, i18nKey: 'hello.title' }),
      });
      const client = inProcessApiClient(async (request) => {
        requests.push(new URL(request.url));
        return await handle(request);
      });

      const { data } = await client.GET('/v1/hello', { params: { query: { locale } } });

      expect(data?.greetingKey).toBe('hello.title');
      expect(requests).toHaveLength(1);
      expect(requests[0]?.pathname).toBe('/api/v1/hello');
      expect(requests[0]?.searchParams.get('locale')).toBe(locale);
    },
  );

  it('hands back the error of the API instead of throwing', async () => {
    const handle = createApiHandler({
      ...NO_DEPENDENCIES,
      findSystemGreeting: async () => undefined,
    });
    const client = inProcessApiClient(handle);

    const { data, error } = await client.GET('/v1/hello', { params: { query: { locale: 'en' } } });

    expect(data).toBeUndefined();
    expect(error).toBeDefined();
  });
});
