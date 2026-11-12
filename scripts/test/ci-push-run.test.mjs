import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// E002 #1357 (ADR-018, amendment of 12 November 2026): a push to main only fills the caches that PRs and merge groups
// read, and nothing in it fails the run, so Railway's "Wait for CI" never waits on a flaky test. A PR, a merge group and
// workflow_dispatch run as before.

const ROOT = join(import.meta.dirname, '../..');
const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

// biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, not a template
const PUSH_CONTINUES = "${{ github.event_name == 'push' }}";
const NOT_PUSH = "github.event_name != 'push'";

// The jobs of ci.yml: name and text, from its key to the next job's.
const jobsSection = ci.slice(ci.indexOf('\njobs:\n'));
const keys = [...jobsSection.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)];
const jobs = Object.fromEntries(
  keys.map((key, i) => [
    key[1],
    jobsSection.slice(key.index, i + 1 < keys.length ? keys[i + 1].index : undefined),
  ]),
);
// The steps of a job: each starts with `      - ` (six spaces).
const steps = (job) => job.split(/\n(?= {6}- )/).slice(1);
const jobIf = (job) => job.match(/^ {4}if: (.+)$/m)?.[1] ?? '';

describe('E002 #1357 the push run of CI on main', () => {
  it('finds every job of ci.yml', () => {
    assert.deepEqual(Object.keys(jobs), [
      'changes',
      'checks',
      'e2e',
      'ios-build',
      'ios-build-retry',
      'ios-tests',
      'ios-tests-plan',
      'ios-tests-retry',
      'ios',
      'android-build',
      'android-tests',
      'android-maestro',
      'android',
    ]);
  });

  it('still runs on a push to main, a pull request, a merge group and on demand', () => {
    assert.match(ci, /^ {2}push:\n {4}branches: \[main\]$/m);
    assert.match(ci, /^ {2}pull_request:$/m);
    assert.match(
      ci,
      /^ {2}merge_group:\n {4}types: \[checks_requested\]\n {4}branches: \[main\]$/m,
    );
    assert.match(ci, /^ {2}workflow_dispatch:$/m);
  });

  it('no job can fail the run of a push: each has continue-on-error on a push, and only on a push', () => {
    for (const [name, job] of Object.entries(jobs)) {
      const lines = job.split('\n').filter((line) => /^ {4}continue-on-error:/.test(line));
      assert.deepEqual(lines, [`    continue-on-error: ${PUSH_CONTINUES}`], name);
    }
  });

  it('the test steps of the Linux jobs do not stop their job on a push, so the cache is saved with what passed', () => {
    // actions/cache saves in its post step, which runs only when the job succeeded: a flaky test would otherwise lose the
    // results of every task that passed in the same run. Turbo caches only a task that passed.
    for (const name of ['checks', 'e2e']) {
      const turbo = steps(jobs[name]).filter((step) =>
        /run: (>-\n +)?pnpm exec turbo run/.test(step),
      );
      assert.ok(turbo.length > 0, name);
      for (const step of turbo) {
        assert.match(
          step,
          new RegExp(`^ {8}continue-on-error: ${PUSH_CONTINUES.replace(/[{}$|]/g, '\\$&')}$`, 'm'),
          step,
        );
      }
    }
  });

  it('the Linux jobs run on a push as on a pull request: nothing narrows them to other events', () => {
    assert.equal(jobIf(jobs.checks), '');
    assert.equal(jobIf(jobs.changes), '');
    assert.equal(jobIf(jobs.e2e), "needs.changes.outputs.e2e == 'true'");
  });

  it('no native test suite runs on a push: not iOS tests, Android tests, Maestro or their retries', () => {
    // The suites are the commands that run tests; every job or step that runs one is skipped on a push.
    const suites = [
      /scripts\/test-ios\.sh test /,
      /scripts\/android\.sh verify/,
      /scripts\/maestro\.sh /,
    ];
    const found = [];
    for (const [name, job] of Object.entries(jobs)) {
      for (const step of steps(job)) {
        if (!suites.some((suite) => suite.test(step))) continue;
        found.push(name);
        const stepIf = step.match(/^ {8}if: (.+)$/m)?.[1] ?? '';
        assert.ok(
          jobIf(job).includes(NOT_PUSH) || stepIf.includes(NOT_PUSH),
          `${name} runs a test suite on a push`,
        );
      }
    }
    assert.deepEqual(found, ['ios-tests', 'ios-tests-retry', 'android-tests', 'android-maestro']);
  });

  it('the plan and the retries of the iOS jobs, and the gates, are skipped on a push', () => {
    // Nothing on a push needs a gate's combined result, and a retry only protects a result that is checked.
    for (const name of ['ios-build-retry', 'ios-tests-plan', 'ios', 'android']) {
      assert.ok(jobIf(jobs[name]).includes(NOT_PUSH), name);
    }
  });

  it('the native jobs still write the caches on a push: the iOS build, the Gradle build and the emulator snapshot', () => {
    // iOS: DerivedData and the Swift packages are saved by the build job.
    assert.equal(jobIf(jobs['ios-build']), "needs.changes.outputs.ios == 'true'");
    assert.match(jobs['ios-build'], /name: Cache the iOS build/);
    assert.match(jobs['ios-build'], /run: scripts\/test-ios\.sh build\n/);
    // Android: Gradle by the build and the tests job, the AVD by the tests job (booted, then stopped before the save).
    assert.equal(jobIf(jobs['android-build']), "needs.changes.outputs.android == 'true'");
    assert.equal(jobIf(jobs['android-tests']), "needs.changes.outputs.android == 'true'");
    assert.match(jobs['android-build'], /gradle\/actions\/setup-gradle@/);
    assert.match(jobs['android-tests'], /gradle\/actions\/setup-gradle@/);
    assert.match(jobs['android-tests'], /name: Cache the emulator/);
    assert.match(jobs['android-tests'], /run: scripts\/android\.sh emulator\n/);
    assert.match(jobs['android-tests'], /name: Stop the emulator\n +if: always\(\)/);
  });

  it('the artifacts only the test jobs read are not uploaded on a push', () => {
    const upload = (job, artifact) =>
      steps(jobs[job]).find((step) => step.includes(`name: ${artifact}\n`));
    for (const [job, artifact] of [
      ['ios-build', 'ios-test-bundle'],
      ['android-build', 'android-maestro-apk'],
    ]) {
      const step = upload(job, artifact);
      assert.ok(step, `${job} uploads ${artifact}`);
      assert.match(step, new RegExp(`^ {8}if: ${NOT_PUSH}$`, 'm'), `${job} on a push`);
    }
  });

  it('the Android build does not build the Maestro app on a push', () => {
    const maestroApk = steps(jobs['android-build']).find((step) =>
      step.includes('run: scripts/android.sh maestro-apk'),
    );
    assert.match(maestroApk, new RegExp(`^ {8}if: ${NOT_PUSH}$`, 'm'));
  });

  it('every long step of a job that runs on a push has a step timeout below its job timeout, only on a push', () => {
    // continue-on-error covers a step or job that fails. A job that hits its own timeout ends `cancelled`, and a cancelled
    // job makes the run `cancelled` (push runs 42821661674, 42761668186, 42649049029: E2E (Linux) hit its job timeout).
    // A step timeout below the job's turns a hang into a failed step first. On the other events the step has the most
    // GitHub allows (360), so a pull request and a merge group are timed by the job as before.
    const longSteps = [
      /pnpm install /,
      /install_shellcheck\n/,
      /pnpm exec turbo run/,
      /playwright install /,
      /scripts\/playwright-deps\.sh/,
      /scripts\/test-ios\.sh /,
      /scripts\/android\.sh (setup|build|emulator|verify|maestro-apk)/,
      /scripts\/maestro\.sh /,
    ];
    const jobMinutes = (job) => Number(job.match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
    // The step timeout on a push: a number, or the expression `push && N || 360`.
    const pushMinutes = (step) => {
      const value = step.match(/^ {8}timeout-minutes: (.+)$/m)?.[1];
      if (value === undefined) return undefined;
      if (/^\d+$/.test(value)) return Number(value);
      const match = value.match(/^\$\{\{ github\.event_name == 'push' && (\d+) \|\| 360 \}\}$/);
      assert.ok(match, `a timeout of a step is a number or the push expression: ${value}`);
      return Number(match[1]);
    };
    const found = [];
    for (const [name, job] of Object.entries(jobs)) {
      // A job skipped on a push has no step that can hang there; a step skipped on a push neither.
      if (jobIf(job).includes(NOT_PUSH)) continue;
      for (const step of steps(job)) {
        if (!longSteps.some((pattern) => pattern.test(step))) continue;
        if ((step.match(/^ {8}if: (.+)$/m)?.[1] ?? '').includes(NOT_PUSH)) continue;
        const label = `${name}: ${step.match(/- name: (.+)/)?.[1]}`;
        found.push(label);
        const minutes = pushMinutes(step);
        assert.ok(minutes !== undefined, `${label} has no step timeout`);
        assert.ok(
          minutes < jobMinutes(job),
          `${label}: ${minutes} is not below the job's ${jobMinutes(job)}`,
        );
        // Room for the post steps (the cache is saved after the last step): not more than the job minus 2 minutes.
        assert.ok(minutes <= jobMinutes(job) - 2, `${label} leaves no room for the cache save`);
      }
    }
    // The steps that took the longest or are most exposed to a hang are among them.
    for (const label of [
      'checks: Lint, typecheck, unit and integration tests, build, format and static checks',
      'e2e: Web e2e (nl-NL and en)',
      'ios-build: SwiftLint, checks and build for testing',
      'android-build: ktlint, checks and debug build',
      'android-tests: Boot the emulator',
    ]) {
      assert.ok(found.includes(label), `${label} is checked (found: ${found.join('; ')})`);
    }
  });

  it('the long steps of a pull request and a merge group are timed by their job alone: the push expression falls back to 360', () => {
    // 360 minutes is the most a job can run, so the step never ends before the job does on those events.
    const expressions = [...ci.matchAll(/^ {8}timeout-minutes: (\$\{\{.+\}\})$/gm)].map(
      (match) => match[1],
    );
    assert.ok(expressions.length >= 10, `found ${expressions.length}`);
    for (const expression of expressions) {
      assert.match(expression, /^\$\{\{ github\.event_name == 'push' && \d+ \|\| 360 \}\}$/);
    }
  });

  it('the Playwright report is uploaded when the e2e step fails on a push too: continue-on-error makes failure() false', () => {
    const e2e = steps(jobs.e2e);
    const test = e2e.find((step) => step.includes('- name: Web e2e (nl-NL and en)'));
    assert.match(test, /^ {8}id: e2e$/m);
    assert.match(
      test,
      new RegExp(`^ {8}continue-on-error: ${PUSH_CONTINUES.replace(/[{}$|]/g, '\\$&')}$`, 'm'),
    );
    const upload = e2e.find((step) => step.includes('- name: Upload Playwright report'));
    // A failure of the pull request or the merge group run is still `failure()`; the push run reads the step's outcome.
    assert.match(upload, /^ {8}if: failure\(\) \|\| steps\.e2e\.outcome == 'failure'$/m);
  });

  it('ci.yml says what is still open: a job no runner takes ends cancelled, and so does the run; and a pending run on main is replaced by a newer one', () => {
    assert.match(ci, /Still open: no YAML can stop a\n {2}#\s+cancel when no runner takes a job/);
    assert.doesNotMatch(ci, /Runs on main are never cancelled/);
    assert.match(
      ci,
      /A run on main that is still pending when another push arrives is\n# replaced by the newer one/,
    );
  });

  it('the required checks keep their names', () => {
    const names = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1]);
    for (const required of ['Detect changes', 'Checks (Linux)', 'E2E (Linux)', 'iOS', 'Android']) {
      assert.ok(names.includes(required), required);
    }
  });

  it('a pull request, a merge group and workflow_dispatch are not touched: every push condition is false for them', () => {
    // Each push-only expression must compare the event with 'push', never with the ref or the branch, so a run of any
    // other event evaluates it as before.
    const expressions = [...ci.matchAll(/github\.event_name (==|!=) '(\w+)'/g)];
    const forPush = expressions.filter((match) => match[2] === 'push');
    assert.ok(forPush.length >= 10, `found ${forPush.length}`);
    assert.doesNotMatch(ci, /github\.ref == 'refs\/heads\/main'/);
  });
});

