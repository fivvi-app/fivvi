import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CI_GLOBAL_TIMEOUT_MINUTES,
  CI_SPARE_SHARE,
  CI_WORKERS,
  e2eRun,
  MEASURED_WORST_SUITE_MINUTES,
  type TestOutcome,
  testState,
  timeoutAnnotation,
} from './e2e-run';

const test = (title: string, state: TestOutcome['state']): TestOutcome => ({ title, state });

// #1301: the CI run of the web e2e suite used to stop at its global limit with whichever test was
// running marked as interrupted, and it ran near that limit.
describe('#1301 e2e run settings', () => {
  it('uses more workers than the default on CI, and the default elsewhere', () => {
    // Playwright's default is half the cores: 2 on the 4 vCPU runner, which was saturated (the tests
    // added up to 1156 s of a 594 s run). More than that is the point of the setting.
    expect(CI_WORKERS).toBeGreaterThan(2);
    expect(e2eRun(true).workers).toBe(CI_WORKERS);
    expect(e2eRun(false).workers).toBeUndefined();
  });

  it('limits the suite on CI only, in milliseconds', () => {
    expect(e2eRun(true).globalTimeout).toBe(CI_GLOBAL_TIMEOUT_MINUTES * 60_000);
    expect(e2eRun(false).globalTimeout).toBeUndefined();
  });

  it('stops the suite before the CI job is cancelled, with time left for its report', () => {
    const workflow = readFileSync(
      resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
      'utf8',
    );
    const job = workflow.slice(workflow.indexOf('\n  e2e:\n'));
    // The job's own limit, at the job's indentation (a step's `timeout-minutes` sits deeper): a plain number, or
    // `push && N || M` (N on a push, M on a pull request, a merge group and workflow_dispatch). The rule holds for both.
    const limit =
      /^ {4}timeout-minutes: (?:(\d+)|\$\{\{ github\.event_name == 'push' && (\d+) \|\| (\d+) \}\})$/m.exec(
        job,
      );
    expect(limit, 'the e2e job has a timeout-minutes of its own').not.toBeNull();
    const jobMinutes = limit?.[1] ? [Number(limit[1])] : [Number(limit?.[2]), Number(limit?.[3])];
    expect(jobMinutes).toHaveLength(limit?.[1] ? 1 : 2);
    for (const minutes of jobMinutes) {
      // Setup and build take about 1 minute; the report and the artifacts a little more.
      expect(minutes - CI_GLOBAL_TIMEOUT_MINUTES).toBeGreaterThanOrEqual(2);
    }
  });

  // #1408 review: the OS packages step may spend its whole limit on its retries (#1311) before the suite starts, so the job
  // has to cover that step, the suite's limit and 2 minutes for the setup, the build and the post steps. A job cancelled
  // there prints no `::error` for the suite.
  it('keeps the job alive for the OS packages step at its limit, then the suite at its limit', () => {
    const workflow = readFileSync(
      resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
      'utf8',
    );
    const job = workflow.slice(workflow.indexOf('\n  e2e:\n'));
    const at = job.indexOf("- name: Install Chromium's OS packages");
    expect(at, 'the e2e job has the OS packages step').not.toBe(-1);
    const stepLimit = /timeout-minutes: (\d+)/.exec(job.slice(at, job.indexOf('\n\n', at)));
    expect(stepLimit, 'the OS packages step has a timeout of its own').not.toBeNull();
    const limit =
      /^ {4}timeout-minutes: (?:(\d+)|\$\{\{ github\.event_name == 'push' && (\d+) \|\| (\d+) \}\})$/m.exec(
        job,
      );
    expect(limit, 'the e2e job has a timeout-minutes of its own').not.toBeNull();
    const jobMinutes = limit?.[1] ? [Number(limit[1])] : [Number(limit?.[2]), Number(limit?.[3])];
    for (const minutes of jobMinutes) {
      expect(minutes - Number(stepLimit?.[1]) - CI_GLOBAL_TIMEOUT_MINUTES).toBeGreaterThanOrEqual(
        2,
      );
    }
  });
});

// #1408: a limit of 12 minutes was passed by the slowest runners (the same ~700 tests took 7 to 12 minutes,
// depending on the runner), so the merge queue removed web PRs with no test failing.
describe('#1408 the limit leaves room', () => {
  it('keeps at least a fifth of the limit to spare for the slowest suite run measured (TESTING.md §8)', () => {
    expect(MEASURED_WORST_SUITE_MINUTES).toBeGreaterThanOrEqual(12);
    expect(MEASURED_WORST_SUITE_MINUTES).toBeLessThanOrEqual(
      CI_GLOBAL_TIMEOUT_MINUTES * (1 - CI_SPARE_SHARE),
    );
  });

  it('ends the suite before the step that runs it is cancelled on a push', () => {
    const workflow = readFileSync(
      resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
      'utf8',
    );
    const step = workflow.slice(workflow.indexOf('- name: Web e2e (nl-NL and en)'));
    const limit =
      /^ {8}timeout-minutes: \$\{\{ github\.event_name == 'push' && (\d+) \|\| \d+ \}\}$/m.exec(
        step,
      );
    expect(limit, 'the step that runs the suite has a timeout of its own on a push').not.toBeNull();
    // The step builds the app first (about a minute) and then runs the suite.
    expect(Number(limit?.[1]) - CI_GLOBAL_TIMEOUT_MINUTES).toBeGreaterThanOrEqual(2);
  });
});

describe('#1301 timeoutAnnotation', () => {
  it('says the suite hit its limit, that no test failed, and what was cut off', () => {
    const text = timeoutAnnotation(
      [
        test('a', 'passed'),
        test('b', 'passed'),
        test('c', 'interrupted'),
        test('d', 'interrupted'),
        test('e', 'not-run'),
      ],
      12,
    );
    expect(text).toContain('timed out after 12 minutes');
    expect(text).toContain('2 passed');
    expect(text).toContain('no test failed');
    expect(text).toContain('2 were cut off while running: c, d');
    expect(text).toContain('1 never started');
  });

  it('does not claim that no test failed when one did', () => {
    const text = timeoutAnnotation([test('a', 'failed'), test('b', 'interrupted')], 12);
    expect(text).toContain('1 failed: a');
    expect(text).not.toContain('no test failed');
  });
});

// What the reporter makes of a test's results (Playwright's `outcome()` and the status of its last result).
describe('#1301 testState', () => {
  it('counts a test that failed and whose retry was cut off as failed, not as interrupted', () => {
    // retries: 1 on CI: the first attempt failed, the retry was running when the limit hit.
    expect(testState('unexpected', 'interrupted')).toBe('failed');
  });

  it('counts a test that failed on every attempt as failed', () => {
    expect(testState('unexpected', 'failed')).toBe('failed');
    expect(testState('unexpected', 'timedOut')).toBe('failed');
  });

  it('does not count a test that failed once and passed on retry as failed', () => {
    expect(testState('flaky', 'passed')).toBe('passed');
  });

  it('calls a test whose only attempt was cut off interrupted', () => {
    expect(testState('skipped', 'interrupted')).toBe('interrupted');
  });

  it('keeps passed and skipped tests as they are, and a test without results as not run', () => {
    expect(testState('expected', 'passed')).toBe('passed');
    expect(testState('skipped', 'skipped')).toBe('skipped');
    expect(testState('skipped', undefined)).toBe('not-run');
  });
});
