import { type ApiDependencies, createApiHandler, NO_DEPENDENCIES } from '@trainer-hub/api';
import { locales } from '@trainer-hub/i18n';
import { describe, expect, it, vi } from 'vitest';
import { inProcessApiClient } from './api-client';
import { loadGreeting } from './greeting';

// The generated client calls the real API handler in-process, with a fake greeting reader
// instead of Postgres (greeting.integration.test.tsx reads the real row).
function api(findSystemGreeting: ApiDependencies['findSystemGreeting']) {
  const handle = createApiHandler({ ...NO_DEPENDENCIES, findSystemGreeting });
  const requests: URL[] = [];
  const client = inProcessApiClient(async (request) => {
    requests.push(new URL(request.url));
    return await handle(request);
  });
  return { client, requests };
}

describe('E018 web hello greeting through the generated client (#94)', () => {
  it.each(locales)('asks GET /api/v1/hello for the key in %s', async (locale) => {
    const { client, requests } = api(async (slug) => ({ slug, i18nKey: 'hello.title' }));

    expect(await loadGreeting(client, locale)).toEqual({ status: 'loaded', key: 'hello.title' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.pathname).toBe('/api/v1/hello');
    expect(requests[0]?.searchParams.get('locale')).toBe(locale);
  });

  it('passes on whichever key the API sends', async () => {
    const { client } = api(async (slug) => ({ slug, i18nKey: 'notFound.title' }));

    expect(await loadGreeting(client, 'en')).toEqual({ status: 'loaded', key: 'notFound.title' });
  });

  it('fails when the API answers with an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = api(async () => undefined);

    expect(await loadGreeting(client, 'en')).toEqual({ status: 'failed' });
  });

  it.each(['hello.missing', 'hello', 'hello.title.extra'])(
    'fails when the key %s is not a message in the catalog',
    async (i18nKey) => {
      const { client } = api(async (slug) => ({ slug, i18nKey }));

      expect(await loadGreeting(client, 'nl-NL')).toEqual({ status: 'failed' });
    },
  );

  it('fails, and logs why, when the call itself throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = inProcessApiClient(() => {
      throw new Error('handler crashed');
    });

    expect(await loadGreeting(client, 'en')).toEqual({ status: 'failed' });
    expect(log).toHaveBeenCalledWith(
      'Hello greeting failed:',
      expect.objectContaining({ message: 'handler crashed' }),
    );
  });
});
