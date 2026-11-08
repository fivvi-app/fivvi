import { robotsHeader, robotsTxt } from '../site/indexing';
import { rootMetadata } from '../site/metadata';
import { type SitePage, sitePagePath } from '../site/routes';
import { BUDGET_ROW_ANNOTATION, type BudgetRow, MAX_CLS, MAX_LCP_MS } from '../test/budgets';
import { type CpuCalibration, calibrateCpuSlowdown } from '../test/lighthouse-cpu';
import { expect, test } from './fixtures';
import { type GoLiveProxy, PRODUCTION, robotsFile, startGoLiveProxy } from './go-live-proxy';
import {
  auditPage,
  type BudgetBrowser,
  type ColorScheme,
  launchBudgetBrowser,
  type PageAudit,
} from './lighthouse';

// F064 AC15 (#645): the speed and search budgets of the homepage and the four audience pages, on
// Lighthouse's phone profile (a Moto G Power on slow 4G, simulated), in light and dark, in the
// language of the project. A page passes with a largest contentful paint under 2.5 s, a layout
// shift under 0.1, a score of 100 for SEO and accessibility, and images that are sized, responsive
// and in a modern format. The numbers are annotations of each test, and the reporter prints them as
// a table at the end (e2e/budgets-reporter.ts).
//
// The run measures the local build, or a deployed site (`BUDGETS_BASE_URL`, playwright.config.ts: no
// local server and no database then). The go-live proxy sits in front of either.
//
// SEO is measured as it will be at go-live without turning the switch on: the e2e server says
// `noindex`, like every environment but production until #648 (site/routes.ts, `siteIndexable`),
// and the proxy in front of it shows what production sends once the switch is on
// (e2e/go-live-proxy.ts). The switch stays off in the code.
const PAGES: readonly SitePage[] = ['home', 'gyms', 'studios', 'personalTrainers', 'clients'];
const SCHEMES: readonly ColorScheme[] = ['light', 'dark'];

/**
 * A run on a busy machine is slower, never faster, so a page that is over a budget is measured again
 * and its best run counts. A page that is really too slow is over in every run. SEO and
 * accessibility do not vary between runs.
 */
const MAX_ATTEMPTS = 3;

async function measure(
  url: string,
  port: number,
  cpuSlowdownMultiplier: number,
): Promise<PageAudit & { attempts: number; runsLcpMs: number[] }> {
  let best: PageAudit | undefined;
  const runsLcpMs: number[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const audit = await auditPage(url, port, cpuSlowdownMultiplier);
    runsLcpMs.push(audit.lcpMs);
    if (!best || audit.lcpMs < best.lcpMs) best = audit;
    if (best.lcpMs < MAX_LCP_MS && best.cls < MAX_CLS) {
      return { ...best, attempts: attempt, runsLcpMs };
    }
  }
  if (!best) throw new Error(`No Lighthouse run for ${url}`);
  return { ...best, attempts: MAX_ATTEMPTS, runsLcpMs };
}

// A page takes 6 to 12 seconds, up to three runs of it at most; a Lighthouse or Chrome that hangs
// fails the test after two minutes (and says so) instead of eating the CI job.
test.describe.configure({ mode: 'default', timeout: 120_000 });

