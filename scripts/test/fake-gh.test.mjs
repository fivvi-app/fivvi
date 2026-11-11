// The fake gh is part of every scripts test, so a hang in it hangs the whole check (#1294): under load, the stdin pipe of
// a spawnSync child sometimes never saw its end (40 parallel runs of `jq` on a piped input hung about once in 20,000
// runs; the same runs on a file with stdin closed never did). These tests pin the two guards: jq gets no stdin pipe,
// and a jq that does not finish fails the fake in bounded time with a clear message.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

describe('#1294 the fake gh and its jq child', () => {
  const gh = fakeGh();
  const stubs = mkdtempSync(join(tmpdir(), 'fake-gh-stub-'));
  after(() => {
    gh.cleanup();
    rmSync(stubs, { recursive: true, force: true });
  });

  // A jq that stands in for the real one in front of PATH: `body` is its shell script.
  const stubJq = (body) => {
    writeFileSync(join(stubs, 'jq'), `#!/bin/sh\n${body}\n`);
    chmodSync(join(stubs, 'jq'), 0o755);
  };
  const run = (rules, args, extraEnv = {}) => {
    const env = gh.env(rules);
    return spawnSync(join(env.PATH.split(':')[0], 'gh'), args, {
      encoding: 'utf8',
      env: { ...env, PATH: `${stubs}:${env.PATH}`, ...extraEnv },
      timeout: 20000,
    });
  };

  it('answers --jq with the real jq, also for an empty answer', () => {
    rmSync(join(stubs, 'jq'), { force: true });
    const rules = [{ match: '^pr list', out: [{ number: 2 }, { number: 7 }] }];
    const last = run(rules, ['pr', 'list', '--jq', 'sort_by(.number) | last | .number']);
    assert.equal(last.status, 0, last.stderr);
    assert.equal(last.stdout, '7\n');
    const none = run([{ match: '^pr list', out: '' }], ['pr', 'list', '--jq', '.[]?']);
    assert.equal(none.status, 0, none.stderr);
    assert.equal(none.stdout, '');
  });

  it('gives jq no stdin pipe or socket, so there is nothing left open for it to wait on', () => {
    const seen = join(stubs, 'stdin-kind');
    stubJq(
      `if [ -p /dev/stdin ] || [ -S /dev/stdin ]; then echo pipe > "${seen}"; else echo none > "${seen}"; fi\n` +
        'exec /usr/bin/env -i PATH="$ORIGINAL_PATH" jq "$@"',
    );
    for (const out of [[{ number: 1 }], '']) {
      const result = run([{ match: '^pr list', out }], ['pr', 'list', '--jq', '.'], {
        ORIGINAL_PATH: process.env.PATH,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(seen, 'utf8'), 'none\n', `stdin of jq for ${JSON.stringify(out)}`);
    }
  });

  it('fails in bounded time and says so when jq does not finish', () => {
    stubJq('exec sleep 60');
    const started = Date.now();
    const result = run([{ match: '^pr list', out: [] }], ['pr', 'list', '--jq', '.'], {
      FIVVI_TEST_JQ_TIMEOUT_MS: '500',
    });
    assert.ok(Date.now() - started < 15000, 'the fake gave up');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /fake gh: jq did not finish within 500 ms/);
  });
});
