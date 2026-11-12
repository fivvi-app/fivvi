import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { jq, jqOutput } from './jq.mjs';

describe('#1294 jq in the scripts tests', () => {
  const stubs = mkdtempSync(join(tmpdir(), 'jq-stub-'));
  const realPath = process.env.PATH;
  after(() => {
    process.env.PATH = realPath;
    delete process.env.FIVVI_TEST_JQ_TIMEOUT_MS;
    rmSync(stubs, { recursive: true, force: true });
  });
  const stubJq = (body) => {
    writeFileSync(join(stubs, 'jq'), `#!/bin/sh\n${body}\n`);
    chmodSync(join(stubs, 'jq'), 0o755);
    process.env.PATH = `${stubs}:${realPath}`;
  };

  it('runs jq on the input and returns its result', () => {
    const result = jq(['-c', '.a'], '{"a":[1,2]}');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '[1,2]\n');
    assert.equal(jqOutput(['-r', '.'], '"x"'), 'x\n');
    assert.notEqual(jq(['-c', '.['], '1').status, 0);
    assert.throws(() => jqOutput(['-c', '.['], '1'), /compile error/);
  });

  it('gives jq no stdin pipe: the input is a file, so there is no pipe to stay open', () => {
    const seen = join(stubs, 'stdin-kind');
    stubJq(
      `if [ -p /dev/stdin ] || [ -S /dev/stdin ]; then echo pipe > "${seen}"; else echo none > "${seen}"; fi\n` +
        'echo done',
    );
    jqOutput(['.'], '1');
    assert.equal(readFileSync(seen, 'utf8'), 'none\n');
  });

  it('fails in bounded time with a clear message when jq does not finish', () => {
    stubJq('exec sleep 60');
    process.env.FIVVI_TEST_JQ_TIMEOUT_MS = '300';
    const started = Date.now();
    assert.throws(() => jq(['.'], '1'), /jq did not finish within 300 ms/);
    assert.ok(Date.now() - started < 15000);
  });
});
