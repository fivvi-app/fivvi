import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { UNCOVERED_MESSAGE, uncovered } from './turbo-inputs.mjs';
import {
  checkQuarantine,
  LISTS,
  MARKERS,
  MAX_DAYS,
  quarantineMode,
  quarantineSelection,
  readList,
  vitestTestNamePattern,
} from '../quarantine.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'quarantine.mjs');
const REPO = join(import.meta.dirname, '..', '..');
const TODAY = '2026-11-12';

/** A quarantine folder with the given lists (runner -> lines); returns its path. */
let base;
let count = 0;
const folder = (lists) => {
  const dir = join(base, `q${count++}`);
  mkdirSync(dir);
  for (const [runner, lines] of Object.entries(lists))
    writeFileSync(join(dir, `${runner}.txt`), `${lines.join('\n')}\n`);
  return dir;
};
const problems = (lines, runner = 'vitest') =>
  checkQuarantine({ dir: folder({ [runner]: lines }), today: TODAY });

// ADR-025, amendment of 12 November 2026, step 4 (spec #1356, ticket #1360): the quarantine lists and the rule that
// keeps them honest.
describe('#1360 the quarantine rule', () => {
  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'quarantine-')));
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  it('AC1: an entry is test | bug | added | end; comments and blank lines are ignored', () => {
    assert.deepEqual(
      problems([
        '# a comment',
        '',
        'checkout > pays an invoice | #1400 | 2026-11-10 | 2026-11-17',
        'sign-in > sends a code | #1401 | 2026-11-12 | 2026-11-12',
      ]),
      [],
    );
  });

  it('AC1: the lists are empty at the start: a missing or empty folder has no problems', () => {
    assert.deepEqual(checkQuarantine({ dir: join(base, 'nothing-here'), today: TODAY }), []);
    assert.deepEqual(problems([]), []);
  });

  it('AC2: an entry without a bug fails', () => {
    const found = problems(['a test | | 2026-11-10 | 2026-11-17']);
    assert.equal(found.length, 1);
    assert.match(found[0], /vitest\.txt:1: .*no bug/);
  });

  it('AC2: an entry without an added date fails', () => {
    const found = problems(['a test | #1400 | | 2026-11-17']);
    assert.equal(found.length, 1);
    assert.match(found[0], /no added date/);
  });

  it('AC2: an entry without an end date fails, also when the field is not there at all', () => {
    for (const line of ['a test | #1400 | 2026-11-10 |', 'a test | #1400 | 2026-11-10']) {
      const found = problems([line]);
      assert.equal(found.length, 1, line);
      assert.match(found[0], /no end date/, line);
    }
  });

  it('AC2: an entry with only a test name names everything that is missing', () => {
    const found = problems(['a test']);
    assert.equal(found.length, 1);
    assert.match(found[0], /no bug, no added date and no end date/);
  });

  it('AC2: an entry with a pipe in its test name (a fifth field) fails', () => {
    const found = problems(['a | b | #1400 | 2026-11-10 | 2026-11-17']);
    assert.equal(found.length, 1);
    assert.match(found[0], /4 fields/);
  });

  it('AC2: a bug that is not an issue number, and a date that is not a date, fail', () => {
    assert.match(
      problems(['t | soon | 2026-11-10 | 2026-11-17'])[0],
      /bug must be an issue number/,
    );
    assert.match(
      problems(['t | #14x | 2026-11-10 | 2026-11-17'])[0],
      /bug must be an issue number/,
    );
    assert.match(problems(['t | #1400 | 10-11-2026 | 2026-11-17'])[0], /added date.*YYYY-MM-DD/);
    assert.match(problems(['t | #1400 | 2026-11-10 | 2026-02-30'])[0], /end date.*YYYY-MM-DD/);
  });

  it(`AC2: an end date more than ${MAX_DAYS} days after the added date fails; exactly ${MAX_DAYS} days passes`, () => {
    assert.deepEqual(problems(['t | #1400 | 2026-11-10 | 2026-11-17']), []);
    const found = problems(['t | #1400 | 2026-11-10 | 2026-11-18']);
    assert.equal(found.length, 1);
    assert.match(found[0], /more than 7 days after/);
  });

  it('AC2: the 7 days count over a month and a year end', () => {
    const dir = folder({
      vitest: ['t | #1400 | 2026-12-28 | 2027-01-04', 'u | #1400 | 2026-12-28 | 2027-01-05'],
    });
    const found = checkQuarantine({ dir, today: '2026-12-29' });
    assert.equal(found.length, 1);
    assert.match(found[0], /vitest\.txt:2: .*more than 7 days/);
  });

  it('AC2: an end date in the past fails (an expired entry); today is still allowed', () => {
    const found = problems(['t | #1400 | 2026-11-01 | 2026-11-08']);
    assert.equal(found.length, 1);
    assert.match(found[0], /expired on 2026-11-08/);
    assert.deepEqual(problems(['t | #1400 | 2026-11-06 | 2026-11-12']), []);
  });

  it('AC2: an end date before the added date, and an added date in the future, fail', () => {
    assert.match(problems(['t | #1400 | 2026-11-10 | 2026-11-09'])[0], /before the added date/);
    assert.match(problems(['t | #1400 | 2026-11-13 | 2026-11-14'])[0], /added date.*future/);
  });

  it('AC2: only the date moves an entry from passing to failing, with the same list', () => {
    const dir = folder({ vitest: ['t | #1400 | 2026-11-10 | 2026-11-17'] });
    assert.deepEqual(checkQuarantine({ dir, today: '2026-11-17' }), []);
    assert.equal(checkQuarantine({ dir, today: '2026-11-18' }).length, 1);
  });

  it('AC3: a test marked as tenant isolation, concurrency or permission fails, in any list', () => {
    assert.deepEqual(MARKERS, ['@isolation', '@concurrency', '@permission']);
    for (const marker of MARKERS)
      for (const runner of LISTS) {
        const found = problems(
          [`workspace > ${marker} > hides data | #1400 | 2026-11-10 | 2026-11-17`],
          runner,
        );
        assert.equal(found.length, 1, `${runner} ${marker}`);
        assert.match(found[0], new RegExp(`${runner}\\.txt:1: .*${marker}`));
        assert.match(found[0], /never quarantined/);
      }
  });

  it('AC3: a marker is a whole tag: @isolations and an email-like word do not count', () => {
    assert.deepEqual(problems(['a@permissions-page test | #1400 | 2026-11-10 | 2026-11-17']), []);
  });

  it('AC3: the marker is not excused by a valid entry; every problem of a line is reported', () => {
    const found = problems(['t @permission | | 2026-11-01 | 2026-11-30']);
    assert.ok(found.length >= 3, found.join('\n'));
  });

  it('AC3: a list the rule does not know is a problem, so a mistyped list is not left unchecked', () => {
    const found = checkQuarantine({
      dir: folder({ vites: ['t | #1400 | 2026-11-10 | 2026-11-17'] }),
      today: TODAY,
    });
    assert.equal(found.length, 1);
    assert.match(
      found[0],
      /vites\.txt: not a list of a runner \(vitest, playwright, xctest, compose, maestro\)/,
    );
  });

  it('AC3: every runner has a list the rule reads', () => {
    for (const runner of LISTS) {
      const found = problems(['t | | 2026-11-10 | 2026-11-17'], runner);
      assert.match(found[0], new RegExp(`${runner}\\.txt:1`), runner);
    }
  });

  it('AC3: a test listed twice in one list fails', () => {
    const entry = 't | #1400 | 2026-11-10 | 2026-11-17';
    const found = problems([entry, entry]);
    assert.equal(found.length, 1);
    assert.match(found[0], /vitest\.txt:2: .*listed twice/);
  });

  describe('the command', () => {
    const run = (dir) => spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });

    it('exits 0 and says so for a clean folder', () => {
      const result = run(folder({ vitest: [] }));
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /quarantine lists: ok/);
    });

    it('exits 1 and prints one line per problem, with the real date: a past end date fails', () => {
      const result = run(folder({ vitest: ['t | #1400 | 2020-01-01 | 2020-01-08'] }));
      assert.equal(result.status, 1);
      assert.match(result.stdout + result.stderr, /vitest\.txt:1: .*expired on 2020-01-08/);
    });
  });
});

