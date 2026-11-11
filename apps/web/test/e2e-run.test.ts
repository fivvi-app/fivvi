import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CI_GLOBAL_TIMEOUT_MINUTES,
  CI_WORKERS,
  e2eRun,
  type TestOutcome,
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
    const jobMinutes = Number(/timeout-minutes: (\d+)/.exec(job)?.[1]);
    // Setup and build take about 1 minute; the report and the artifacts a little more.
    expect(jobMinutes - CI_GLOBAL_TIMEOUT_MINUTES).toBeGreaterThanOrEqual(2);
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
