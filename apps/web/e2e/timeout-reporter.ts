import type { FullConfig, FullResult, Reporter, Suite } from '@playwright/test/reporter';
import { type TestOutcome, testState, timeoutAnnotation } from '../test/e2e-run';

/**
 * When the suite hits its global limit (`globalTimeout` in playwright.config.ts), Playwright only
 * prints "Timed out waiting 720s for the test suite to run" and marks the tests that happened to be
 * running as interrupted, which reads like a failing test. This adds one GitHub annotation that says
 * the suite timed out, whether any test failed, and which tests were cut off (#1301).
 */
export default class TimeoutReporter implements Reporter {
  private suite: Suite | undefined;
  private limitMinutes = 0;

  onBegin(config: FullConfig, suite: Suite): void {
    this.suite = suite;
    this.limitMinutes = config.globalTimeout / 60_000;
  }

  onEnd(result: FullResult): void {
    if (result.status !== 'timedout' || !this.suite) return;
    const tests = this.suite.allTests().map((test): TestOutcome => {
      const state = testState(test.outcome(), test.results.at(-1)?.status);
      return { title: test.titlePath().slice(1).join(' › '), state };
    });
    const message = timeoutAnnotation(tests, this.limitMinutes);
    console.log(`::error title=E2E suite timed out::${message}`);
  }

  printsToStdio(): boolean {
    return true;
  }
}