describe('#1360 the lists in this repository', () => {
  it('AC1: there is one list per runner, outside every guardrail path, and each passes the rule', () => {
    const dir = join(REPO, 'quarantine');
    assert.deepEqual(readdirSync(dir).sort(), LISTS.map((runner) => `${runner}.txt`).sort());
    // The lists start empty and hold an entry only while a flaky test is in quarantine (#1361: the readers need a list
    // that can hold one, so this no longer asserts that they are empty). Today's date: an entry that expired fails.
    assert.deepEqual(checkQuarantine({ dir }), []);
    // The root tests read the lists, so turbo must take them as inputs of //#test:root.
    assert.deepEqual(
      uncovered(LISTS.map((runner) => `quarantine/${runner}.txt`)),
      [],
      UNCOVERED_MESSAGE,
    );
  });

  it('AC2: the rule runs in Checks (Linux) through turbo, uncached, and in check.sh', () => {
    const turbo = JSON.parse(readFileSync(join(REPO, 'turbo.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
    // CI runs `turbo run … check`; the root task is a dependency of check, and a cached result would not run again
    // when only the date passes.
    assert.ok(turbo.tasks.check.dependsOn.includes('//#check:quarantine'));
    assert.equal(turbo.tasks['//#check:quarantine'].cache, false);
    // Without inputs turbo would hash every file of the root package, and every package's check depends on this task.
    assert.deepEqual(turbo.tasks['//#check:quarantine'].inputs, [
      'quarantine/**',
      'scripts/quarantine.mjs',
    ]);
    assert.equal(pkg.scripts['check:quarantine'], 'node scripts/quarantine.mjs');
    assert.match(
      readFileSync(join(REPO, 'scripts/check.sh'), 'utf8'),
      /check "quarantine lists" node .*quarantine\.mjs/,
    );
  });

  it('the dates are UTC days, and the lists and TESTING.md say so', () => {
    for (const runner of LISTS)
      assert.match(
        readFileSync(join(REPO, 'quarantine', `${runner}.txt`), 'utf8'),
        /dates are UTC days/,
      );
    assert.match(
      readFileSync(join(REPO, 'docs/engineering/TESTING.md'), 'utf8'),
      /dates are UTC days/,
    );
  });

  it('AC4: AGENTS.md lists quarantine among the agent-queueable groups', () => {
    const text = readFileSync(join(REPO, 'AGENTS.md'), 'utf8');
    const line = text.split('\n').find((l) => l.startsWith('- Risk is decided by'));
    assert.match(line, /tooling such as[^;]*, quarantine lists/);
  });
});

// Spec #1356, ticket #1361: the readers of Vitest and Playwright. An entry is a test's full name as the runner prints it,
// without the file or the project: the titles of its describe blocks and its own, joined by ` > ` (Vitest) or ` › `
// (Playwright, whose grep title joins them with a space and ends with the test's tags).
describe('#1361 the list readers', () => {
  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'quarantine-readers-')));
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  const ENTRIES = [
    'clients > lists (all) clients | #1400 | 2026-11-12 | 2026-11-19',
    'sign-in sends a code | #1401 | 2026-11-12 | 2026-11-19',
  ];

  it('readList returns the entries and skips comments and blank lines', () => {
    const dir = folder({ vitest: ['# a comment', '', ...ENTRIES] });
    assert.deepEqual(readList('vitest', { dir }), [
      {
        test: 'clients > lists (all) clients',
        bug: '#1400',
        added: '2026-11-12',
        end: '2026-11-19',
      },
      { test: 'sign-in sends a code', bug: '#1401', added: '2026-11-12', end: '2026-11-19' },
    ]);
  });

  it('readList of a list or a folder that does not exist is empty', () => {
    assert.deepEqual(readList('vitest', { dir: join(base, 'nothing-here') }), []);
    assert.deepEqual(readList('maestro', { dir: folder({ vitest: ENTRIES }) }), []);
  });

  it('the mode is only the listed tests with FIVVI_QUARANTINE=only, and leaving them out otherwise', () => {
    assert.equal(quarantineMode({ FIVVI_QUARANTINE: 'only' }), 'only');
    assert.equal(quarantineMode({}), 'exclude');
    assert.equal(quarantineMode({ FIVVI_QUARANTINE: '' }), 'exclude');
    assert.throws(() => quarantineMode({ FIVVI_QUARANTINE: 'on' }), /FIVVI_QUARANTINE/);
  });

  it('an empty list leaves every test in the required jobs, and selects nothing in the Quarantine job', () => {
    const dir = folder({ vitest: [] });
    const out = quarantineSelection('vitest', { dir, mode: 'exclude' });
    assert.equal(out.exclude, undefined);
    assert.equal(out.only, undefined);
    const only = quarantineSelection('vitest', { dir, mode: 'only' });
    assert.equal(only.exclude, undefined);
    assert.equal(only.only.test('anything at all'), false);
    assert.equal(only.only.test(''), false);
  });

  it('a Vitest entry matches the full name of exactly that test, not a longer or a shorter one', () => {
    const dir = folder({ vitest: ENTRIES });
    const { only } = quarantineSelection('vitest', { dir, mode: 'only' });
    assert.ok(only.test('clients > lists (all) clients'));
    assert.ok(only.test('sign-in sends a code'));
    assert.equal(only.test('sign-in sends a code twice'), false);
    assert.equal(only.test('other sign-in sends a code'), false);
    assert.equal(only.test('clients > lists (all) clients and more'), false);
    // The characters of a regular expression in a name mean themselves.
    assert.equal(only.test('clients > lists (all) clientsss'), false);
    assert.equal(only.test('clients > lists all clients'), false);
  });

  it('the Vitest pattern of the required jobs rejects the listed tests and accepts every other one', () => {
    const dir = folder({ vitest: ENTRIES });
    const pattern = vitestTestNamePattern({ dir, mode: 'exclude' });
    assert.equal(pattern.test('clients > lists (all) clients'), false);
    assert.equal(pattern.test('sign-in sends a code'), false);
    assert.ok(pattern.test('sign-in sends a code twice'));
    assert.ok(pattern.test('billing pays an invoice'));
    const only = vitestTestNamePattern({ dir, mode: 'only' });
    assert.ok(only.test('sign-in sends a code'));
    assert.equal(only.test('billing pays an invoice'), false);
  });

  it('with no entry the required jobs take no pattern at all, and the Quarantine job one that matches nothing', () => {
    const dir = folder({ vitest: [] });
    assert.equal(vitestTestNamePattern({ dir, mode: 'exclude' }), undefined);
    assert.equal(vitestTestNamePattern({ dir, mode: 'only' }).test('a test'), false);
  });

  it('a Playwright entry matches the title of its test in every project, also with the tags Playwright appends', () => {
    const dir = folder({
      playwright: [
        'clients › lists (all) clients | #1400 | 2026-11-12 | 2026-11-19',
        'sign-in sends a code | #1401 | 2026-11-12 | 2026-11-19',
      ],
    });
    const { only, exclude } = quarantineSelection('playwright', { dir, mode: 'exclude' });
    assert.equal(only, undefined);
    // Playwright's grep title: the project, the file, the describe titles and the test (with a leading space where the
    // empty title of the root is part of it).
    for (const [project, lead] of [
      ['nl-NL', ' '],
      ['en', ''],
      ['en', ' '],
    ]) {
      const title = (name) => `${lead}${project} a.spec.ts ${name}`;
      assert.ok(exclude.test(title('sign-in sends a code')));
      assert.ok(exclude.test(title('sign-in sends a code @smoke @smoke')));
      assert.ok(exclude.test(title('clients lists (all) clients')));
      assert.equal(exclude.test(title('clients › lists (all) clients')), false);
      assert.equal(exclude.test(title('sign-in sends a code twice')), false);
      assert.equal(exclude.test(title('other sign-in sends a code')), false);
      assert.equal(exclude.test(title('sends a code')), false);
    }
  });

  it('--count prints how many entries a list has: the Quarantine job runs a runner only when it has some', () => {
    const run = (dir, ...args) =>
      spawnSync('node', [SCRIPT, '--count', ...args], {
        encoding: 'utf8',
        env: { ...process.env, FIVVI_QUARANTINE_DIR: dir },
      });
    const dir = folder({ vitest: ['# comment', ...ENTRIES], playwright: [] });
    assert.equal(run(dir, 'vitest').stdout, '2\n');
    assert.equal(run(dir, 'playwright').stdout, '0\n');
    assert.equal(run(dir, 'xctest').stdout, '0\n');
    const bad = run(dir, 'jest');
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /needs a runner/);
  });

  it('turbo takes the lists and the reader as inputs of the tests it caches, and the mode as their environment', () => {
    const { tasks } = JSON.parse(readFileSync(join(REPO, 'turbo.json'), 'utf8'));
    for (const task of ['test', 'test:integration']) {
      assert.ok(tasks[task].inputs.includes('$TURBO_ROOT$/quarantine/vitest.txt'), task);
      assert.ok(tasks[task].inputs.includes('$TURBO_ROOT$/scripts/quarantine.mjs'), task);
      assert.ok(tasks[task].inputs.includes('$TURBO_DEFAULT$'), task);
      assert.ok(tasks[task].env.includes('FIVVI_QUARANTINE'), task);
    }
    assert.ok(tasks['test:e2e'].inputs.includes('$TURBO_ROOT$/quarantine/playwright.txt'));
    assert.ok(tasks['test:e2e'].inputs.includes('$TURBO_ROOT$/scripts/quarantine.mjs'));
    assert.ok(tasks['test:e2e'].env.includes('FIVVI_QUARANTINE'));
    // A package that lists the inputs of its test task itself replaces the root's, so it needs them too.
    for (const dir of ['apps/web', 'apps/cron']) {
      const { inputs } = JSON.parse(readFileSync(join(REPO, dir, 'turbo.json'), 'utf8')).tasks.test;
      for (const input of [
        '$TURBO_ROOT$/quarantine/vitest.txt',
        '$TURBO_ROOT$/scripts/quarantine.mjs',
        '$TURBO_ROOT$/packages/testing/src/vitest.ts',
      ])
        assert.ok(inputs.includes(input), `${dir}: ${input}`);
    }
  });

  it('a runner without a reader has no selection', () => {
    assert.throws(() => quarantineSelection('xctest', { dir: folder({}) }), /no list reader/);
  });

  it('the selection of another runner is its own: a Vitest entry does not touch Playwright', () => {
    const dir = folder({ vitest: ENTRIES, playwright: [] });
    assert.equal(quarantineSelection('playwright', { dir, mode: 'exclude' }).exclude, undefined);
  });
});
