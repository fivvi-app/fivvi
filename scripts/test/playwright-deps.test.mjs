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
const run = ({ failures, attempts = '3' }) => {
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
      PLAYWRIGHT_DEPS_DELAY: '0',
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
});
