import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const WATCHDOG = join(import.meta.dirname, 'watchdog.mjs');

describe('#1294 the watchdog of the root tests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'watchdog-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const fixture = (name, body) => {
    writeFileSync(join(dir, name), `import { it } from 'node:test';\n${body}\n`);
    return join(dir, name);
  };
  const run = (file, ms) =>
    spawnSync('node', ['--test', `--test-global-setup=${WATCHDOG}`, file], {
      encoding: 'utf8',
      // Without NODE_TEST_CONTEXT the inner runner is a runner of its own, not a test of this one.
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, FIVVI_TEST_WATCHDOG_MS: String(ms) },
      timeout: 60000,
    });

  it('stops a run that is stuck in a blocking call, kills what it started and names it', () => {
    // A test that blocks the event loop of its own process (as a hung spawnSync does), so no test timeout can fire.
    // The sleep takes an argument of its own, so the check below sees only this run's process, not another run's.
    const seconds = `3600.${process.pid}${Math.floor(Math.random() * 1e6)}`;
    const stuck = fixture(
      'stuck.test.mjs',
      `import { spawnSync } from 'node:child_process';\nit('hangs', () => { spawnSync('sleep', ['${seconds}']); });`,
    );
    const started = Date.now();
    const result = run(stuck, 4000);
    assert.ok(Date.now() - started < 30000, 'the run was stopped');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /root tests ran longer than 4 s \(FIVVI_TEST_WATCHDOG_MS\)/);
    assert.ok(result.stderr.includes(`sleep ${seconds}`), 'names the process it was stuck in');
    assert.equal(
      spawnSync('pgrep', ['-f', `sleep ${seconds}`]).status,
      1,
      'nothing is left running',
    );
  });

  it('leaves a run that finishes in time alone', () => {
    const quick = fixture('quick.test.mjs', "it('passes', () => {});");
    const result = run(quick, 30000);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /pass 1/);
  });
});
