import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { cleanEnv } from './clean-env.mjs';

const ROOT = join(import.meta.dirname, '../..');

// #686: install_swiftlint (scripts/_ios.sh) rode out only a few seconds of GitHub errors, so a 504 failed the iOS lane.
// A fake curl fails with HTTP 504 a set number of times and then serves a SwiftLint zip; a fake sleep records the waits.
describe('#686 install_swiftlint: ride out a GitHub outage while downloading SwiftLint', () => {
  let dir;
  let zip;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'swiftlint-install-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const payload = join(dir, 'payload');
    mkdirSync(payload);
    writeFileSync(join(payload, 'swiftlint'), '#!/bin/sh\necho fake swiftlint\n');
    chmodSync(join(payload, 'swiftlint'), 0o755);
    zip = join(dir, 'portable_swiftlint.zip');
    const made = spawnSync('zip', ['-q', '-j', zip, join(payload, 'swiftlint')], {
      encoding: 'utf8',
    });
    assert.equal(made.status, 0, made.stderr);
    const script = (name, body) => {
      writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    };
    // Fails with the 504 of the run in the issue until FAKE_FAILS tries have been made, then writes the zip to `-o`.
    script(
      'curl',
      `count=$(cat "$FAKE_STATE/curl-count" 2>/dev/null || echo 0)
echo $((count + 1)) >"$FAKE_STATE/curl-count"
echo "$*" >>"$FAKE_STATE/curl-args"
if [ "$count" -lt "$FAKE_FAILS" ]; then
  echo "curl: (22) The requested URL returned error: 504" >&2
  exit 22
fi
while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done
cp "${zip}" "$out"`,
    );
    script('sleep', 'echo "$1" >>"$FAKE_STATE/sleeps"');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const install = (fails, name) => {
    const state = join(dir, name);
    mkdirSync(state);
    const sha = createHash('sha256').update(readFileSync(zip)).digest('hex');
    const result = spawnSync(
      'bash',
      [
        '-c',
        `source "${ROOT}/scripts/_lib.sh"; source "${ROOT}/scripts/_ios.sh"
SWIFTLINT_SHA256=${sha}; SWIFTLINT="${state}/tools/swiftlint-x/swiftlint"
install_swiftlint`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...cleanEnv(),
          PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          FAKE_STATE: state,
          FAKE_FAILS: String(fails),
        },
      },
    );
    const read = (file) =>
      existsSync(join(state, file)) ? readFileSync(join(state, file), 'utf8') : '';
    return {
      ...result,
      tries: Number(read('curl-count').trim() || 0),
      sleeps: read('sleeps').split('\n').filter(Boolean).map(Number),
      installed: existsSync(join(state, 'tools/swiftlint-x/swiftlint')),
    };
  };

  it('installs SwiftLint when GitHub answers 504 a few times and then serves it, saying which try failed and why', () => {
    const result = install(3, 'recovers');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.tries, 4);
    assert.ok(result.installed, 'the binary is unpacked');
    assert.match(
      result.stderr,
      /SwiftLint download: try 1 of \d+ failed \(.*504.*\); waiting \d+ s/,
    );
    assert.match(result.stderr, /try 3 of \d+ failed/);
    assert.doesNotMatch(result.stderr, /try 4 of \d+ failed/);
  });

  it('waits longer after each failure and for at least 60 s in all before it gives up', () => {
    const result = install(1000, 'always');
    assert.equal(result.status, 1, 'the install still fails');
    assert.ok(result.tries >= 6, `${result.tries} tries`);
    assert.deepEqual(
      result.sleeps,
      [...result.sleeps].sort((a, b) => a - b),
      'the waits never shrink',
    );
    assert.ok(result.sleeps[result.sleeps.length - 1] > result.sleeps[0], 'the waits grow');
    assert.ok(
      result.sleeps.reduce((sum, wait) => sum + wait, 0) >= 60,
      `${result.sleeps} adds up to 60 s`,
    );
    assert.equal(result.sleeps.length, result.tries - 1, 'no wait after the last try');
    assert.ok(!result.installed);
  });

  it('fails with the same message, and leaves no partial download, when every try fails', () => {
    const result = install(1000, 'message');
    assert.match(result.stderr, /try \d+ of \d+ failed \(.*504.*\)/);
    assert.match(result.stderr, /could not download SwiftLint \d+\.\d+\.\d+ after \d+ tries/);
    assert.ok(!existsSync(join(dir, 'message/tools/swiftlint-x.zip.partial')));
  });

  it('still refuses a download that does not match its SHA-256', () => {
    const state = join(dir, 'sha');
    mkdirSync(state);
    const result = spawnSync(
      'bash',
      [
        '-c',
        `source "${ROOT}/scripts/_lib.sh"; source "${ROOT}/scripts/_ios.sh"
SWIFTLINT="${state}/tools/swiftlint-x/swiftlint"
install_swiftlint`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...cleanEnv(),
          PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          FAKE_STATE: state,
          FAKE_FAILS: '0',
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /doesn't match its SHA-256/);
  });
});
