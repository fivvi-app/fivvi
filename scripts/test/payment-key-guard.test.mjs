// Spec #292 AC17: the check the production payment-secret setup calls before it stores a payment-provider key. A live
// key (Mollie: `live_…`) is refused while `@agent-queue billing` is still in scripts/high-risk-paths.txt, because payment
// code is only agent-queueable while payments run in the provider's test mode; a test key (`test_…`) is accepted. The
// key arrives on stdin, never as an argument. Every key here is an obviously fake fixture (TESTING.md §5.2).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/payment-key-guard.sh');
const REAL_LIST = join(ROOT, 'scripts/high-risk-paths.txt');

const TEST_KEY = 'test_fakekeyfortestsonly';
const LIVE_KEY = 'live_fakekeyfortestsonly';

let work;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'payment-key-guard-'));
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const list = (text) => {
  const path = join(work, 'high-risk-paths.txt');
  writeFileSync(path, text);
  return path;
};

const run = (key, { paths, args = [] } = {}) =>
  spawnSync('bash', [SCRIPT, ...args], {
    input: key,
    encoding: 'utf8',
    env: { ...process.env, ...(paths ? { FIVVI_HIGH_RISK_PATHS: paths } : {}) },
  });

const QUEUEABLE = '@agent-queue auth\n@agent-queue billing\nbilling *billing*\nauth *auth*\n';
const ENDED = '@agent-queue auth\nbilling *billing*\nauth *auth*\n';

describe('payment key guard', () => {
  it('accepts a test-mode key while billing is agent-queueable', () => {
    const result = run(TEST_KEY, { paths: list(QUEUEABLE) });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /test-mode key/);
  });

  it('accepts a test-mode key sent with a trailing newline', () => {
    const result = run(`${TEST_KEY}\n`, { paths: list(QUEUEABLE) });
    assert.equal(result.status, 0, result.stderr);
  });

  it('refuses a live key while the @agent-queue billing line is in the list, and names the line to remove', () => {
    const result = run(LIVE_KEY, { paths: list(QUEUEABLE) });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /live payment-provider key/);
    assert.match(result.stderr, /@agent-queue billing/);
    assert.match(result.stderr, /scripts\/high-risk-paths\.txt/);
    assert.match(result.stderr, /line 2/);
  });

  it('never prints the key', () => {
    for (const paths of [list(QUEUEABLE), list(ENDED)]) {
      for (const key of [LIVE_KEY, TEST_KEY, 'not-a-known-key-format-for-tests']) {
        const result = run(key, { paths });
        assert.ok(!(result.stdout + result.stderr).includes(key), `${key} was printed`);
      }
    }
  });

  it('accepts a live key once the billing line is gone', () => {
    const result = run(LIVE_KEY, { paths: list(ENDED) });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /live key/);
  });

  it('reads a commented-out billing line as removed, and tolerates spacing', () => {
    assert.equal(
      run(LIVE_KEY, { paths: list('# @agent-queue billing\nbilling *billing*\n') }).status,
      0,
    );
    assert.equal(
      run(LIVE_KEY, { paths: list('@agent-queue   billing  \nbilling *billing*\n') }).status,
      1,
    );
  });

  it('does not take another group for billing', () => {
    assert.equal(
      run(LIVE_KEY, { paths: list('@agent-queue billing-extra\nbilling-extra x\n') }).status,
      0,
    );
  });

  it('refuses a key it does not recognise, and an empty one (fail closed)', () => {
    for (const key of [
      'sk_live_fakekeyfortestsonly',
      'live_short',
      'access_fakekeyfortestsonly',
      '',
      '\n',
    ]) {
      for (const paths of [list(QUEUEABLE), list(ENDED)]) {
        const result = run(key, { paths });
        assert.equal(result.status, 1, `${JSON.stringify(key)} was accepted`);
        assert.match(result.stderr, /not a Mollie API key/);
      }
    }
  });

  it('refuses when the list cannot be read (fail closed)', () => {
    const result = run(LIVE_KEY, { paths: join(work, 'missing.txt') });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read/);
  });

  it('takes no argument: a key on the command line would show in the process list', () => {
    const result = run(TEST_KEY, { paths: list(ENDED), args: [TEST_KEY] });
    assert.equal(result.status, 1);
    assert.ok(!result.stderr.includes(TEST_KEY));
  });

  it('refuses a live key with the real list while it still declares billing agent-queueable', () => {
    const real = readFileSync(REAL_LIST, 'utf8');
    assert.match(
      real,
      /^@agent-queue billing\s*$/m,
      'the real list should declare billing agent-queueable',
    );
    const result = run(LIVE_KEY);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /@agent-queue billing/);
    assert.equal(run(TEST_KEY).status, 0);
  });
});
