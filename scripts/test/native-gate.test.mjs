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
