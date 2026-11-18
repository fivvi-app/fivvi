import { cspNonce, policyDirective } from '../test/security-headers';
import { expect, test } from './fixtures';

// E013 AC8 and AC9 in the browser: every page carries a Content-Security-Policy with a nonce of its
// own, Next.js puts that nonce on every inline script, and the fixture every spec uses
// (e2e/fixtures.ts, `cspViolations`) fails a test on any `securitypolicyviolation`. The projects
// run these once in Dutch and once in English. The page loads are the check that nothing the app
// loads (scripts, styles, images, the page view and error reports) breaks under the policy; the
// other specs run under the same fixture.

/** Pages of every kind: the website in both languages, sign-in, a booking page, an unknown address. */
const PAGES = [
  ['the Dutch home page of the public website', '/'],
  ['an English page of the public website', '/en'],
  ['a legal page of the public website', '/privacy'],
  ['the sign-in page', '/login'],
  ['a public booking page', '/book/no-such-gym'],
  ['an address that matches no page (the 404)', '/book/no-such-gym/no/such/page'],
] as const;

/** The `<script>` tags of a page's HTML that run code: not data blocks such as JSON-LD. */
function executableScripts(html: string): string[] {
  return (html.match(/<script\b[^>]*>/g) ?? []).filter(
    (tag) => !/\btype="(application\/ld\+json|application\/json|importmap)"/.test(tag),
  );
}

test.describe('E013 AC8 the policy of a page', () => {
  for (const [name, path] of PAGES) {
    test(`${name} has a nonce that is on every script of its HTML`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      const nonce = cspNonce(response.headers());
      const html = await response.text();

      expect(nonce).toBeDefined();
      const scripts = executableScripts(html);
      expect(scripts.length).toBeGreaterThan(0);
      for (const tag of scripts)
        expect(tag, 'a script without the nonce').toContain(`nonce="${nonce}"`);
    });

    test(`${name} loads in the browser without a violation, its inline scripts running with the nonce`, async ({
      page,
      cspViolations,
    }) => {
      const response = await page.goto(path);
      const nonce = cspNonce(response?.headers() ?? {});

      // The page is hydrated: the framework's inline scripts ran, and every one has this
      // request's nonce (the browser hides the attribute after parsing, not the property).
      await page.waitForLoadState('networkidle');
      const inline = await page.evaluate(() =>
        [...document.scripts]
          .filter((script) => !script.src && script.type !== 'application/ld+json')
          .map((script) => script.nonce),
      );
      expect(inline.length).toBeGreaterThan(0);
      expect(new Set(inline)).toEqual(new Set([nonce]));
      expect(cspViolations.all()).toEqual([]);
    });
  }

  test('differs per request, and is the one in the page the request got', async ({ request }) => {
    const first = await request.get('/en');
    const second = await request.get('/en');

    expect(cspNonce(first.headers())).toBeDefined();
    expect(cspNonce(first.headers())).not.toBe(cspNonce(second.headers()));
    expect(await first.text()).not.toContain(cspNonce(second.headers()) ?? 'no nonce');
  });

  test('allows no eval, no framing and nobody but the app and Turnstile', async ({ request }) => {
    const policy = (await request.get('/login')).headers()['content-security-policy'] ?? '';

    expect(policy).not.toContain('unsafe-eval');
    expect(policyDirective(policy, 'frame-ancestors')).toEqual(["'none'"]);
    expect(policyDirective(policy, 'script-src')).toContain('https://challenges.cloudflare.com');
    expect(policyDirective(policy, 'connect-src')).toEqual([
      "'self'",
      'https://challenges.cloudflare.com',
    ]);
  });
});

// AC9 only means something when the fixture is proven to catch a violation.
test.describe('E013 AC9 the violation fixture', () => {
  const POLICY = "default-src 'self'; script-src 'self' 'nonce-e2e-probe-nonce'";
  const PROBE = '/e2e-csp-probe';

  test('catches an inline script without the nonce, and lets one with the nonce run', async ({
    page,
    cspViolations,
  }) => {
    await page.route(`**${PROBE}`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        headers: { 'content-security-policy': POLICY },
        body: `<!doctype html><html lang="en"><head><title>Probe</title></head><body><main>
          <p id="with">waiting</p><p id="without">waiting</p>
          <script nonce="e2e-probe-nonce">document.getElementById('with').textContent = 'ran';</script>
          <script>document.getElementById('without').textContent = 'ran';</script>
        </main></body></html>`,
      }),
    );

    await page.goto(PROBE);

    await expect(page.locator('#with')).toHaveText('ran');
    // The browser blocked the script without the nonce, and the fixture saw it.
    await expect(page.locator('#without')).toHaveText('waiting');
    await expect.poll(() => cspViolations.all().length).toBe(1);
    expect(cspViolations.all()[0]).toMatchObject({
      directive: 'script-src-elem',
      blocked: 'inline',
      page: expect.stringContaining(PROBE),
    });
    // This test expected it: take it out, or the fixture would fail the test at its end.
    expect(cspViolations.drain()).toHaveLength(1);
  });

  test('catches a violation in a context the test opens itself', async ({
    browser,
    baseURL,
    cspViolations,
  }) => {
    const other = await browser.newContext({ baseURL });
    const otherPage = await other.newPage();
    await otherPage.route(`**${PROBE}`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        headers: { 'content-security-policy': POLICY },
        body: '<!doctype html><html lang="en"><head><title>Probe</title></head><body><main><script>1</script></main></body></html>',
      }),
    );

    await otherPage.goto(PROBE);

    await expect.poll(() => cspViolations.all().length).toBe(1);
    await other.close();
    expect(cspViolations.drain()).toHaveLength(1);
  });

  test('stays quiet on a page without a violation', async ({ page, cspViolations }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    expect(cspViolations.all()).toEqual([]);
  });
});
