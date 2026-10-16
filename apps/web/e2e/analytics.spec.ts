import { gunzipSync } from 'node:zlib';
import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';
import { analyticsServer, TEST_POSTHOG_HOST, TEST_POSTHOG_KEY } from './servers';

// E009 (spec #32): cookieless page views. The configured PostHog host (POSTHOG_HOST) is
// intercepted, so nothing reaches the real network; every other external request, PostHog's
// own hosts included, is aborted and reported.

/** A string in posthog-js itself, so a test can tell whether the SDK was loaded. */
const POSTHOG_JS = '[PostHog.js]';
// Synthetic personal data only (AGENTS.md, D8), in the query string and the fragment.
const FIRST_NAME = 'Anna';
const EMAIL = 'anna.devries@example.com';
const PERSONAL = [FIRST_NAME, 'Bram', 'devries', 'example.com', 'notes'];

interface SentEvent {
  event: string;
  properties: Record<string, unknown>;
}

test.describe('E009 page views', () => {
  test.use({ baseURL: analyticsServer.baseURL });

  test('AC6: one cookieless pageview without query string, no cookies or storage', async ({
    page,
    context,
    messages: copy,
  }) => {
    const storageWrites: string[] = [];
    await page.exposeFunction(REPORT_STORAGE_WRITE, (write: string) => storageWrites.push(write));
    await page.addInitScript(recordStorageWrites, REPORT_STORAGE_WRITE);
    await page.addInitScript(poseAsVisitor);
    const traffic = await interceptTraffic(page);

    await page.goto(`/?name=${FIRST_NAME}&email=${encodeURIComponent(EMAIL)}#notes`);
    await expect(page.getByRole('heading', { level: 1, name: copy.hello.title })).toBeVisible();
    await expect.poll(() => traffic.events.length).toBe(1);

    // Typing, clicking and submitting the form: autocapture would report each of these. The
    // submission loads the page again, with a new name in the query string.
    await page.getByLabel(copy.hello.firstNameLabel).fill('Bram');
    await page.getByRole('button', { name: copy.hello.continue }).click();
    await expect(page.getByRole('status')).toHaveText(
      copy.hello.formGreeting.replace('{name}', 'Bram'),
    );
    await expect.poll(() => traffic.events.length).toBe(2);
    await page.waitForLoadState('networkidle');

    // Exactly one $pageview per page load, and nothing else: no autocapture, page leave,
    // web vitals, session recording or survey events.
    expect(traffic.events.map(({ event }) => event)).toEqual(['$pageview', '$pageview']);
    for (const { properties } of traffic.events) {
      expect(properties).toMatchObject({
        token: TEST_POSTHOG_KEY,
        $current_url: `${analyticsServer.baseURL}/`,
        $pathname: '/',
        $cookieless_mode: true,
      });
      for (const value of PERSONAL) expect(JSON.stringify(properties)).not.toContain(value);
    }
    // Only events reach PostHog: no remote config, feature flags, surveys or recorder script.
    expect(traffic.posthogPaths).toEqual(['/e/', '/e/']);
    expect(traffic.external).toEqual([]);
    expect(traffic.pageErrors).toEqual([]);
    expect(await loadedScriptsContain(page, traffic.scripts, POSTHOG_JS)).toBe(true);

    // Cookieless: no cookie and nothing in browser storage. The only write on each page load is
    // posthog-js checking, at start-up, whether localStorage works: it writes a fixed test value
    // and removes it at once (OBSERVABILITY.md §5), so storage is empty below. Any other write
    // fails here.
    const probe = 'localStorage __mplssupport__';
    expect(storageWrites).toEqual([probe, probe]);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
});

test.describe('E009 page views without a key', () => {
  test('AC5: no PostHog script or request is made and nothing fails', async ({
    page,
    messages: copy,
  }) => {
    const traffic = await interceptTraffic(page);

    await page.goto(`/?name=${FIRST_NAME}`);
    await expect(page.getByRole('heading', { level: 1, name: copy.hello.title })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(traffic.posthogPaths).toEqual([]);
    expect(traffic.external).toEqual([]);
    expect(traffic.pageErrors).toEqual([]);
    expect(traffic.scripts.length).toBeGreaterThan(0);
    expect(await loadedScriptsContain(page, traffic.scripts, POSTHOG_JS)).toBe(false);
  });
});

/**
 * Answers PostHog's event endpoint and records what it receives, aborts every other request
 * that leaves the app's origin, and collects the scripts the page loads and its errors.
 */
async function interceptTraffic(page: Page) {
  const traffic = {
    events: [] as SentEvent[],
    posthogPaths: [] as string[],
    external: [] as string[],
    scripts: [] as string[],
    pageErrors: [] as string[],
  };
  const isExternal = (url: URL) => url.protocol.startsWith('http') && url.hostname !== 'localhost';

  page.on('pageerror', (error) => traffic.pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.resourceType() === 'script' && !isExternal(url)) traffic.scripts.push(url.href);
    if (url.origin === TEST_POSTHOG_HOST) {
      traffic.posthogPaths.push(url.pathname);
      traffic.events.push(...sentEvents(request));
    } else if (isExternal(url)) {
      traffic.external.push(url.href);
    }
  });
  await page.route(`${TEST_POSTHOG_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' }),
  );
  await page.route(
    (url) => isExternal(url) && url.origin !== TEST_POSTHOG_HOST,
    (route) => route.abort(),
  );
  return traffic;
}

/** The events in a request to PostHog: a gzipped `{ api_key, batch }` envelope. */
function sentEvents(request: Request): SentEvent[] {
  const body = request.postDataBuffer();
  if (!body) return [];
  const gzipped = body[0] === 0x1f && body[1] === 0x8b;
  const sent: { batch?: SentEvent[] } = JSON.parse(
    (gzipped ? gunzipSync(body) : body).toString('utf8'),
  );
  return sent.batch ?? [sent as SentEvent];
}

async function loadedScriptsContain(page: Page, scripts: string[], text: string) {
  for (const script of new Set(scripts)) {
    if ((await (await page.request.get(script)).text()).includes(text)) return true;
  }
  return false;
}

/**
 * posthog-js drops every event from a browser that looks automated (`navigator.webdriver`, a
 * `HeadlessChrome` brand). The test browser poses as a visitor's.
 */
function poseAsVisitor() {
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
}

const REPORT_STORAGE_WRITE = 'reportStorageWrite';

/**
 * Runs in the page before any of its scripts, on every page load: reports every cookie and
 * Web Storage write to the test through the function exposed as `report`.
 */
function recordStorageWrites(report: string) {
  const send = (write: string) =>
    (window as unknown as Record<string, (write: string) => void>)[report]?.(write);
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    send(`${this === localStorage ? 'localStorage' : 'sessionStorage'} ${key}`);
    setItem.call(this, key, value);
  };
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => cookie?.get?.call(document),
    set: (value: string) => {
      send(`cookie ${value.split('=')[0]}`);
      cookie?.set?.call(document, value);
    },
  });
}
