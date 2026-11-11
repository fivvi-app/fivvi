// How the web e2e suite runs on CI (playwright.config.ts) and what it says when it hits its limit (#1301).

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

/** The workers and the global limit of the suite: CI's own, and Playwright's defaults elsewhere. */
export function e2eRun(ci: boolean): E2ERun {
  return ci
    ? { workers: CI_WORKERS, globalTimeout: CI_GLOBAL_TIMEOUT_MINUTES * 60_000 }
    : { workers: undefined, globalTimeout: undefined };
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
