import { createServer } from 'node:net';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { pageFunctions } from 'lighthouse/core/lib/page-functions.js';
import { medianOf } from '../test/lighthouse-cpu';

/**
 * Lighthouse for the budget check (F064, AC15). It runs with its own defaults for a phone: the
 * Moto G Power screen and a slow 4G connection, simulated from a trace. The network is the same on
 * every host; the CPU slowdown is relative to the host's own speed, so the spec calibrates it to the
 * host (`calibrateCpuSlowdown`, test/lighthouse-cpu.ts) and passes it in `auditPage`.
 */
export type ColorScheme = 'light' | 'dark';

export interface BudgetBrowser {
  /** The remote debugging port Lighthouse connects to. */
  port: number;
  /**
   * The host's `benchmarkIndex`, by Lighthouse's own computation (the one it reports in
   * `lhr.environment.benchmarkIndex`), as the median of three samples taken in this browser.
   */
  benchmarkIndex: () => Promise<number>;
  close: () => Promise<void>;
}

/** Each sample takes a second; one disturbed by other work does not decide, the median does. */
const BENCHMARK_SAMPLES = 3;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Chromium from Playwright's own install (the one the e2e tests use), open for Lighthouse to drive.
 * The colour scheme is the browser's setting, so every page Lighthouse opens in it follows it:
 * `prefers-color-scheme` is what the site's pictures and colours follow.
 */
export async function launchBudgetBrowser(colorScheme: ColorScheme): Promise<BudgetBrowser> {
  const port = await freePort();
  const browser = await chromium.launch({
    args: [
      `--remote-debugging-port=${port}`,
      // Blink's PreferredColorScheme is 0 for dark and 1 for light; without the flag a headless
      // browser is light.
      ...(colorScheme === 'dark' ? ['--blink-settings=preferredColorScheme=0'] : []),
    ],
  });
  return {
    port,
    benchmarkIndex: async () => {
      const page = await browser.newPage();
      try {
        const samples: number[] = [];
        for (let sample = 0; sample < BENCHMARK_SAMPLES; sample++) {
          samples.push(await page.evaluate(pageFunctions.computeBenchmarkIndex));
        }
        return medianOf(samples);
      } finally {
        await page.close();
      }
    },
    close: () => browser.close(),
  };
}

/** What a budget reads from one Lighthouse run. */
export interface PageAudit {
  url: string;
  lcpMs: number;
  cls: number;
  /** The `benchmarkIndex` Lighthouse measured on the host during this very run. */
  benchmarkIndex: number;
  performance: number;
  seo: number;
  accessibility: number;
  /** The addresses of the images the page loaded, to check it followed the colour scheme. */
  images: string[];
  /** The audits of the images (`modern-image-formats`, `uses-responsive-images`, `unsized-images`) that did not pass. */
  imageFindings: string[];
  /** Every audit of the three categories that did not pass, named, for the failure message. */
  failed: string[];
}

const IMAGE_AUDITS = ['modern-image-formats', 'uses-responsive-images', 'unsized-images'];

/** A run takes 6 to 12 seconds; one that takes this long is a Lighthouse or a Chrome that hangs. */
const RUN_TIMEOUT_MS = 60_000;

/**
 * Runs Lighthouse on `url` (performance, accessibility and SEO) in the browser at `port`, with the
 * CPU slowed down `cpuSlowdownMultiplier` times (the network keeps Lighthouse's slow 4G).
 */
export async function auditPage(
  url: string,
  port: number,
  cpuSlowdownMultiplier: number,
): Promise<PageAudit> {
  let timer: NodeJS.Timeout | undefined;
  const hung = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Lighthouse did not finish ${url} in ${RUN_TIMEOUT_MS / 1000} s (Chrome on port ${port})`,
          ),
        ),
      RUN_TIMEOUT_MS,
    );
  });
  const result = await Promise.race([
    lighthouse(url, {
      port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'seo'],
      // Only the CPU is set: Lighthouse merges it into its mobile slow 4G profile.
      throttling: { cpuSlowdownMultiplier },
    }),
    hung,
  ]).finally(() => clearTimeout(timer));
  if (!result) throw new Error(`Lighthouse returned no result for ${url}`);
  const { lhr } = result;
  const score = (id: string) => lhr.categories[id]?.score ?? Number.NaN;
  const failed = ['performance', 'accessibility', 'seo'].flatMap((id) =>
    (lhr.categories[id]?.auditRefs ?? [])
      .filter((ref) => ref.weight > 0)
      .map((ref) => lhr.audits[ref.id])
      .filter((audit) => audit && audit.score !== null && audit.score < 1)
      .map(
        (audit) => `${id}/${audit?.id}: ${audit?.title} (${audit?.displayValue ?? audit?.score})`,
      ),
  );
  return {
    url,
    lcpMs: lhr.audits['largest-contentful-paint']?.numericValue ?? Number.NaN,
    cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? Number.NaN,
    benchmarkIndex: lhr.environment.benchmarkIndex,
    performance: score('performance'),
    seo: score('seo'),
    accessibility: score('accessibility'),
    images: (
      (
        lhr.audits['network-requests']?.details as {
          items?: { url: string; resourceType?: string }[];
        }
      )?.items ?? []
    )
      .filter((request) => request.resourceType === 'Image')
      .map((request) => request.url),
    imageFindings: IMAGE_AUDITS.filter((id) => {
      const audit = lhr.audits[id];
      return audit && audit.score !== null && audit.score < 1;
    }),
    failed,
  };
}
