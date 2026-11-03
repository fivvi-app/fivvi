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

// #413: a part that no hosted runner picked up always fails the gate; the error says so and that re-queuing is enough,
// and tells it apart from a build or test failure on a runner.
describe('#413 native-gate.sh: parts that had no runner', () => {
  const parts = (build, nl, en) => [
    `iOS build=${build}`,
    `iOS tests (nl)=${nl}`,
    `iOS tests (en)=${en}`,
  ];
  const iOS = (...args) => gate('iOS', 'true', ...args);

  it('passes when every labelled part succeeded', () => {
    const result = iOS(...parts('success', 'success', 'success'));
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /iOS: every part succeeded/);
  });

  it('fails when a part had no runner, says no hosted runner picked it up and that re-queuing the PR is enough', () => {
    const result = iOS(...parts('success', 'unacquired', 'success'));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error::iOS failed: 1 of 3 parts did not succeed/);
    assert.match(
      result.stdout,
      /::error::iOS tests \(nl\): no hosted runner picked it up, so nothing ran .*Re-queue the PR/,
    );
    assert.doesNotMatch(result.stdout, /failed on a runner/);
    assert.doesNotMatch(result.stdout, /iOS tests \(en\):/, 'only the part that had no runner');
  });

  it('names the build when it had no runner, and the tests that never started as not run', () => {
    const result = iOS(...parts('unacquired', 'skipped', 'skipped'));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /iOS build: no hosted runner picked it up.*Re-queue the PR/);
    assert.match(result.stdout, /iOS tests \(nl\): did not run \(skipped\)/);
    assert.match(result.stdout, /iOS tests \(en\): did not run \(skipped\)/);
  });

  it('fails as a build or test failure, not as a missing runner, when a runner picked the part up', () => {
    const result = iOS(...parts('success', 'failure', 'cancelled'));
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /iOS tests \(nl\): failed on a runner \(failure\): a build or test failure/,
    );
    assert.match(result.stdout, /iOS tests \(en\): cancelled on a runner/);
    assert.doesNotMatch(result.stdout, /no hosted runner picked it up/);
    assert.doesNotMatch(result.stdout, /Re-queue/);
  });

  it('says both kinds at once when one part had no runner and another failed', () => {
    const result = iOS(...parts('success', 'unacquired', 'failure'));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /iOS tests \(nl\): no hosted runner picked it up/);
    assert.match(result.stdout, /iOS tests \(en\): failed on a runner/);
  });

  it('has no retry syntax: a result with a suffix is not a success', () => {
    const result = iOS(...parts('success', 'unacquired:success', 'success'));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /iOS tests \(nl\): ended as unacquired:success, not success/);
  });

  it('keeps the plain-result form and the summary line of the results for the other gates', () => {
    const result = gate('Android', 'true', 'success', 'unacquired', 'cancelled');
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /Android failed: 2 of 3 parts did not succeed \(unacquired cancelled\)/,
    );
    assert.doesNotMatch(result.stdout, /::error::part/);
  });
});
