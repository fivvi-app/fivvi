import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// Spec #1356, ticket #1363 (ADR-025, amendment of 12 November 2026): the `Quarantine (Android)` job of ci.yml runs exactly the
// tests of the Compose and Maestro lists, is not a required check, and passes when the lists are empty.

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
const job = jobs['quarantine-android'];
const code = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

describe('#1363 AC1 the Quarantine (Android) job', () => {
  it('is a job called Quarantine (Android), and waits for no other job', () => {
    assert.match(job, /^ {4}name: Quarantine \(Android\)$/m);
    assert.doesNotMatch(job, /^ {4}needs:/m);
  });

  it('is not required, and no job needs it', () => {
    const ruleset = JSON.parse(read('.github/rulesets/main.json'));
    const required = ruleset.rules
      .find((rule) => rule.type === 'required_status_checks')
      .parameters.required_status_checks.map((check) => check.context);
    assert.ok(!required.includes('Quarantine (Android)'));
    for (const [name, other] of Object.entries(jobs)) {
      if (name === 'quarantine-android') continue;
      const needs = other.match(/^ {4}needs: (.+)$/m)?.[1] ?? '';
      assert.doesNotMatch(needs, /quarantine/, `${name} needs the Quarantine (Android) job`);
    }
  });

  it('does not run on a push to main, like the other native test suites', () => {
    assert.match(job, /^ {4}if: github\.event_name != 'push'$/m);
  });

  it('does nothing but read the lists while they are empty: every other step waits for a list that has entries', () => {
    const [checkout, lists, ...rest] = steps(job);
    assert.match(checkout, /actions\/checkout@/);
    assert.match(lists, /id: lists/);
    assert.match(lists, /scripts\/quarantine-android\.mjs count compose/);
    assert.match(lists, /scripts\/quarantine-android\.mjs count maestro/);
    assert.equal(stepIf(checkout), '');
    assert.equal(stepIf(lists), '');
    for (const step of rest) {
      assert.match(
        stepIf(step),
        /steps\.lists\.outputs\.(any == 'true'|(compose|maestro) != '0')/,
        step.match(/- (name|uses): (.+)/)?.[2],
      );
    }
  });

  it('runs the listed tests with FIVVI_QUARANTINE=only: the Compose tests when that list has entries, the flows when that has', () => {
    assert.match(job, /^ {6}FIVVI_QUARANTINE: only$/m);
    const compose = steps(job).find((step) => /run: scripts\/android\.sh quarantine$/m.test(step));
    assert.match(stepIf(compose), /^steps\.lists\.outputs\.compose != '0'$/);
    const apk = steps(job).find((step) => /run: scripts\/android\.sh maestro-apk$/m.test(step));
    const flows = steps(job).find((step) => /run: scripts\/maestro\.sh android --apk$/m.test(step));
    for (const step of [apk, flows])
      assert.match(stepIf(step), /steps\.lists\.outputs\.maestro != '0'/);
  });

  it('a failed Compose step does not skip the flows, and the emulator is stopped and the reports kept either way', () => {
    const flows = steps(job).find((step) => /run: scripts\/maestro\.sh android --apk$/m.test(step));
    assert.match(stepIf(flows), /!cancelled\(\)/);
    const stop = steps(job).find((step) => /run: scripts\/android\.sh stop$/m.test(step));
    assert.match(stepIf(stop), /always\(\)/);
    const upload = steps(job).find((step) => /name: android-quarantine-reports$/m.test(step));
    assert.match(stepIf(upload), /always\(\)/);
  });

  it('the required Android jobs never set FIVVI_QUARANTINE: they leave the listed tests out', () => {
    for (const name of ['android-build', 'android-tests', 'android-maestro', 'android'])
      assert.doesNotMatch(code(jobs[name]), /FIVVI_QUARANTINE/, name);
  });

  it('shares the emulator cache of Android tests without ever saving it', () => {
    assert.match(job, /actions\/cache\/restore@/);
    assert.doesNotMatch(code(job), /uses: actions\/cache@/);
    assert.match(job, /key: avd-v2-\$\{\{ runner\.os \}\}-\$\{\{ steps\.avd\.outputs\.key \}\}/);
  });

  it('WORKFLOW.md §7 lists the job, as not required', () => {
    const workflow = read('docs/engineering/WORKFLOW.md');
    const section = workflow.slice(workflow.indexOf('## 7. CI and required checks'));
    const row = section.split('\n').find((line) => line.startsWith('| `Quarantine (Android)`'));
    assert.ok(row, 'the job table has a Quarantine (Android) row');
    assert.match(row, /not required/i);
    assert.match(row, /quarantine\/compose\.txt/);
    assert.match(row, /quarantine\/maestro\.txt/);
    assert.match(row, /FIVVI_QUARANTINE=only/);
    assert.match(row, /empty/);
  });

  it('TESTING.md §8 says how a Compose or Maestro entry names a test and how a test is marked', () => {
    const testing = read('docs/engineering/TESTING.md');
    const section = testing.slice(testing.indexOf('## 8. Flaky tests'));
    assert.match(
      section,
      /`app\.fivvi\.pro\.home\.WorkspaceSwitchTest#test_F012_AC6_profileSwitchesWorkspace`/,
    );
    assert.match(section, /@Isolation/);
    assert.match(section, /@Concurrency/);
    assert.match(section, /@Permission/);
    assert.match(section, /`tags:`/);
  });
});
