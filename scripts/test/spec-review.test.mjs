import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const SCRIPTS = join(import.meta.dirname, '..');
const NOW = '2026-11-18T12:00:00Z';

const SPEC_BODY = `## Problem

Something.

## Acceptance criteria

- [ ] **AC1** A trainer can repeat a class weekly (NL/EN)
- [x] **AC2** The series survives a DST change

### Platforms

- [ ] not a criterion: it sits under a deeper heading of its own

## Test plan

- [ ] not a criterion either
`;
const TICKET_BODY = (...criteria) =>
  `Brief.\n\n## Acceptance criteria\n\n${criteria.map((c) => `- [ ] ${c}`).join('\n')}\n`;

const pull = (number, sha, mergedAt, files, extra = {}) => ({
  __typename: 'PullRequest',
  number,
  title: `[F022] PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  merged: true,
  mergedAt,
  mergeCommit: { oid: sha },
  files: { totalCount: files.length, nodes: files.map((path) => ({ path })) },
  ...extra,
});
const closedBy = (closer) => ({ timelineItems: { nodes: closer ? [{ closer }] : [] } });
const SHA60 = '6'.repeat(40);
const SHA61 = '7'.repeat(40);

const graph = (nodes, { totalCount = nodes.length, body = SPEC_BODY, state = 'OPEN' } = {}) => ({
  data: {
    repository: {
      issue: {
        number: 50,
        title: '[F022] Weekly series',
        state,
        url: 'https://github.com/o/r/issues/50',
        body,
        subIssues: { totalCount, nodes },
      },
    },
  },
});
const ticket = (number, title, state, body, closer) => ({
  number,
  title,
  state,
  url: `https://github.com/o/r/issues/${number}`,
  body,
  ...closedBy(closer),
});
const FIXTURE = () =>
  graph([
    ticket(
      51,
      'Expand a series',
      'CLOSED',
      TICKET_BODY('Expansion honours DST', 'Edits take a scope'),
      pull(60, SHA60, '2026-11-17T10:00:00Z', [
        'packages/domain/series.ts',
        'packages/api/series.ts',
      ]),
    ),
    ticket(
      52,
      'Series API',
      'CLOSED',
      TICKET_BODY('The API lists a series'),
      pull(60, SHA60, '2026-11-17T10:00:00Z', [
        'packages/domain/series.ts',
        'packages/api/series.ts',
      ]),
    ),
    ticket(53, 'Series UI', 'OPEN', TICKET_BODY('The web shows a series'), null),
    ticket(
      54,
      'DST bug in the series',
      'CLOSED',
      TICKET_BODY('A series over the October change keeps its local time'),
      pull(61, SHA61, '2026-11-18T08:00:00Z', ['packages/domain/series.ts']),
    ),
  ]);
const GRAPH = (n = 50) => `^api graphql .*-F n=${n} `;

