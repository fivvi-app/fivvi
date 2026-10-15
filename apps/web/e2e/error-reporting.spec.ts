import { expect, test } from './fixtures';

// E009 (spec #32). The e2e build has no NEXT_PUBLIC_SENTRY_DSN and no SENTRY_AUTH_TOKEN, as
// in CI and local development.
test.describe('E009 web error reporting', () => {
  test('AC2: source maps are not downloadable from the web app', async ({
    page,
    request,
    messages: copy,
  }) => {
    const scripts: string[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script') scripts.push(response.url());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: copy.hello.title })).toBeVisible();

    const maps: string[] = [];
    for (const script of scripts.filter((url) => url.includes('/_next/static/'))) {
      const body = await (await request.get(script)).text();
      const reference = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(body)?.[1];
      if (reference) maps.push(new URL(reference, script).href);
    }

    // The build makes maps (next.config.ts), so the bundles point at them; they must be gone.
    expect(maps.length).toBeGreaterThan(0);
    for (const map of maps) {
      expect((await request.get(map)).status(), map).toBe(404);
    }
  });

  test('AC5: without a DSN, the browser sends nothing to Sentry', async ({
    page,
    baseURL,
    messages: copy,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: copy.hello.title })).toBeVisible();

    // An uncaught error, which would be reported if a DSN were set.
    const uncaught = page.waitForEvent('pageerror');
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('E009 e2e: uncaught test error');
      });
    });
    await uncaught;

    // Every request stays on the app's own origin: none to Sentry, none to anyone else.
    const origin = new URL(baseURL ?? '').origin;
    const external = requests.filter(
      (url) => url.startsWith('http') && new URL(url).origin !== origin,
    );
    expect(external).toEqual([]);
  });
});
