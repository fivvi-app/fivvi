import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts', 'playwright-deps.sh');
const work = mkdtempSync(join(tmpdir(), 'playwright-deps-'));
after(() => rmSync(work, { recursive: true, force: true }));

// Runs the script with a stand-in `pnpm` that fails its first <failures> calls the way apt does when the runner
// can't resolve the Ubuntu mirror, then succeeds. Returns the result and how often the stand-in was called.
let n = 0;
const run = ({ failures, attempts = '3', delay = '0' }) => {
  const dir = join(work, `case-${n++}`);
  const bin = join(dir, 'bin');
  const count = join(dir, 'calls');
  spawnSync('mkdir', ['-p', bin]);
  writeFileSync(count, '');
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/bin/sh
echo "$*" >>"${count}"
calls=$(wc -l <"${count}")
if [ "$calls" -le ${failures} ]; then
  echo "W: Failed to fetch http://azure.archive.ubuntu.com/ubuntu/dists/noble/InRelease  Temporary failure resolving 'azure.archive.ubuntu.com'" >&2
  exit 100
fi
exit 0
`,
  );
  chmodSync(join(bin, 'pnpm'), 0o755);
  const result = spawnSync(SCRIPT, [], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      PLAYWRIGHT_DEPS_ATTEMPTS: attempts,
      PLAYWRIGHT_DEPS_DELAY: delay,
    },
  });
  const calls = readFileSync(count, 'utf8').split('\n').filter(Boolean);
  return { result, calls };
};

// #1311: E2E (Linux) failed before any test when the runner could not resolve the Ubuntu apt mirror.
describe('#1311 playwright-deps.sh: Chromium OS packages survive a flaky apt mirror', () => {
  it('installs the OS packages of Chromium through the web app Playwright, once when apt works', () => {
    const { result, calls } = run({ failures: 0 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls, ['--filter @fivvi/web exec playwright install-deps chromium']);
  });

  it('tries again after a failure and passes when a later attempt works', () => {
    const { result, calls } = run({ failures: 2 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls.length, 3);
    assert.match(result.stderr, /attempt 1 of 3 failed/);
    assert.match(result.stderr, /attempt 2 of 3 failed/);
  });

  it('fails, with the last status, when every attempt fails (a real problem is not hidden)', () => {
    const { result, calls } = run({ failures: 99 });
    assert.equal(result.status, 100);
    assert.equal(calls.length, 3);
    assert.match(result.stderr, /still failing after 3 attempts/);
  });

  it('refuses a number of attempts that is not a positive whole number', () => {
    for (const attempts of ['0', 'x', '-1']) {
      const { result, calls } = run({ failures: 0, attempts });
      assert.notEqual(result.status, 0, attempts);
      assert.equal(calls.length, 0, attempts);
    }
  });

  it('refuses a pause that is not a whole number of seconds', () => {
    for (const delay of ['x', '-1', '1.5']) {
      const { result, calls } = run({ failures: 0, delay });
      assert.notEqual(result.status, 0, delay);
      assert.match(result.stderr, /PLAYWRIGHT_DEPS_DELAY/, delay);
      assert.equal(calls.length, 0, delay);
    }
  });
});

// The workflow must use the script and not let `playwright install --with-deps` run apt once without a retry.
describe('#1311 ci.yml: the E2E job installs the OS packages through the retry', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

  it('does not call install --with-deps or install-deps directly', () => {
    assert.doesNotMatch(ci, /playwright install[^\n]*--with-deps/);
    assert.doesNotMatch(ci, /playwright install-deps/);
  });

  it('runs scripts/playwright-deps.sh on every run, whether the browser cache hit or not', () => {
    const at = ci.indexOf("- name: Install Chromium's OS packages");
    assert.notEqual(at, -1, 'the step exists');
    const step = ci.slice(at, ci.indexOf('\n\n', at));
    assert.match(step, /run: scripts\/playwright-deps\.sh/);
    assert.doesNotMatch(
      step,
      /\bif:/,
      'the OS packages are not cached, so the step has no condition',
    );
  });

  it('gives that step its own timeout and leaves the job room for it (not cancelled mid-retry)', () => {
    const at = ci.indexOf("- name: Install Chromium's OS packages");
    const step = ci.slice(at, ci.indexOf('\n\n', at));
    const stepMinutes = Number(step.match(/timeout-minutes: (\d+)/)?.[1]);
    assert.ok(stepMinutes > 0, 'the step has a timeout-minutes');
    const job = ci.slice(ci.indexOf('\n  e2e:\n'));
    // The job limit: 25 for a pull request, a merge group and workflow_dispatch; on a push (E002 #1357) the work step may
    // take 20 minutes, so the limit is 35 (`push && 35 || 25`).
    const limit = job.match(
      /^ {4}timeout-minutes: (?:(\d+)|\$\{\{ github\.event_name == 'push' && (\d+) \|\| (\d+) \}\})$/m,
    );
    assert.ok(limit, 'the job has a timeout-minutes');
    const [jobMinutes, pushMinutes] = limit[1]
      ? [Number(limit[1]), Number(limit[1])]
      : [Number(limit[3]), Number(limit[2])];
    assert.ok(
      jobMinutes >= 15 + stepMinutes,
      'the job limit is 15 minutes of work plus the retry step',
    );
    assert.ok(pushMinutes >= jobMinutes, 'a push gets at least as long as the other events');
  });
});
