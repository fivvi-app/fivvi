// How the web e2e suite runs on CI and locally (playwright.config.ts) and what it says when it hits its limit (#1301).
import { availableParallelism, loadavg } from 'node:os';

/**
 * Workers on CI. Playwright's default is half the cores, so 2 on the 4 vCPU runner of a public
 * repository, and the suite saturated them: its 650 tests added up to 1156 s of test time in a
 * 594 s run (run 43038711678), and the same suite took 12.0 min on a slower runner. 3 workers
 * leave a core to the web server and Postgres; a fourth Chromium would compete with them.
 */
export const CI_WORKERS = 3;

/**
 * The suite stops itself after this many minutes on CI, with the results so far, instead of the
 * job being cancelled without a word. The job's own limit (`timeout-minutes` of the e2e job in
 * .github/workflows/ci.yml) is higher, since setup and build count in it; the test "stops the
 * suite before the CI job is cancelled" in e2e-run.test.ts reads that file and keeps the gap, so
 * a change to either number shows up there. This limit is a guard for a hung suite, not a budget
 * to run near. On 3 workers the suite is expected to stay well under it (run 43038711678
 * took 594 s on 2 workers); the first CI runs of #1301 give the measured number.
 */
export const CI_GLOBAL_TIMEOUT_MINUTES = 12;

export interface E2ERun {
  workers: number | undefined;
  globalTimeout: number | undefined;
}

/** What the workers locally depend on: the cores of the machine and its load average over the last minute. */
export interface Host {
  cores: number;
  load1: number;
}

/** The fewest workers a local suite takes, however busy the machine: it still finishes, slowly. */
export const LOCAL_MIN_WORKERS = 2;

/**
 * Workers of a local run (#1336). Playwright's default is half the cores, which is right for a
 * machine that runs only the suite. A factory run starts 4-6 builders and each runs its own
 * check.sh; the load average goes to 20-45 on a 10-core Mac and the heaviest tests, whose time is
 * browser CPU, take several times as long as alone (the measurements:
 * docs/engineering/TESTING.md §8, "Locally the suite does not compete with itself"). A worker is
 * taken to need about a core and a half (Chromium and the page's server), so the suite takes the
 * cores the load leaves free, divided by that, between the minimum and the default.
 */
export function localWorkers({ cores, load1 }: Host): number {
  const fromFreeCores = Math.floor((cores - load1) / 1.5);
  return Math.max(LOCAL_MIN_WORKERS, Math.min(Math.floor(cores / 2), fromFreeCores));
}

/** The machine this runs on. */
function thisHost(): Host {
  return { cores: availableParallelism(), load1: loadavg()[0] ?? 0 };
}

/** The workers and the global limit of the suite: CI's own, and by the machine's load elsewhere. */
export function e2eRun(ci: boolean, host: Host = thisHost()): E2ERun {
  return ci
    ? { workers: CI_WORKERS, globalTimeout: CI_GLOBAL_TIMEOUT_MINUTES * 60_000 }
    : { workers: localWorkers(host), globalTimeout: undefined };
}

/**
 * The state of one test from Playwright's `test.outcome()` and the status of its last result. A
 * test that failed counts as failed even when its retry was then cut off (`outcome()` is
 * `unexpected` and the last result `interrupted`), as the github reporter has it; only a test with
 * nothing but cut-off attempts is interrupted.
 */
export function testState(
  outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped',
  lastStatus: string | undefined,
): TestOutcome['state'] {
  if (lastStatus === undefined) return 'not-run';
  if (outcome === 'unexpected') return 'failed';
  if (lastStatus === 'passed' || lastStatus === 'interrupted' || lastStatus === 'skipped') {
    return lastStatus;
  }
  return 'failed';
}

/** What became of one test: it ran to the end (`passed`, `failed`), was cut off, or never started. */
export interface TestOutcome {
  title: string;
  state: 'passed' | 'failed' | 'interrupted' | 'skipped' | 'not-run';
}

/**
 * The line a run that hit the global limit leaves for the reader (a GitHub annotation): the suite
 * timed out, which is no test's failure, and the tests that were cut off are not failures either.
 */
export function timeoutAnnotation(tests: TestOutcome[], limitMinutes: number): string {
  const titles = (state: TestOutcome['state']) =>
    tests.filter((t) => t.state === state).map((t) => t.title);
  const passed = titles('passed').length;
  const failed = titles('failed');
  const interrupted = titles('interrupted');
  const notRun = titles('not-run').length;

  const parts = [
    `The e2e suite timed out after ${limitMinutes} minutes: ${passed} passed`,
    failed.length === 0 ? 'no test failed' : `${failed.length} failed: ${failed.join(', ')}`,
  ];
  if (interrupted.length > 0) {
    parts.push(`${interrupted.length} were cut off while running: ${interrupted.join(', ')}`);
  }
  if (notRun > 0) parts.push(`${notRun} never started`);
  return `${parts.join('; ')}. The suite is too slow for its limit; see #1301.`;
}
