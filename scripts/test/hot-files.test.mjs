// #1485 (spec #1481): the hot files PRs collide on, the tags that make a ticket wait, and the overlap of a branch with
// the other open PRs (scripts/hot-files.mjs), as pure functions and through the CLI the scripts call.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  CONTRACT_SPEC,
  HOT_FILES,
  holds,
  isHot,
  kindsOf,
  MIGRATIONS,
  overlap,
  tagged,
} from '../hot-files.mjs';
import { GROUPS } from '../regenerate.mjs';

const pr = (number, files, extra = {}) => ({
  number,
  title: `PR ${number}`,
  headRefName: 'docs/x',
  closingIssuesReferences: [],
  files,
  ...extra,
});

describe('the tags of a ticket title', () => {
  it('reads API and DB from the parenthesis, exactly', () => {
    assert.deepEqual(kindsOf('[F1] Foundation (DB, domain, API)'), {
      contract: true,
      migration: true,
    });
    assert.deepEqual(kindsOf('[F1] A route (API)'), { contract: true, migration: false });
    assert.deepEqual(kindsOf('[F1] Tables (domain,DB)'), { contract: false, migration: true });
    for (const title of [
      '[F1] Web: the card',
      '[F1] See the API docs (optional)',
      '[F1] The DB layer',
      '[F1] Fix (api, db)',
      '[F1] Through the API (see the API docs)',
      undefined,
    ]) {
      assert.deepEqual(kindsOf(title), { contract: false, migration: false }, String(title));
    }
  });

  it('keeps only the tickets that can be held', () => {
    const tickets = [
      { number: 1, title: 'a (API)' },
      { number: 2, title: 'b (web)' },
      { number: 3, title: 'c (DB, cron)' },
    ];
    assert.deepEqual(
      tagged(tickets).map((t) => t.number),
      [1, 3],
    );
  });
});

describe('the hot files', () => {
  it('hold the contract, the migrations, the sorted lists and every generated path of scripts/regenerate.mjs', () => {
    for (const path of [
      CONTRACT_SPEC,
      `${MIGRATIONS}/0001_x.sql`,
      `${MIGRATIONS}/meta/_journal.json`,
      'packages/i18n/en.json',
      'packages/i18n/nl-NL.json',
      'packages/i18n/comments.json',
      'packages/api/test/isolation/isolation-cases.ts',
      'packages/domain/src/index.ts',
      'packages/database/src/index.ts',
      'packages/database/README.md',
      'docs/engineering/OBSERVABILITY.md',
      'packages/api/lint/repository-only-imports.test.ts',
    ]) {
      assert.equal(isHot(path), true, path);
    }
    for (const group of GROUPS)
      for (const generated of group.generated) {
        assert.equal(isHot(generated), true, generated);
        assert.equal(isHot(`${generated}/file.ts`), true, generated);
      }
    assert.deepEqual(HOT_FILES, [...HOT_FILES].sort());
  });

  it('leave out ordinary files and the owner-only product docs', () => {
    for (const path of [
      'apps/web/page.tsx',
      'packages/api/src/routes/x.ts',
      'packages/database/migrations-notes.md',
      'docs/product/FEATURES.md',
      'packages/i18n/en.jsonx',
    ]) {
      assert.equal(isHot(path), false, path);
    }
  });
});

describe('holds', () => {
  const api = { number: 10, title: 'x (API)' };
  const db = { number: 11, title: 'y (DB)' };

  it('names the lowest PR that changes the contract or a migration, one per reason', () => {
    const prs = [
      pr(30, [CONTRACT_SPEC]),
      pr(20, [CONTRACT_SPEC]),
      pr(25, [`${MIGRATIONS}/0042_x.sql`]),
    ];
    assert.deepEqual(holds(prs, [api, db]), [
      { number: 10, waits: [{ pr: 20, reason: 'API contract' }] },
      { number: 11, waits: [{ pr: 25, reason: 'migration' }] },
    ]);
    assert.deepEqual(holds(prs, [{ number: 12, title: 'z (DB, API)' }]), [
      {
        number: 12,
        waits: [
          { pr: 20, reason: 'API contract' },
          { pr: 25, reason: 'migration' },
        ],
      },
    ]);
  });

  it('holds nothing without such a PR, and never an untagged ticket', () => {
    assert.deepEqual(holds([pr(20, ['apps/web/a.ts'])], [api, db]), []);
    assert.deepEqual(
      holds([pr(20, [CONTRACT_SPEC, `${MIGRATIONS}/0042_x.sql`])], [{ number: 13, title: 'w' }]),
      [],
    );
    assert.deepEqual(holds([], [api]), []);
  });

  it('never holds a ticket by its own PR', () => {
    assert.deepEqual(holds([pr(20, [CONTRACT_SPEC], { headRefName: 'feature/10-x' })], [api]), []);
    assert.deepEqual(
      holds([pr(20, [CONTRACT_SPEC], { closingIssuesReferences: [{ number: 10 }] })], [api]),
      [],
    );
    assert.equal(
      holds([pr(20, [CONTRACT_SPEC], { headRefName: 'feature/100-x' })], [api]).length,
      1,
    );
  });

  it('reads files given as objects too', () => {
    assert.equal(holds([pr(20, [{ path: CONTRACT_SPEC }])], [api]).length, 1);
  });
});

