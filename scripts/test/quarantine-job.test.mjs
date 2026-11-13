import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    for (const step of rest) {
      assert.match(
        stepIf(step),
        /^steps\.lists\.outputs\.(any == 'true'|(vitest|playwright) != '0')/,
        step.match(/- (name|uses): (.+)/)?.[2],
      );
    }
  });

  it('runs the listed tests of each runner with FIVVI_QUARANTINE=only, and only when its list has entries', () => {
    const vitest = steps(quarantine).find((step) =>
      /name: Vitest, the listed tests only/.test(step),
    );
    assert.match(vitest, /^ {8}if: steps\.lists\.outputs\.vitest != '0'$/m);
    assert.match(vitest, /^ {10}FIVVI_QUARANTINE: only$/m);
    assert.match(vitest, /pnpm -r --no-bail --if-present run test \|\| status=1/);
    assert.match(vitest, /pnpm -r --no-bail --if-present run test:integration \|\| status=1/);
    const e2e = steps(quarantine).find((step) => /id: e2e/.test(step));
    assert.match(e2e, /^ {8}if: steps\.lists\.outputs\.playwright != '0'$/m);
    assert.match(e2e, /^ {10}FIVVI_QUARANTINE: only$/m);
    assert.match(e2e, /run: pnpm --filter @fivvi\/web run test:e2e$/m);
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
  });
});
