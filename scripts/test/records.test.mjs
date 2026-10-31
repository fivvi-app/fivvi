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

// The self-review, smoke and merge gate records are ADR-016's; the reasons reader below is ADR-021's.
describe('ADR-016: records.jq reads the records pr.sh writes', () => {
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

describe('ADR-021: records.jq reads the reasons of a record', () => {
  it('names the reasons after the commit in a record line, or null', () => {
    assert.equal(
      run(
        `**High-risk agent merge:** \`${SHA}\`: a.ts: auth (*auth*); b.ts: auth (*auth*)`,
        'record_reasons',
      ),
      'a.ts: auth (*auth*); b.ts: auth (*auth*)',
    );
    assert.equal(
      run(
        `**Merge gate:** refused on \`${SHA}\`: checks passed (failing: Android)`,
        'record_reasons',
      ),
      'checks passed (failing: Android)',
    );
    assert.equal(run('**Self-review:** no commit', 'record_reasons'), null);
    assert.equal(run(null, 'record_reasons'), null);
  });
});

describe('ADR-025: records.jq reads the re-queue record', () => {
  const line = (sha) =>
    `**Merge queue:** re-queued \`${sha}\` after #353 fixed the check that removed it`;
  const requeued = (body, sha = SHA) =>
    run(body, `requeued_after_fix("Merge queue"; ${JSON.stringify(sha)})`);

  it('is true for the commit a line at the start of a line names, whatever the line ending', () => {
    assert.equal(requeued(`Closes #57\n\n${line(SHA)}`), true);
    assert.equal(requeued(`Closes #57\r\n${line(SHA)}\r\n`), true);
  });

  it('is false for another commit, the plain queue record, a mention inside a line, or no body', () => {
    const other = 'b'.repeat(40);
    assert.equal(requeued(line(other)), false);
    assert.equal(requeued(`**Merge queue:** added to the merge queue on \`${SHA}\``), false);
    assert.equal(requeued(`see ${line(SHA)}`), false);
    assert.equal(requeued(''), false);
    assert.equal(requeued(null), false);
  });

  it('is false without a commit to ask about', () => {
    assert.equal(run(line(SHA), 'requeued_after_fix("Merge queue"; null)'), false);
  });
});

describe('ADR-025: records.jq reads GitHub times as instants', () => {
  const instant = (time) => run(time, 'instant');

  it('reads a UTC time, with or without fractional seconds', () => {
    assert.equal(instant('2026-10-31T10:00:00Z'), Date.UTC(2026, 9, 31, 10) / 1000);
    assert.equal(instant('2026-10-31T10:00:00.250Z'), Date.UTC(2026, 9, 31, 10) / 1000);
  });

  it('reads an offset as the UTC instant it is: 12:30+02:00 is 10:30Z', () => {
    assert.equal(instant('2026-10-31T12:30:00+02:00'), Date.UTC(2026, 9, 31, 10, 30) / 1000);
    assert.equal(instant('2026-10-31T05:00:00-05:30'), Date.UTC(2026, 9, 31, 10, 30) / 1000);
  });

  it('is null for anything else: an unreadable time never passes', () => {
    for (const value of [
      '2026-10-31T10:00:00',
      '2026-10-31 10:00:00Z',
      '2026-10-31',
      '2026-13-45T25:61:61Z',
      'later',
      '',
      null,
      12,
    ]) {
      assert.equal(instant(value), null, JSON.stringify(value));
    }
  });
});
