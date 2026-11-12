import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CI_GLOBAL_TIMEOUT_MINUTES,
  CI_WORKERS,
  e2eRun,
  LOCAL_MIN_WORKERS,
  localWorkers,
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
    // Locally the workers follow the machine's load (#1336, below); CI ignores it.
    expect(e2eRun(true, { cores: 10, load1: 40 }).workers).toBe(CI_WORKERS);
  });

  it('limits the suite on CI only, in milliseconds', () => {
    expect(e2eRun(true).globalTimeout).toBe(CI_GLOBAL_TIMEOUT_MINUTES * 60_000);
    expect(e2eRun(false, { cores: 10, load1: 0 }).globalTimeout).toBeUndefined();
  });

  it('stops the suite before the CI job is cancelled, with time left for its report', () => {
    const workflow = readFileSync(
      resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
      'utf8',
    );
    const job = workflow.slice(workflow.indexOf('\n  e2e:\n'));
    const jobMinutes = Number(/timeout-minutes: (\d+)/.exec(job)?.[1]);
    // Setup and build take about 1 minute; the report and the artifacts a little more.
    expect(jobMinutes - CI_GLOBAL_TIMEOUT_MINUTES).toBeGreaterThanOrEqual(2);
  });
});

// #1336: several worktrees ran their suites at once (load average 20-45 on a 10-core Mac) and the
// heaviest tests took 3-5 times as long as alone (6-10 s alone, 33-46 s in the loaded suite) and hit
// Playwright's 30 s limit. A suite that starts on a busy machine takes fewer workers.
describe('#1336 localWorkers', () => {
  it("is Playwright's default, half the cores, on an idle machine", () => {
    expect(localWorkers({ cores: 10, load1: 0 })).toBe(5);
    expect(localWorkers({ cores: 8, load1: 0.5 })).toBe(4);
  });

  it('takes fewer workers as the machine gets busier', () => {
    const idle = localWorkers({ cores: 10, load1: 0 });
    const busy = localWorkers({ cores: 10, load1: 5 });
    expect(busy).toBeLessThan(idle);
    expect(busy).toBeGreaterThanOrEqual(LOCAL_MIN_WORKERS);
  });

  it('never goes below the minimum, whatever the load (a loaded machine still finishes)', () => {
    expect(LOCAL_MIN_WORKERS).toBeGreaterThanOrEqual(1);
    expect(localWorkers({ cores: 10, load1: 45 })).toBe(LOCAL_MIN_WORKERS);
    expect(localWorkers({ cores: 10, load1: 1000 })).toBe(LOCAL_MIN_WORKERS);
  });

  it('never goes above half the cores, and keeps the minimum on a small machine', () => {
    expect(localWorkers({ cores: 4, load1: 0 })).toBe(LOCAL_MIN_WORKERS);
    expect(localWorkers({ cores: 64, load1: 0 })).toBe(32);
  });

  it('is what the suite uses locally, from the load it starts under', () => {
    expect(e2eRun(false, { cores: 10, load1: 0 }).workers).toBe(5);
    expect(e2eRun(false, { cores: 10, load1: 30 }).workers).toBe(LOCAL_MIN_WORKERS);
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
