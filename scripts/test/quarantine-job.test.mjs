import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// Spec #1356, ticket #1361 (ADR-025, amendment of 12 November 2026): the `Quarantine` job of ci.yml runs exactly the tests of
// the quarantine lists, on every CI run, is not a required check, and passes when the lists are empty.

const ROOT = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const ci = read('.github/workflows/ci.yml');

const jobsSection = ci.slice(ci.indexOf('\njobs:\n'));
const keys = [...jobsSection.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)];
const jobs = Object.fromEntries(
  keys.map((key, i) => [
    key[1],
    jobsSection.slice(key.index, i + 1 < keys.length ? keys[i + 1].index : undefined),
  ]),
);
const steps = (job) => job.split(/\n(?= {6}- )/).slice(1);
const stepIf = (step) => step.match(/^ {8}if: (.+)$/m)?.[1] ?? '';
const quarantine = jobs.quarantine;
/** A job without its comment lines (the last lines of a job's text are the comment of the next one). */
const code = (job) =>
  job
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

describe('#1361 AC2 the Quarantine job', () => {
  it('is a job called Quarantine', () => {
    assert.match(quarantine, /^ {4}name: Quarantine$/m);
  });

  it('runs on every CI run: no condition on the job, and it waits for no other job', () => {
    assert.doesNotMatch(quarantine, /^ {4}if:/m);
    assert.doesNotMatch(quarantine, /^ {4}needs:/m);
  });

  it('is not required, and no job needs it: the ruleset of main names the five required checks only', () => {
    const ruleset = JSON.parse(read('.github/rulesets/main.json'));
    const required = ruleset.rules
      .find((rule) => rule.type === 'required_status_checks')
      .parameters.required_status_checks.map((check) => check.context);
    assert.ok(!required.includes('Quarantine'));
    for (const [name, job] of Object.entries(jobs)) {
      if (name === 'quarantine') continue;
      const needs = job.match(/^ {4}needs: (.+)$/m)?.[1] ?? '';
      assert.doesNotMatch(needs, /quarantine/, `${name} needs the Quarantine job`);
    }
  });

  it('cannot fail the run of a push, like every job', () => {
    assert.match(quarantine, /^ {4}continue-on-error: \$\{\{ github\.event_name == 'push' \}\}$/m);
  });

  it('does nothing but read the lists while they are empty: every other step waits for a list that has entries', () => {
    const [checkout, lists, ...rest] = steps(quarantine);
    assert.match(checkout, /actions\/checkout@/);
    assert.match(lists, /id: lists/);
    assert.match(lists, /scripts\/quarantine\.mjs --count vitest/);
    assert.match(lists, /scripts\/quarantine\.mjs --count playwright/);
    assert.equal(stepIf(checkout), '');
    assert.equal(stepIf(lists), '');
    // The setup steps ask for entries in either list; each step after them is guarded by an earlier step that did, so with
    // empty lists they are all skipped.
    const setup = rest.slice(0, 3);
    for (const step of setup) assert.equal(stepIf(step), "steps.lists.outputs.any == 'true'");
    for (const step of rest.slice(3)) {
      assert.match(
        stepIf(step),
        /steps\.(lists\.outputs\.(any|vitest|playwright)|install|playwright|build|e2e)\b/,
        step.match(/- (name|uses): (.+)/)?.[2],
      );
    }
  });

  it('runs the listed tests of each runner with FIVVI_QUARANTINE=only, and only when its list has entries', () => {
    const vitest = steps(quarantine).find((step) => /id: vitest/.test(step));
    assert.match(vitest, /steps\.lists\.outputs\.vitest != '0'/);
    assert.match(vitest, /^ {10}FIVVI_QUARANTINE: only$/m);
    assert.match(
      vitest,
      /pnpm -r --no-bail --if-present run test --reporter=default \|\| status=1/,
    );
    assert.match(
      vitest,
      /pnpm -r --no-bail --if-present run test:integration --reporter=default \|\| status=1/,
    );
    assert.match(vitest, /tee "\$RUNNER_TEMP\/quarantine-vitest\.log"/);
    // The Playwright steps start from its list: a setup step that waits for it, and the test step after the setup.
    const setup = steps(quarantine).find((step) => /id: playwright\n/.test(step));
    assert.match(setup, /steps\.lists\.outputs\.playwright != '0'/);
    const e2e = steps(quarantine).find((step) => /id: e2e/.test(step));
    assert.match(e2e, /^ {10}FIVVI_QUARANTINE: only$/m);
    assert.match(
      e2e,
      /^ {10}pnpm --filter @fivvi\/web run test:e2e --retries=0 --reporter=list,html,\.\/e2e\/timeout-reporter\.ts 2>&1 \| tee "\$RUNNER_TEMP\/quarantine-playwright\.log"$/m,
    );
  });

  it('THE JOB NEVER FAILS: no step that can fail ends the job red, on any event', () => {
    const [checkout, lists, ...rest] = steps(quarantine);
    assert.ok(checkout && lists);
    // Every step but the two that only read the checkout and the lists (which cannot fail on a list that passed the rule)
    // is continue-on-error: true, for every event (a literal, not the push expression).
    for (const step of rest) {
      assert.match(step, /^ {8}continue-on-error: true$/m, step.match(/- (name|uses): (.+)/)?.[2]);
    }
    // Nothing makes the job fail on purpose.
    assert.doesNotMatch(code(quarantine), /exit 1\b/);
  });

  it('both test steps run after the other one failed, and neither is skipped by the other', () => {
    const vitest = steps(quarantine).find((step) => /id: vitest/.test(step));
    const e2e = steps(quarantine).find((step) => /id: e2e/.test(step));
    // `!cancelled()`: a step with a condition without a status function runs only while every step before it succeeded.
    assert.match(
      stepIf(vitest),
      /^\$\{\{ !cancelled\(\) && steps\.install\.outcome == 'success' && /,
    );
    assert.match(stepIf(e2e), /^\$\{\{ !cancelled\(\) && steps\.build\.outcome == 'success' && /);
    // The condition of one test step never reads the other's result, so a failure of one cannot stop the other.
    assert.doesNotMatch(stepIf(vitest), /steps\.(e2e|build|playwright|chromium|os-packages)\b/);
    assert.doesNotMatch(stepIf(e2e), /steps\.vitest\b/);
    // The setup of the Playwright run does not wait for Vitest either.
    for (const step of steps(quarantine).filter((step) =>
      /id: (playwright|playwright-cache|chromium|os-packages|build)\n/.test(step),
    ))
      assert.doesNotMatch(stepIf(step), /steps\.vitest\b/);
  });

  it('the last step reports the result in the job summary and as one warning per failing runner', () => {
    const all = steps(quarantine);
    const report = all.at(-1);
    assert.match(report, /name: Report the quarantined tests/);
    assert.match(stepIf(report), /^\$\{\{ !cancelled\(\) && /);
    assert.match(report, /VITEST: \$\{\{ steps\.vitest\.outcome \}\}/);
    assert.match(report, /E2E: \$\{\{ steps\.e2e\.outcome \}\}/);
    assert.match(report, /GITHUB_STEP_SUMMARY/);
    assert.match(report, /quarantined test\(s\) passed/);
    assert.match(report, /::warning title=Quarantine \(\$runner\)::/);
    // A failing test is a warning, never an error annotation or a failed step.
    assert.doesNotMatch(report, /::error/);
    assert.doesNotMatch(code(report), /exit 1\b/);
    // It reads what the test steps logged.
    assert.match(report, /quarantine-vitest\.log/);
    assert.match(report, /quarantine-playwright\.log/);
  });

  it('the step timeouts are the same on every event and add up to less than the job’s, so a hung test is a failed step, not a cancelled job', () => {
    const jobMinutes = Number(quarantine.match(/^ {4}timeout-minutes: (.+)$/m)[1]);
    assert.ok(Number.isInteger(jobMinutes), 'the job timeout is a literal');
    let sum = 0;
    const timed = [];
    for (const step of steps(quarantine)) {
      const value = step.match(/^ {8}timeout-minutes: (.+)$/m)?.[1];
      if (value === undefined) continue;
      assert.match(value, /^\d+$/, `a literal, not the push-only expression: ${value}`);
      sum += Number(value);
      timed.push(step.match(/- name: (.+)/)?.[1]);
    }
    // The long steps: every one has a timeout.
    for (const name of [
      'Install dependencies',
      'Vitest, the listed tests only',
      'Install Chromium',
      "Install Chromium's OS packages",
      'Build the web app',
      'Web e2e (nl-NL and en), the listed tests only',
    ])
      assert.ok(timed.includes(name), `${name} has a step timeout`);
    assert.ok(sum < jobMinutes - 2, `${sum} minutes of steps in a job of ${jobMinutes}`);
  });

  it('turns the annotation reporters of the runners off and takes no retry, so a flaky test does not read as fixed', () => {
    const vitest = steps(quarantine).find((step) => /id: vitest/.test(step));
    assert.equal(vitest.match(/--reporter=default/g).length, 2);
    const e2e = steps(quarantine).find((step) => /id: e2e/.test(step));
    assert.match(e2e, /--retries=0/);
    const reporters = e2e.match(/--reporter=(\S+)/)[1].split(',');
    assert.ok(!reporters.includes('github'));
    assert.ok(reporters.includes('list') && reporters.includes('html'));
    // The reporter of a hit limit exists in the config, so it can be named here.
    assert.match(read('apps/web/playwright.config.ts'), /'\.\/e2e\/timeout-reporter\.ts'/);
  });

  describe('the report step, run on the logs of pnpm -r and of Playwright', () => {
    const report = steps(quarantine).at(-1);
    const script = report.match(/^ {8}run: \|\n((?: {10}.*\n?|\n)+)/m)[1].replace(/^ {10}/gm, '');

    const run = (log, env) => {
      const dir = mkdtempSync(join(tmpdir(), 'report-'));
      try {
        writeFileSync(join(dir, 'quarantine-vitest.log'), log.vitest ?? '');
        writeFileSync(join(dir, 'quarantine-playwright.log'), log.playwright ?? '');
        const summary = join(dir, 'summary.md');
        const result = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            RUNNER_TEMP: dir,
            GITHUB_STEP_SUMMARY: summary,
            INSTALL: 'success',
            ...env,
          },
        });
        let text = '';
        try {
          text = readFileSync(summary, 'utf8');
        } catch {}
        return { status: result.status, out: result.stdout, summary: text };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const VITEST_LOG = [
      'packages/api test:  RUN  v5.0.1 /work/packages/api',
      'packages/api test:  FAIL  test/clients.integration.test.ts > clients > AC9: lists a page',
      'packages/api test:    × AC9: lists a page 12ms',
      'apps/web test:  ✓ test/other.test.ts (3 tests)',
      ' FAIL  src/own.test.ts > suite > a test without a prefix',
    ].join('\n');
    const PLAYWRIGHT_LOG = [
      '  2 failed',
      '    [nl-NL] › clients.spec.ts:12:3 › F006 clients › lists a page',
      '  1) [nl-NL] › clients.spec.ts:12:3 › F006 clients › lists a page ───',
      '  2) [en] › clients.spec.ts:12:3 › F006 clients › lists a page ───',
    ].join('\n');

    it('names the failed tests of Vitest, also when pnpm -r prefixes the lines, and of Playwright; the status stays 0', () => {
      const result = run(
        { vitest: VITEST_LOG, playwright: PLAYWRIGHT_LOG },
        {
          VITEST_LISTED: '1',
          VITEST: 'success',
          VITEST_STATUS: '1',
          PLAYWRIGHT_LISTED: '1',
          E2E: 'success',
          E2E_STATUS: '1',
        },
      );
      assert.equal(result.status, 0);
      assert.match(result.summary, /Vitest: \*\*1 listed, and the quarantined tests failed\*\*/);
      assert.match(
        result.summary,
        /^FAIL {2}test\/clients\.integration\.test\.ts > clients > AC9: lists a page$/m,
      );
      assert.match(result.summary, /^× AC9: lists a page 12ms$/m);
      assert.match(
        result.summary,
        /^FAIL {2}src\/own\.test\.ts > suite > a test without a prefix$/m,
      );
      assert.doesNotMatch(result.summary, /packages\/api test:/);
      assert.doesNotMatch(result.summary, /✓ test\/other/);
      assert.match(
        result.summary,
        /^1\) \[nl-NL\] › clients\.spec\.ts:12:3 › F006 clients › lists a page/m,
      );
      assert.match(result.summary, /^2\) \[en\]/m);
      const warnings = result.out.split('\n').filter((line) => line.startsWith('::warning'));
      assert.equal(warnings.length, 2);
      assert.match(
        warnings[0],
        /title=Quarantine \(Vitest\)::.*FAIL {2}test\/clients\.integration\.test\.ts/,
      );
      assert.doesNotMatch(result.out, /::error/);
    });

    it('says all passed, and that a runner did not run, without a failure', () => {
      const passed = run(
        {},
        {
          VITEST_LISTED: '2',
          VITEST: 'success',
          VITEST_STATUS: '0',
          PLAYWRIGHT_LISTED: '0',
          E2E: 'skipped',
          E2E_STATUS: '',
        },
      );
      assert.equal(passed.status, 0);
      assert.match(passed.summary, /Vitest: all 2 quarantined test\(s\) passed/);
      assert.match(passed.summary, /Playwright: nothing listed/);
      assert.equal(passed.out, '');
      const skipped = run(
        {},
        {
          VITEST_LISTED: '0',
          VITEST: 'skipped',
          VITEST_STATUS: '',
          PLAYWRIGHT_LISTED: '1',
          E2E: 'skipped',
          E2E_STATUS: '',
        },
      );
      assert.equal(skipped.status, 0);
      assert.match(
        skipped.out,
        /::warning title=Quarantine \(Playwright\)::.*did not run to the end \(skipped\)/,
      );
    });

    it('names the failed Vitest test of a real CI log, with colour codes, and not the line pnpm adds for the failed run', () => {
      const esc = String.fromCharCode(27);
      const real = [
        `packages/testing test:  ${esc}[41m${esc}[1m FAIL ${esc}[22m${esc}[49m src/quarantine-proof.test.ts > quarantine proof (CI) > a deliberately failing test`,
        'packages/testing test: AssertionError: expected 1 to be 2',
        'packages/testing test: Failed Tests 1',
        ' ELIFECYCLE  Command failed with exit code 1.',
        ' × "pnpm recursive run" failed in 1 packages',
      ].join('\n');
      const result = run(
        { vitest: real },
        {
          VITEST_LISTED: '1',
          VITEST: 'success',
          VITEST_STATUS: '1',
          PLAYWRIGHT_LISTED: '0',
          E2E: 'skipped',
          E2E_STATUS: '',
        },
      );
      assert.equal(result.status, 0);
      assert.match(
        result.summary,
        /^FAIL {2}src\/quarantine-proof\.test\.ts > quarantine proof \(CI\) > a deliberately failing test$/m,
      );
      assert.doesNotMatch(result.summary, /recursive run/);
      assert.doesNotMatch(result.out, /recursive run/);
      assert.doesNotMatch(result.summary + result.out, new RegExp(`${esc}\\[`));
      assert.match(
        result.out,
        /::warning title=Quarantine \(Vitest\)::.*quarantine proof \(CI\) > a deliberately failing test/,
      );
    });

    it('a step that did not finish (a timeout: no status) is a warning, not a pass', () => {
      const result = run(
        {},
        {
          VITEST_LISTED: '1',
          VITEST: 'failure',
          VITEST_STATUS: '',
          PLAYWRIGHT_LISTED: '0',
          E2E: 'skipped',
          E2E_STATUS: '',
        },
      );
      assert.match(
        result.out,
        /::warning title=Quarantine \(Vitest\)::.*did not run to the end \(failure\)/,
      );
    });
  });

  it('the two test steps end 0 themselves and write the real exit status, so no red "exit code 1" annotation sits under the green check', () => {
    for (const id of ['vitest', 'e2e']) {
      const step = steps(quarantine).find((s) => new RegExp(`id: ${id}\n`).test(s));
      assert.match(step, /^ {10}set \+e$/m, id);
      assert.match(step, /echo "status=\$\{PIPESTATUS\[0\]\}" >>"\$GITHUB_OUTPUT"/, id);
      assert.match(step, /^ {10}exit 0$/m, id);
      assert.match(step, /^ {10}NO_COLOR: '1'$/m, id);
    }
    const report = steps(quarantine).at(-1);
    assert.match(report, /VITEST_STATUS: \$\{\{ steps\.vitest\.outputs\.status \}\}/);
    assert.match(report, /E2E_STATUS: \$\{\{ steps\.e2e\.outputs\.status \}\}/);
    // The Playwright report is uploaded from the real exit status, not from the outcome of a step that always ends 0.
    const upload = steps(quarantine).find((s) => /playwright-report-quarantine/.test(s));
    assert.match(stepIf(upload), /steps\.e2e\.outputs\.status != '0'/);
  });

  it('the required jobs never set FIVVI_QUARANTINE: they leave the listed tests out', () => {
    for (const name of ['checks', 'e2e'])
      assert.doesNotMatch(code(jobs[name]), /FIVVI_QUARANTINE/, name);
    // The job installs what it needs on its own: Postgres for the integration tests, the browser for the e2e tests.
    assert.match(quarantine, /image: postgres:18-alpine/);
    assert.match(quarantine, /scripts\/playwright-deps\.sh/);
  });

  it('uploads the Playwright report of a failed run under a name of its own, not the E2E job’s', () => {
    assert.match(quarantine, /name: playwright-report-quarantine$/m);
    assert.doesNotMatch(code(jobs.e2e), /playwright-report-quarantine/);
  });

  it('AC5: WORKFLOW.md §7 lists the Quarantine job, as not required', () => {
    const workflow = read('docs/engineering/WORKFLOW.md');
    const section = workflow.slice(workflow.indexOf('## 7. CI and required checks'));
    const row = section.split('\n').find((line) => line.startsWith('| `Quarantine`'));
    assert.ok(row, 'the job table has a Quarantine row');
    assert.match(row, /not required/i);
    assert.match(row, /quarantine\/vitest\.txt/);
    assert.match(row, /quarantine\/playwright\.txt/);
    assert.match(row, /FIVVI_QUARANTINE=only/);
    assert.match(row, /empty/);
    // The job never fails, and where its results show (#1361).
    assert.match(row, /\*\*It never fails\.\*\*/);
    assert.match(row, /job summary/);
    assert.match(row, /::warning/);
    const testing = read('docs/engineering/TESTING.md');
    assert.match(testing, /\*\*It never fails, also when a listed test does:\*\*/);
    assert.match(testing, /in the job summary/);
    assert.match(testing, /`::warning` annotation/);
    assert.match(testing, /`--retries=0`/);
    assert.match(testing, /pass without a retry to count as fixed/);
    assert.match(testing, /`github-actions`/);
  });
});
