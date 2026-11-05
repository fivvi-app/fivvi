import { expect, test } from './fixtures';
import { analyticsServer, TEST_ANDROID_CERT_SHA256, TEST_APPLE_TEAM_ID } from './servers';

// The real server and its route guard, with no session (E017 AC5). Locale does not matter, so
// the files are checked in one project only.
test.describe('E017 AC5 app-link files', () => {
  test.skip(({ appLocale }) => appLocale !== 'nl-NL', 'the files do not depend on the language');

  test('are served to anyone, as JSON and without a redirect, where they are configured', async ({
    request,
  }) => {
    const apple = await request.get('/.well-known/apple-app-site-association', {
      maxRedirects: 0,
    });
    expect(apple.status()).toBe(200);
    expect(apple.headers()['content-type']).toMatch(/^application\/json/);
    expect(await apple.json()).toEqual({
      applinks: {
        details: [
          {
            appIDs: [`${TEST_APPLE_TEAM_ID}.app.fivvi`],
            components: [{ '/': '/j/*' }, { '/': '/i/*' }],
          },
        ],
      },
    });

    const android = await request.get('/.well-known/assetlinks.json', { maxRedirects: 0 });
    expect(android.status()).toBe(200);
    expect(android.headers()['content-type']).toMatch(/^application\/json/);
    expect(await android.json()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'app.fivvi',
          sha256_cert_fingerprints: [TEST_ANDROID_CERT_SHA256],
        },
      },
    ]);
  });

  test('answer 404 where they are not configured, as on a preview', async ({ request }) => {
    for (const path of [
      '/.well-known/apple-app-site-association',
      '/.well-known/assetlinks.json',
    ]) {
      const response = await request.get(`${analyticsServer.baseURL}${path}`, { maxRedirects: 0 });
      expect(response.status()).toBe(404);
    }
  });
});
