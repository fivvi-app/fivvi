import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

// E016 AC2 (spec #479, ticket #1043): the refusals of scripts/restore-drill.sh, which happen before anything is touched.
// The restore itself, the checks and the cleanup need a Postgres and run in packages/database
// (test/restore-drill.integration.test.ts), against a fake `railway` too.
const SCRIPT = join(import.meta.dirname, '..', 'restore-drill.sh');

let dir;
let log;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'restore-drill-'));
  log = join(dir, 'calls.log');
  writeFileSync(log, '');
  // A railway that only records that it was called: a refused run must never reach it.
  writeFileSync(join(dir, 'railway'), `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`);
  chmodSync(join(dir, 'railway'), 0o755);
});
after(() => rmSync(dir, { recursive: true, force: true }));

const run = (args, env = {}) => {
  writeFileSync(log, '');
  const result = spawnSync(SCRIPT, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RESTORE_DRILL_SOURCE_URL: 'x',
      ...env,
    },
  });
  return {
    code: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls: readFileSync(log, 'utf8'),
  };
};

describe('AC2: refuses other environments and future times, before touching anything', () => {
  it('refuses an environment other than development or production', () => {
    for (const environment of ['staging', 'fivvi-pr-1', 'Production', '']) {
      const result = run(['--environment', environment]);
      assert.notEqual(result.code, 0, environment);
      assert.match(result.output, /--environment must be development or production/);
      assert.equal(result.calls, '', 'railway was not called');
    }
    assert.notEqual(run([]).code, 0, 'no environment');
  });

  it('refuses a time in the future', () => {
    const result = run([
      '--environment',
      'production',
      '--at',
      new Date(Date.now() + 60_000).toISOString(),
    ]);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /--at is in the future/);
    assert.equal(result.calls, '');
  });

  it('refuses a time that is not RFC 3339 with an offset', () => {
    for (const at of ['2026-11-10T09:00:00', 'yesterday', '2026-11-10', '']) {
      const result = run(['--environment', 'production', '--at', at]);
      assert.notEqual(result.code, 0, at);
      assert.match(result.output, /--at must be an RFC 3339 time/);
      assert.equal(result.calls, '');
    }
  });

  it('refuses a missing connection URL, and a name that is not a variable name', () => {
    const missing = run(['--environment', 'development'], { RESTORE_DRILL_SOURCE_URL: '' });
    assert.notEqual(missing.code, 0);
    assert.match(missing.output, /RESTORE_DRILL_SOURCE_URL is not set/);
    const odd = run(['--environment', 'development', '--source-url-env', 'a;b']);
    assert.notEqual(odd.code, 0);
    assert.match(odd.output, /upper-case variable name/);
    assert.equal(missing.calls + odd.calls, '');
  });

  it('refuses to keep the scratch service on production, where only development needs it', () => {
    const result = run(['--environment', 'production', '--keep-scratch']);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /--keep-scratch is only for development/);
    assert.equal(result.calls, '');
    assert.equal(result.output.includes('Restore drill:'), false, 'it did not start');
  });

  it('refuses an option it does not know, printing its usage', () => {
    const result = run(['--environment', 'development', '--from-backup', 'abc']);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /restore-drill\.sh --environment/);
    assert.equal(result.calls, '');
  });
});
