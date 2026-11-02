import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SCRIPT = join(import.meta.dirname, '..', 'native-gate.sh');
const gate = (...args) => spawnSync(SCRIPT, args, { encoding: 'utf8' });

// #293 AC17: the required checks iOS and Android report the combined result of their parts.
describe('#293 AC17 native-gate.sh: the result of the iOS and Android checks', () => {
  it('passes when every part succeeded', () => {
    const result = gate('iOS', 'true', 'success', 'success', 'success');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /iOS: every part succeeded/);
  });

  it('fails when any part failed, was cancelled, timed out or never ran, and names how many', () => {
    for (const bad of ['failure', 'cancelled', 'skipped']) {
      const result = gate('Android', 'true', 'success', bad, 'success');
      assert.equal(result.status, 1, bad);
      assert.match(
        result.stdout,
        new RegExp(`Android failed: 1 of 3 parts did not succeed \\(${bad}\\)`),
      );
    }
    assert.equal(gate('iOS', 'true', 'failure', 'skipped', 'skipped').status, 1);
  });

  it('passes as skipped when the native decision says the app did not change, whatever the parts report', () => {
    const result = gate('iOS', 'false', 'success', 'skipped', 'skipped');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /iOS: skipped, nothing it builds from changed/);
  });

  it('refuses a missing or unknown decision, and no parts', () => {
    assert.notEqual(gate('iOS', 'maybe', 'success').status, 0);
    assert.notEqual(gate('iOS', 'true').status, 0);
    assert.notEqual(gate().status, 0);
  });
});

// #413: a part that no hosted runner picked up is tried again on another pool; the gate counts the retry in its place
// and says in its error which kind of failure each part had.
describe('#413 native-gate.sh: parts that had no runner, and their retry', () => {
  const parts = (build, nl, en) => [
    `iOS build=${build}`,
    `iOS tests (nl)=${nl}`,
    `iOS tests (en)=${en}`,
  ];
  const iOS = (...args) => gate('iOS', 'true', ...args);

  it('passes when every part succeeded, whatever its label', () => {
    const result = iOS(...parts('success', 'success', 'success'));
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /iOS: every part succeeded/);
  });

  it('passes when the part had no runner and its retry succeeded, and says so', () => {
    const result = iOS(...parts('success', 'unacquired:success', 'success'));
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /iOS tests \(nl\): no runner picked it up; the retry passed/);
    assert.match(result.stdout, /iOS: every part succeeded/);
  });

  it('passes when the build had no runner and the retry (which builds itself) succeeded for both languages', () => {
    const result = iOS(...parts('unacquired:success', 'unacquired:success', 'unacquired:success'));
    assert.equal(result.status, 0, result.stdout);
  });

  it('fails, naming the retry, when the part had no runner and the retry failed', () => {
    const result = iOS(...parts('success', 'unacquired:failure', 'success'));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error::iOS failed: 1 of 3 parts did not succeed/);
    assert.match(
      result.stdout,
      /iOS tests \(nl\): no runner picked it up, and the retry failed \(build or test failure on the retry\)/,
    );
  });

  it('fails when the part had no runner and the retry did not run or was cancelled', () => {
    for (const retry of ['skipped', 'cancelled', '']) {
      const result = iOS(...parts('success', 'success', `unacquired:${retry}`));
      assert.equal(result.status, 1, retry);
      assert.match(result.stdout, /iOS tests \(en\): no runner picked it up/);
      assert.match(result.stdout, /the retry did not pass/);
    }
  });

  it('counts every retry of the build when it had no runner: all must pass (the build is retried per language)', () => {
    const ok = iOS(
      ...parts('unacquired:success+success', 'unacquired:success', 'unacquired:success'),
    );
    assert.equal(ok.status, 0, ok.stdout);
    const bad = iOS(
      ...parts('unacquired:success+failure', 'unacquired:success', 'unacquired:failure'),
    );
    assert.equal(bad.status, 1);
    assert.match(
      bad.stdout,
      /iOS build: no runner picked it up, and the retry did not pass \(success\+failure\)/,
    );
    assert.match(bad.stdout, /iOS tests \(en\): no runner picked it up, and the retry failed/);
    assert.doesNotMatch(bad.stdout, /::error::iOS tests \(nl\)/);
  });

  it('keeps one language apart from the other: a retry that passed for nl does not cover en', () => {
    const result = iOS(...parts('success', 'unacquired:success', 'unacquired:skipped'));
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /iOS tests \(en\): no runner picked it up, and the retry did not pass \(skipped\)/,
    );
    assert.match(result.stdout, /iOS tests \(nl\): no runner picked it up; the retry passed/);
  });

  it('fails as a build or test failure, not as a missing runner, when a runner picked the part up', () => {
    const result = iOS(...parts('success', 'failure', 'cancelled'));
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /iOS tests \(nl\): failed on a runner \(failure\): a build or test failure/,
    );
    assert.match(result.stdout, /iOS tests \(en\): cancelled on a runner/);
    assert.doesNotMatch(result.stdout, /no runner picked it up/);
  });

  it('does not let a retry make up for a failure on a runner', () => {
    const result = iOS(...parts('failure', 'skipped', 'skipped:success'));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /iOS build: failed on a runner \(failure\)/);
    assert.match(result.stdout, /iOS tests \(nl\): did not run \(skipped\)/);
  });

  it('keeps the plain-result form and the summary line of the results for the other gates', () => {
    const result = iOS('success', 'unacquired:failure', 'cancelled');
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /iOS failed: 2 of 3 parts did not succeed \(unacquired:failure cancelled\)/,
    );
  });
});