test.describe('F064 AC15 speed and search budgets', () => {
  let proxy: GoLiveProxy;
  const browsers = new Map<ColorScheme, BudgetBrowser>();
  // The CPU of the emulated phone, calibrated to this host once per project (lighthouse-cpu.ts).
  let cpu: CpuCalibration & { hostBenchmarkIndex: number };

  test.beforeAll(async ({ baseURL }) => {
    // A preview that is gone or still deploying answers with an error page: say so, instead of
    // failing on whatever the first test finds in it.
    const health = await fetch(`${baseURL}/api/v1/health`).catch(() => undefined);
    if (!health?.ok) {
      throw new Error(
        `${baseURL} is not up: ${baseURL}/api/v1/health answered ${health?.status ?? 'nothing'}`,
      );
    }
    proxy = await startGoLiveProxy(baseURL ?? '');
    for (const scheme of SCHEMES) browsers.set(scheme, await launchBudgetBrowser(scheme));
    const light = browsers.get('light');
    if (!light) throw new Error('No light browser');
    const hostBenchmarkIndex = await light.benchmarkIndex();
    cpu = { ...calibrateCpuSlowdown(hostBenchmarkIndex), hostBenchmarkIndex };
  });

  test.afterAll(async () => {
    await Promise.all([...browsers.values()].map((browser) => browser.close()));
    await proxy.close();
  });

  // The measure is only as good as the view it measures: this one changes what production changes
  // with the switch on, and nothing else.
  test('the go-live view differs from the server only in what the switch decides', async ({
    baseURL,
    appLocale,
  }) => {
    const path = sitePagePath('pricing', appLocale);
    const direct = await fetch(`${baseURL}${path}`);
    const viaProxy = await fetch(`${proxy.origin}${path}`);
    const [directHtml, proxyHtml] = [await direct.text(), await viaProxy.text()];

    // The server says noindex, in the header and in the markup (the logic is `rootMetadata(false)`).
    expect(rootMetadata(false).robots).toEqual({ index: false, follow: false });
    expect(direct.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(directHtml).toContain('<meta name="robots" content="noindex, nofollow"/>');
    // Production with the switch on sends no robots tag at all (`rootMetadata(true)` is `{}`) and no
    // header: the view does the same, and points the canonical URL at itself.
    expect(rootMetadata(true).robots).toBeUndefined();
    expect(viaProxy.headers.get('x-robots-tag')).toBeNull();
    expect(proxyHtml).not.toMatch(/noindex|name="robots"|\\"robots\\"/);
    expect(proxyHtml).toContain(
      `<link rel="canonical" href="${proxy.origin}${path === '/' ? '/' : path}"`,
    );
    // Nothing else is different: the server's page without its robots tag, in the head and in the
    // data the head is built from again, is the proxy's page.
    expect(
      proxyHtml.replaceAll(proxy.origin, 'https://fivvi.app'),
      'the proxy changes nothing but the robots tag and the address',
    ).toBe(
      directHtml
        .replace('<meta name="robots" content="noindex, nofollow"/>', '')
        .replace(/\[\\"\$\\",\\"meta\\",\\"\d+\\",\{\\"name\\":\\"robots\\",[^}]*\}\],/g, ''),
    );
    // robots.txt is the one production serves with the switch on: the site allowed, the sitemap named.
    const robots = await (await fetch(`${proxy.origin}/robots.txt`)).text();
    expect(robots).toBe(`User-Agent: *\nAllow: /\n\nSitemap: ${proxy.origin}/sitemap.xml\n`);
    // ... written as the server writes the rules of its own `robots.ts` route: here, disallow all.
    expect(await (await fetch(`${baseURL}/robots.txt`)).text()).toBe(
      robotsFile(robotsTxt({}, false)),
    );
    // The page is still the server's: the proxy adds nothing to a response that is not a page.
    const image = '/site-images/scenes/gym-400.avif';
    const [rawImage, proxiedImage] = await Promise.all([
      fetch(`${baseURL}${image}`).then((r) => r.arrayBuffer()),
      fetch(`${proxy.origin}${image}`).then((r) => r.arrayBuffer()),
    ]);
    expect(Buffer.from(proxiedImage).equals(Buffer.from(rawImage))).toBe(true);
  });

  for (const scheme of SCHEMES) {
    for (const page of PAGES) {
      test(`${page} in ${scheme} mode stays within the budgets`, async ({
        appLocale,
      }, testInfo) => {
        const path = sitePagePath(page, appLocale);
        // The measure is only worth something when production would index this very page.
        expect(
          robotsHeader(path, PRODUCTION, true),
          `production would not index ${path} once the switch is on`,
        ).toBeUndefined();
        const browser = browsers.get(scheme);
        if (!browser) throw new Error(`No ${scheme} browser`);

        const audit = await measure(`${proxy.origin}${path}`, browser.port, cpu.multiplier);

        // The numbers are in the report (annotations), so a run shows the room the budget leaves,
        // and the host they were measured on.
        testInfo.annotations.push({
          type: `AC15 ${appLocale} ${scheme} ${path} CPU`,
          description:
            `host benchmarkIndex ${Math.round(cpu.hostBenchmarkIndex)} (run ${Math.round(audit.benchmarkIndex)}), ` +
            `cpuSlowdownMultiplier ${cpu.multiplier.toFixed(2)} ` +
            `(range ${cpu.range[0].toFixed(1)}-${cpu.range[1].toFixed(1)})` +
            (cpu.tooSlow ? ', host too slow to emulate the target phone' : ''),
        });
        testInfo.annotations.push({
          type: `AC15 ${appLocale} ${scheme} ${path}`,
          description:
            `LCP ${Math.round(audit.lcpMs)} ms, CLS ${audit.cls.toFixed(3)}, ` +
            `performance ${Math.round(audit.performance * 100)}, SEO ${Math.round(audit.seo * 100)}, ` +
            `accessibility ${Math.round(audit.accessibility * 100)}, runs ${audit.attempts} ` +
            `(LCP ${audit.runsLcpMs.map(Math.round).join(', ')})`,
        });
        // What the reporter prints at the end of the run (e2e/budgets-reporter.ts).
        const row: BudgetRow = {
          locale: appLocale,
          scheme,
          path,
          lcpMs: audit.lcpMs,
          cls: audit.cls,
          seo: audit.seo,
          accessibility: audit.accessibility,
          imageFindings: audit.imageFindings,
          attempts: audit.attempts,
          runsLcpMs: audit.runsLcpMs,
          benchmarkIndex: audit.benchmarkIndex,
          cpuSlowdownMultiplier: cpu.multiplier,
        };
        testInfo.annotations.push({
          type: BUDGET_ROW_ANNOTATION,
          description: JSON.stringify(row),
        });
        // The browser follows the scheme: the screens on the page are the ones of its colouring.
        const other = scheme === 'dark' ? 'light' : 'dark';
        const screens = audit.images.filter((url) => url.includes('/site-images/shots/'));
        expect(screens.length, `${path} loads screens`).toBeGreaterThan(0);
        expect(
          screens.filter((url) => url.includes(`-${other}-`)),
          `${path} screens`,
        ).toEqual([]);
        expect(audit.seo, `${path} SEO; failing: ${audit.failed.join('; ')}`).toBe(1);
        expect(
          audit.accessibility,
          `${path} accessibility; failing: ${audit.failed.join('; ')}`,
        ).toBe(1);
        expect(audit.lcpMs, `${path} LCP in ms; failing: ${audit.failed.join('; ')}`).toBeLessThan(
          MAX_LCP_MS,
        );
        expect(audit.cls, `${path} CLS`).toBeLessThan(MAX_CLS);
        expect(audit.imageFindings, `${path} image audits that fail`).toEqual([]);
      });
    }
  }
});