describe('overlap', () => {
  it('lists each other open PR with the hot files it shares with the branch, sorted', () => {
    const prs = [
      pr(61, ['packages/i18n/en.json', CONTRACT_SPEC, 'apps/web/a.ts']),
      pr(62, ['apps/web/a.ts']),
    ];
    assert.deepEqual(overlap(prs, [CONTRACT_SPEC, 'packages/i18n/en.json', 'apps/web/a.ts'], {}), [
      { pr: 61, title: 'PR 61', files: [CONTRACT_SPEC, 'packages/i18n/en.json'] },
    ]);
  });

  it('skips the branch’s own PR and the PRs of its issues', () => {
    const prs = [
      pr(60, [CONTRACT_SPEC], { headRefName: 'feature/57-x' }),
      pr(61, [CONTRACT_SPEC], { closingIssuesReferences: [{ number: 58 }] }),
      pr(62, [CONTRACT_SPEC], { headRefName: 'feature/59-y' }),
      pr(63, [CONTRACT_SPEC]),
    ];
    assert.deepEqual(
      overlap(prs, [CONTRACT_SPEC], { branch: 'feature/57-x', issues: ['57', '58', '59'] }).map(
        (o) => o.pr,
      ),
      [63],
    );
  });

  it('is empty when the branch changes no hot file', () => {
    assert.deepEqual(overlap([pr(61, [CONTRACT_SPEC])], ['apps/web/a.ts'], {}), []);
  });
});

describe('the CLI', () => {
  const run = (command, input) =>
    spawnSync('node', [join(import.meta.dirname, '../hot-files.mjs'), command], {
      encoding: 'utf8',
      input: typeof input === 'string' ? input : JSON.stringify(input),
    });

  it('answers JSON for tagged, holds and overlap', () => {
    assert.deepEqual(
      JSON.parse(
        run('tagged', [
          { number: 1, title: 'a (API)' },
          { number: 2, title: 'b' },
        ]).stdout,
      ),
      [{ number: 1, title: 'a (API)' }],
    );
    assert.deepEqual(
      JSON.parse(
        run('holds', { prs: [pr(20, [CONTRACT_SPEC])], tickets: [{ number: 1, title: 'a (API)' }] })
          .stdout,
      ),
      [{ number: 1, waits: [{ pr: 20, reason: 'API contract' }] }],
    );
    assert.equal(
      JSON.parse(
        run('overlap', {
          prs: [pr(20, [CONTRACT_SPEC])],
          changed: [CONTRACT_SPEC],
          branch: 'feature/1-x',
          issues: [],
        }).stdout,
      ).length,
      1,
    );
  });

  it('answers the hot ones of a list of paths for hot, [] when there is none', () => {
    assert.deepEqual(
      JSON.parse(
        run('hot', ['apps/web/page.tsx', CONTRACT_SPEC, `${MIGRATIONS}/0001_x.sql`]).stdout,
      ),
      [CONTRACT_SPEC, `${MIGRATIONS}/0001_x.sql`],
    );
    assert.deepEqual(JSON.parse(run('hot', ['apps/web/page.tsx']).stdout), []);
    assert.deepEqual(JSON.parse(run('hot', []).stdout), []);
  });

  it('fails on input that is not JSON, and on an unknown command', () => {
    const bad = run('holds', 'nope');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /not JSON/);
    assert.equal(run('nothing', {}).status, 2);
  });
});
