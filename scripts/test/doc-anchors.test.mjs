import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { anchorOf, anchorsOf, checkDocAnchors } from '../doc-anchors.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'doc-anchors.mjs');
const RUNBOOKS = 'docs/engineering/RUNBOOKS.md';
const DRILLS = 'docs/engineering/restore-drills.md';

// E016 #1041, AC7: a link from a runbook or the restore-drill log to a file or a section of a Markdown file fails
// when the file or the heading doesn't exist.
describe('#1041 AC7: runbook links resolve', () => {
  let base;
  let n = 0;
  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'doc-anchors-')));
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  /** A fresh fixture repository holding `files` (path -> text). */
  const fixture = (files) => {
    const dir = join(base, `case-${n++}`);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    mkdirSync(dir, { recursive: true });
    return dir;
  };

  describe('heading to anchor, with GitHub rules', () => {
    it('lower-cases, turns spaces into hyphens and drops punctuation', () => {
      assert.equal(
        anchorOf('4. Restore: Production (the point in time)!'),
        '4-restore-production-the-point-in-time',
      );
      assert.equal(anchorOf('Rollback / fix-forward'), 'rollback--fix-forward');
      assert.equal(anchorOf('Wrong booking'), 'wrong-booking');
      assert.equal(anchorOf('Café `PITR` & [links](x.md) *now*'), 'café-pitr--links-now');
    });

    it('numbers a heading that repeats, like GitHub', () => {
      const anchors = anchorsOf('# Steps\n\n## Steps\n\n## Steps\n\n## Other\n');
      assert.deepEqual([...anchors], ['steps', 'steps-1', 'steps-2', 'other']);
    });

    it('ignores a # line inside a code fence', () => {
      const anchors = anchorsOf('# Real\n\n```sh\n# comment, not a heading\n```\n');
      assert.deepEqual([...anchors], ['real']);
    });
  });

  it('passes when the files and the headings exist', () => {
    const dir = fixture({
      [RUNBOOKS]:
        '# Runbooks\n\n## Restore\n\nSee [the drills](restore-drills.md#drill-log), [ENV](ENVIRONMENTS.md#8-backups), [below](#rollback) and [web](https://example.com/x#y).\n\n## Rollback\n',
      [DRILLS]: '# Restore drills\n\n## Drill log\n\n[back](RUNBOOKS.md#restore)\n',
      'docs/engineering/ENVIRONMENTS.md': '# Environments\n\n## 8. Backups\n',
    });
    assert.deepEqual(checkDocAnchors(dir), []);
    const result = spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('fails on a link to a file that does not exist', () => {
    const dir = fixture({
      [RUNBOOKS]: '# Runbooks\n\n[gone](missing.md) and [gone too](missing.md#top)\n',
    });
    assert.deepEqual(checkDocAnchors(dir), [
      `${RUNBOOKS}: broken link missing.md`,
      `${RUNBOOKS}: broken link missing.md#top`,
    ]);
  });

  it('fails on a link to a heading that does not exist, in another file and in the same file', () => {
    const dir = fixture({
      [RUNBOOKS]: '# Runbooks\n\n[a](restore-drills.md#no-such-section) and [b](#nothing-here)\n',
      [DRILLS]: '# Restore drills\n',
    });
    const result = spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      new RegExp(`${RUNBOOKS}: broken link restore-drills.md#no-such-section`),
    );
    assert.match(result.stdout, new RegExp(`${RUNBOOKS}: broken link #nothing-here`));
  });

  it('checks the restore-drill log too', () => {
    const dir = fixture({
      [DRILLS]: '# Restore drills\n\n[restore](RUNBOOKS.md#restore-of-production)\n',
      [RUNBOOKS]: '# Runbooks\n\n## Restore\n',
    });
    assert.deepEqual(checkDocAnchors(dir), [
      `${DRILLS}: broken link RUNBOOKS.md#restore-of-production`,
    ]);
  });

  it('matches a fragment in any case and with percent-encoding', () => {
    const dir = fixture({
      [RUNBOOKS]: '# Runbooks\n\n## Café\n\n[a](#CAF%C3%89) [b](#Café)\n',
    });
    assert.deepEqual(checkDocAnchors(dir), []);
  });

  it('does not check a link inside a code fence or a section of a file that is not Markdown', () => {
    const dir = fixture({
      [RUNBOOKS]:
        '# Runbooks\n\n```md\n[x](nowhere.md#nothing)\n```\n\n[config](config.json#anything)\n',
      'docs/engineering/config.json': '{}',
    });
    assert.deepEqual(checkDocAnchors(dir), []);
  });

  it('has nothing to check, and does not fail, while the runbooks and the drill log do not exist', () => {
    const dir = fixture({ 'docs/engineering/OTHER.md': '# Other\n\n[x](#missing)\n' });
    assert.deepEqual(checkDocAnchors(dir), []);
    const result = spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('leaves the other Markdown files to the file check of check.sh', () => {
    const dir = fixture({ 'docs/engineering/OTHER.md': '# Other\n\n[x](OTHER.md#missing)\n' });
    assert.deepEqual(checkDocAnchors(dir), []);
  });
});
