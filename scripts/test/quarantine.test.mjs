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
import { checkQuarantine, LISTS, MARKERS, MAX_DAYS } from '../quarantine.mjs';

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
  it('AC1: there is one list per runner, outside every guardrail path, and each starts empty', () => {
    const dir = join(REPO, 'quarantine');
    assert.deepEqual(readdirSync(dir).sort(), LISTS.map((runner) => `${runner}.txt`).sort());
    for (const runner of LISTS) {
      const entries = readFileSync(join(dir, `${runner}.txt`), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.startsWith('#'));
      assert.deepEqual(entries, [], `${runner} starts empty`);
    }
    assert.deepEqual(checkQuarantine({ dir, today: TODAY }), []);
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