describe('spec-review.sh (ADR-034)', () => {
  const gh = fakeGh();
  let repo;
  let remote;
  let mainSha;
  const git = (...args) =>
    execFileSync(
      'git',
      ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      { encoding: 'utf8' },
    ).trim();

  before(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'spec-review-')));
    remote = realpathSync(mkdtempSync(join(tmpdir(), 'spec-review-remote-')));
    execFileSync('git', ['init', '--quiet', '--bare', remote]);
    cpSync(SCRIPTS, join(repo, 'scripts'), { recursive: true });
    cpSync(join(SCRIPTS, '..', '.gitignore'), join(repo, '.gitignore'));
    git('init', '--quiet', '--initial-branch=main');
    git('add', '.');
    git('commit', '--quiet', '-m', 'chore: base');
    git('remote', 'add', 'origin', 'https://github.com/o/r.git');
    git('config', `url.${remote}.insteadOf`, 'https://github.com/o/r.git');
    git('push', '--quiet', 'origin', 'main');
    git('fetch', '--quiet', 'origin');
    mainSha = git('rev-parse', 'origin/main');
  });
  after(() => {
    gh.cleanup();
    rmSync(repo, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  });
  beforeEach(() => rmSync(join(repo, '.work'), { recursive: true, force: true }));

  const run = (rules, ...args) => {
    const result = spawnSync(join(repo, 'scripts/spec-review.sh'), args, {
      cwd: repo,
      encoding: 'utf8',
      env: { ...gh.env(rules), FIVVI_NOW: NOW },
    });
    return { ...result, calls: gh.calls().map((call) => call.args) };
  };
  const file = () => join(repo, '.work', 'spec-50', 'spec-review.md');

  describe('map', () => {
    it('lists every acceptance criterion with the ticket that owns it, its state, PR, squash commit and files', () => {
      const result = run([{ match: GRAPH(), out: FIXTURE() }], 'map', '50');
      assert.equal(result.status, 0, result.stderr);
      const out = result.stdout;
      assert.match(out, /^# Spec review map: #50 \[F022\] Weekly series/m);
      // The spec's own criteria stop at the next heading of the same or a higher level; a deeper heading stays inside.
      assert.match(out, /S1.*A trainer can repeat a class weekly/);
      assert.match(out, /S2.*The series survives a DST change/);
      assert.match(out, /S3.*not a criterion: it sits under a deeper heading/);
      assert.doesNotMatch(out, /not a criterion either/);
      assert.match(out, /#51\.1.*Expansion honours DST/);
      assert.match(out, /#51\.2.*Edits take a scope/);
      assert.match(out, /#52\.1.*The API lists a series/);
      assert.match(out, /#53\.1.*The web shows a series.*OPEN/);
      assert.match(out, new RegExp(`PR #60.*${SHA60}`));
      assert.match(out, new RegExp(`PR #61.*${SHA61}`));
      assert.match(out, /packages\/domain\/series\.ts/);
      assert.match(out, /## #53 .*OPEN\nOpen: no PR has closed it yet/);
    });

    it('--json is the same map as data', () => {
      const result = run([{ match: GRAPH(), out: FIXTURE() }], 'map', '50', '--json');
      assert.equal(result.status, 0, result.stderr);
      const map = JSON.parse(result.stdout);
      assert.equal(map.spec.number, 50);
      assert.deepEqual(
        map.spec.criteria.map((c) => [c.id, c.checked]),
        [
          ['S1', false],
          ['S2', true],
          ['S3', false],
        ],
      );
      assert.deepEqual(
        map.tickets.map((t) => [t.number, t.state, t.pr?.number ?? null]),
        [
          [51, 'CLOSED', 60],
          [52, 'CLOSED', 60],
          [53, 'OPEN', null],
          [54, 'CLOSED', 61],
        ],
      );
      assert.deepEqual(
        map.tickets[0].criteria.map((c) => c.id),
        ['#51.1', '#51.2'],
      );
      assert.equal(map.tickets[0].pr.commit, SHA60);
      assert.deepEqual(map.tickets[0].pr.files, [
        'packages/domain/series.ts',
        'packages/api/series.ts',
      ]);
      assert.equal(map.last_merged_at, '2026-11-18T08:00:00Z');
    });

    it('a ticket closed without a merged PR has no PR, and says so', () => {
      const closer = { __typename: 'Issue', number: 99 };
      const result = run(
        [
          {
            match: GRAPH(),
            out: graph([ticket(51, 'Gone', 'CLOSED', TICKET_BODY('x'), closer)]),
          },
        ],
        'map',
        '50',
        '--json',
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).tickets[0].pr, null);
    });

    it('a PR that was closed without merging is no PR of the ticket', () => {
      const closed = pull(70, 'a'.repeat(40), null, ['x.ts'], {
        merged: false,
        mergedAt: null,
        mergeCommit: null,
      });
      const result = run(
        [{ match: GRAPH(), out: graph([ticket(51, 'T', 'CLOSED', TICKET_BODY('x'), closed)]) }],
        'map',
        '50',
        '--json',
      );
      assert.equal(JSON.parse(result.stdout).tickets[0].pr, null);
    });

    it('marks a PR whose files do not all fit in the answer', () => {
      const many = pull(60, SHA60, '2026-11-17T10:00:00Z', ['a.ts'], {
        files: { totalCount: 150, nodes: [{ path: 'a.ts' }] },
      });
      const result = run(
        [{ match: GRAPH(), out: graph([ticket(51, 'T', 'CLOSED', TICKET_BODY('x'), many)]) }],
        'map',
        '50',
      );
      assert.match(result.stdout, /1 of 150 files/);
    });

    it('fails when the sub-issues are not all in the answer, never a partial map', () => {
      const result = run(
        [
          {
            match: GRAPH(),
            out: graph([ticket(51, 'T', 'OPEN', TICKET_BODY('x'), null)], { totalCount: 101 }),
          },
        ],
        'map',
        '50',
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not all .*sub-issues/);
      assert.equal(result.stdout, '');
    });

    it('fails when GitHub cannot be read, or there is no such issue', () => {
      for (const rule of [
        { match: GRAPH(), out: '', status: 1 },
        { match: GRAPH(), out: { data: { repository: { issue: null } } } },
      ]) {
        const result = run([rule], 'map', '50');
        assert.equal(result.status, 1);
        assert.match(result.stderr, /could not read #50/);
      }
    });

    it('needs a spec number and takes only --json', () => {
      for (const args of [
        ['map'],
        ['map', 'x'],
        ['map', '50', '--yaml'],
        ['map', '50', '--json', 'x'],
      ]) {
        assert.equal(run([], ...args).status, 1, args.join(' '));
      }
    });
  });

  describe('record', () => {
    it('appends a line with the date, the scope, the verdict and the SHA of origin/main', () => {
      let result = run([], 'record', '50', '--slice', '60', 'clean');
      assert.equal(result.status, 0, result.stderr);
      result = run([], 'record', '50', '--final', 'not-clean', '--findings', '2');
      assert.equal(result.status, 0, result.stderr);
      assert.ok(existsSync(file()));
      const lines = readFileSync(file(), 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('- '));
      assert.deepEqual(lines, [
        `- ${NOW} | slice PR #60 | clean | findings 0 | origin/main ${mainSha}`,
        `- ${NOW} | final | not-clean | findings 2 | origin/main ${mainSha}`,
      ]);
    });

    it('writes under .work of the main checkout, which git ignores', () => {
      run([], 'record', '50', '--final', 'clean');
      assert.ok(existsSync(file()));
      const ignored = spawnSync('git', ['-C', repo, 'check-ignore', '-q', file()]);
      assert.equal(ignored.status, 0, '.work is not git-ignored in the copied checkout');
    });

    it('refuses what it cannot read, and writes nothing', () => {
      for (const args of [
        ['record', '50'],
        ['record', '50', 'clean'],
        ['record', '50', '--slice', 'x', 'clean'],
        ['record', '50', '--slice', '60'],
        ['record', '50', '--final', 'fine'],
        ['record', '50', '--final', '--slice', '60', 'clean'],
        ['record', '50', '--final', 'clean', '--findings', 'many'],
        ['record', 'x', '--final', 'clean'],
      ]) {
        const result = run([], ...args);
        assert.equal(result.status, 1, args.join(' '));
        assert.ok(!existsSync(file()), args.join(' '));
      }
    });

    it('a clean verdict names no findings', () => {
      const result = run([], 'record', '50', '--final', 'clean', '--findings', '3');
      assert.equal(result.status, 1);
      assert.match(result.stderr, /clean .*no findings/);
      assert.ok(!existsSync(file()));
    });

    it('a not-clean verdict says how many findings, at least one', () => {
      for (const args of [
        ['record', '50', '--final', 'not-clean'],
        ['record', '50', '--final', 'not-clean', '--findings', '0'],
      ]) {
        const result = run([], ...args);
        assert.equal(result.status, 1, args.join(' '));
        assert.match(result.stderr, /not-clean .*--findings/);
      }
    });
  });

  describe('status', () => {
    const seed = (...lines) => {
      mkdirSync(join(repo, '.work', 'spec-50'), { recursive: true });
      writeFileSync(file(), `# Spec review #50\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
    };
    const status = (graphRule = { match: GRAPH(), out: FIXTURE() }) =>
      run([graphRule], 'status', '50');
    const main = `origin/main ${'1'.repeat(40)}`;

    it('is covered when the last final record is clean and newer than the last merged PR', () => {
      seed(`2026-11-18T09:00:00Z | final | clean | findings 0 | ${main}`);
      const result = status();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^covered/);
    });

    it('is not covered without a record', () => {
      const result = status();
      assert.equal(result.status, 1);
      assert.match(result.stdout, /^not covered: no final spec review/);
    });

    it('is not covered when a PR merged after the clean record', () => {
      seed(`2026-11-18T07:59:59Z | final | clean | findings 0 | ${main}`);
      const result = status();
      assert.equal(result.status, 1);
      assert.match(result.stdout, /^not covered: .*#61.*merged after/);
    });

    it('is not covered when the last final record is not clean, even after a clean one', () => {
      seed(
        `2026-11-18T09:00:00Z | final | clean | findings 0 | ${main}`,
        `2026-11-18T10:00:00Z | final | not-clean | findings 1 | ${main}`,
      );
      assert.equal(status().status, 1);
    });

    it('is covered by a later clean record after a not-clean one', () => {
      seed(
        `2026-11-18T09:00:00Z | final | not-clean | findings 1 | ${main}`,
        `2026-11-18T10:00:00Z | final | clean | findings 0 | ${main}`,
      );
      assert.equal(status().status, 0);
    });

    it('does not count the review of a slice', () => {
      seed(`2026-11-18T09:00:00Z | slice PR #61 | clean | findings 0 | ${main}`);
      assert.equal(status().status, 1);
    });

    it("reads records and merges only: an open ticket is the phase's business (flow-phase.jq)", () => {
      seed(`2026-11-18T09:00:00Z | final | clean | findings 0 | ${main}`);
      assert.equal(status().status, 0); // the fixture has #53 open
    });

    it('without any merged PR, a clean final record is enough', () => {
      seed(`2026-11-18T09:00:00Z | final | clean | findings 0 | ${main}`);
      const out = graph([ticket(51, 'Gone', 'CLOSED', TICKET_BODY('x'), null)]);
      assert.equal(status({ match: GRAPH(), out }).status, 0);
    });

    it('ignores lines it cannot read, never counting them as a review', () => {
      seed(
        'final clean',
        '2026-11-18T09:00:00Z | final | clean | findings 0',
        `not-a-time | final | clean | findings 0 | ${main}`,
        `2026-11-18T09:00:00Z | final | clean-ish | findings 0 | ${main}`,
      );
      assert.equal(status().status, 1);
    });

    it('exits 2 when GitHub cannot be read, never a covered or not covered answer', () => {
      seed(`2026-11-18T09:00:00Z | final | clean | findings 0 | ${main}`);
      const result = status({ match: GRAPH(), out: '', status: 1 });
      assert.equal(result.status, 2);
      assert.equal(result.stdout, '');
    });
  });

  it('needs a known command', () => {
    for (const args of [[], ['map'], ['publish', '50']]) {
      assert.equal(run([], ...args).status, 1, args.join(' '));
    }
  });
});
