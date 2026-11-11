import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { checkDocLists } from '../doc-lists.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'doc-lists.mjs');
const REPO = join(import.meta.dirname, '..', '..');
const DOC = 'docs/engineering/OBSERVABILITY.md';

/** An OBSERVABILITY.md with the sections the check reads; the parts are the lines of each list. */
const doc = ({
  live = ['- `alpha_done` (F001)', '- `beta_done` (F002)'],
  liveRows = ['| `alpha_done` | Live | F001 | x |', '| `beta_done` | Live | F002 | x |'],
  plannedRows = ['| `delta_done` | Planned | F004 | x |', '| `gamma_done` | Planned | F003 | x |'],
  tests = [
    '- `packages/api/test/a.test.ts` → `AC1: alpha_done` checks it.',
    '- `packages/api/test/b.test.ts` → `AC1: beta_done` checks it.',
  ],
} = {}) =>
  [
    '# Observability',
    '',
    '## 4. Product events',
    '',
    '### 4.3 Event catalog',
    '',
    'The live events, one per line, alphabetical by name:',
    '',
    ...live,
    '',
    '| Event | Status | Feature | Measures |',
    '|---|---|---|---|',
    ...liveRows,
    '',
    'The planned events:',
    '',
    '| Event | Status | Feature | Measures |',
    '|---|---|---|---|',
    ...plannedRows,
    '',
    '### 4.4 Testing',
    '',
    ...tests,
    '',
    '## 5. Page views',
    '',
    '- `zzz_not_checked` here',
    '- `aaa_not_checked` here',
    '',
  ].join('\n');

// E001 #1271: the lists features append to are one entry per line, in a fixed order, so two PRs that add different
// entries edit different lines.
describe('#1271: the lists of OBSERVABILITY.md are one entry per line, in order', () => {
  let base;
  let n = 0;
  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'doc-lists-')));
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  /** A fresh fixture repository holding `files` (path -> text). */
  const fixture = (files) => {
    const dir = join(base, `case-${n++}`);
    mkdirSync(dir, { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return dir;
  };

  it('passes when every list is in order and the live events match the table', () => {
    const dir = fixture({ [DOC]: doc() });
    assert.deepEqual(checkDocLists(dir), []);
    const result = spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('fails when the list of live events is not sorted', () => {
    const dir = fixture({
      [DOC]: doc({ live: ['- `beta_done` (F002)', '- `alpha_done` (F001)'] }),
    });
    const problems = checkDocLists(dir);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /live events list: `alpha_done` must come before `beta_done`/);
    const result = spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /alpha_done/);
  });

  it('fails when an event is listed twice in the list of live events', () => {
    const dir = fixture({
      [DOC]: doc({
        live: ['- `alpha_done` (F001)', '- `alpha_done` (F001)', '- `beta_done` (F002)'],
      }),
    });
    assert.deepEqual(checkDocLists(dir), ['live events list: `alpha_done` is listed twice']);
  });

  it('fails when a table of the catalog is not sorted by event name', () => {
    const dir = fixture({
      [DOC]: doc({
        liveRows: ['| `beta_done` | Live | F002 | x |', '| `alpha_done` | Live | F001 | x |'],
      }),
    });
    assert.deepEqual(checkDocLists(dir), [
      'event table: `alpha_done` must come before `beta_done`',
    ]);
  });

  it('fails when an event has a row twice, in one table or in two', () => {
    const dir = fixture({
      [DOC]: doc({
        plannedRows: [
          '| `alpha_done` | Planned | F001 | x |',
          '| `gamma_done` | Planned | F003 | x |',
        ],
      }),
    });
    assert.deepEqual(checkDocLists(dir), ['event table: `alpha_done` is listed twice']);
  });

  it('fails when the live events and the Live rows of the table differ', () => {
    const dir = fixture({
      [DOC]: doc({
        live: ['- `alpha_done` (F001)'],
        plannedRows: ['| `gamma_done` | Live | F003 | x |'],
      }),
    });
    assert.deepEqual(checkDocLists(dir).sort(), [
      '`beta_done` has a Live row but is not in the live events list',
      '`gamma_done` has a Live row but is not in the live events list',
    ]);
    const other = fixture({
      [DOC]: doc({
        live: ['- `alpha_done` (F001)', '- `beta_done` (F002)', '- `zeta_done` (F009)'],
      }),
    });
    assert.deepEqual(checkDocLists(other), [
      '`zeta_done` is in the live events list but has no Live row',
    ]);
  });

  it('fails when the test references of the event testing section are not sorted by path', () => {
    const dir = fixture({
      [DOC]: doc({
        tests: [
          '- `packages/api/test/b.test.ts` → `AC1: beta_done` checks it.',
          '- `packages/api/test/a.test.ts` → `AC1: alpha_done` checks it.',
        ],
      }),
    });
    assert.deepEqual(checkDocLists(dir), [
      'event testing: `packages/api/test/a.test.ts` must come before `packages/api/test/b.test.ts`',
    ]);
  });

  it('accepts two test references to one file, and reads only the catalog and the testing section', () => {
    const dir = fixture({
      [DOC]: doc({
        tests: [
          '- `packages/api/test/a.test.ts` → `AC1: alpha_done` checks it.',
          '- `packages/api/test/a.test.ts` → `AC2: beta_done` checks it.',
        ],
      }),
    });
    assert.deepEqual(checkDocLists(dir), []);
  });

  it('fails when a section the check reads is gone, and has nothing to check without the document', () => {
    const dir = fixture({ [DOC]: '# Observability\n\n## 4. Product events\n' });
    assert.deepEqual(checkDocLists(dir), [
      'no "### 4.3 Event catalog" section',
      'no "### 4.4 Testing" section',
    ]);
    assert.deepEqual(checkDocLists(fixture({ 'docs/engineering/OTHER.md': '# Other\n' })), []);
  });

  it('holds for the real OBSERVABILITY.md', () => {
    assert.deepEqual(checkDocLists(REPO), []);
    assert.ok(readFileSync(join(REPO, DOC), 'utf8').includes('### 4.3 Event catalog'));
  });

  it('keeps every live event of the real document on a line of its own, under 400 characters', () => {
    const text = readFileSync(join(REPO, DOC), 'utf8');
    const section = text.slice(
      text.indexOf('### 4.3 Event catalog'),
      text.indexOf('### 4.4 Testing'),
    );
    const bullets = section.split('\n').filter((line) => /^- `[a-z_]+` \(/.test(line));
    assert.ok(bullets.length >= 20, `found ${bullets.length} live event lines`);
    for (const bullet of bullets) assert.ok(bullet.length < 400, bullet);
  });
});