describe('E002 #1357 the docs describe the push run', () => {
  const read = (path) => readFileSync(join(ROOT, path), 'utf8');

  it('WORKFLOW.md §7 says the push run only fills caches, runs no native test suite and cannot fail', () => {
    const workflow = read('docs/engineering/WORKFLOW.md');
    const section = workflow.slice(workflow.indexOf('## 7. CI and required checks'));
    assert.match(section, /\*\*The push run on `main`/);
    assert.match(section, /only fills the caches/);
    assert.match(section, /without their test suites/);
    assert.match(section, /no failed step or job fails it/);
    assert.match(section, /ADR-018/);
  });

  it('WORKFLOW.md §7 does not claim the run always succeeds: a cancelled job is still open, with the evidence', () => {
    const workflow = read('docs/engineering/WORKFLOW.md');
    const section = workflow.slice(workflow.indexOf('## 7. CI and required checks'));
    assert.match(section, /`continue-on-error` covers only a failure/);
    assert.match(section, /42821661674/);
    assert.match(section, /step `timeout-minutes` below their job's/);
    assert.match(
      section,
      /\*\*Still open:\*\* no YAML can stop a cancel when no runner takes a job/,
    );
    assert.doesNotMatch(
      section,
      /the run succeeds\. Railway's "Wait for CI" on `main` therefore never waits/,
    );
    assert.match(section, /still pending when a newer push replaced it/);
  });

  it('WORKFLOW.md §7 says what E2E (Linux) saves: nothing, so a test:e2e result is not cached in CI', () => {
    const workflow = read('docs/engineering/WORKFLOW.md');
    const section = workflow.slice(workflow.indexOf('## 7. CI and required checks'));
    assert.match(section, /only restores the turbo cache and saves none/);
    assert.doesNotMatch(section, /\(`test`, `test:integration`, `test:e2e`;/);
    assert.doesNotMatch(section, /runs on `main` and of merge groups are never cancelled/);
  });

  it('WORKFLOW.md §7 marks the daily full run as coming (#1358), not as the check of main today', () => {
    const workflow = read('docs/engineering/WORKFLOW.md');
    const section = workflow.slice(workflow.indexOf('## 7. CI and required checks'));
    assert.match(section, /daily full run[^.]*coming, \[#1358\]/);
    assert.doesNotMatch(section, /The check of `main` itself is the daily full run/);
  });

  it('ENVIRONMENTS.md §4 says the deploy of development and production waits on a push run that cannot fail', () => {
    const environments = read('docs/engineering/ENVIRONMENTS.md');
    const section = environments.slice(
      environments.indexOf('## 4. From PR to production'),
      environments.indexOf('## 5. Migrations'),
    );
    assert.match(section, /push run/);
    assert.match(section, /\*\*Still open:\*\* a job that no runner takes/);
    assert.match(section, /no jobs that shows as `cancelled`/);
    assert.doesNotMatch(section, /cannot fail/);
    assert.match(section, /ADR-018/);
  });
});
