import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SCRIPTS = join(import.meta.dirname, '..');
const SHA = 'a'.repeat(40);

const run = (body, filter) => {
  const result = spawnSync('jq', ['-c', '-L', SCRIPTS, `include "records"; ${filter}`], {
    input: JSON.stringify(body),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

describe('records.jq', () => {
  it('reads the last line that records the mark, whatever the line ending', () => {
    const body = `intro\r\n**Self-review:** \`${'b'.repeat(40)}\`: old\r\n\n**Self-review:** \`${SHA}\`: clean\r\n`;
    assert.equal(run(body, 'record("Self-review")'), `**Self-review:** \`${SHA}\`: clean`);
  });

  it('is null when no line records the mark, or the body is empty or null', () => {
    assert.equal(run('**Merge gate:** x', 'record("Self-review")'), null);
    assert.equal(run('', 'record("Self-review")'), null);
    assert.equal(run(null, 'record("Self-review")'), null);
  });

  it('matches the whole mark at the start of a line only', () => {
    assert.equal(run('see **Self-review:** here', 'record("Self-review")'), null);
    assert.equal(run('**Self-review (old):** x', 'record("Self-review")'), null);
  });

  it('names the commit a record line carries, or null', () => {
    assert.equal(run(`**Self-review:** \`${SHA}\`: ok`, 'record_sha'), SHA);
    assert.equal(run('**Self-review:** no commit', 'record_sha'), null);
    assert.equal(run(null, 'record_sha'), null);
  });
});
