// ADR-033 item 2 (#1422): one PR per platform slice of a spec. The platform of a ticket and the pick of a slice
// (scripts/slice.jq), `flow.sh start --slice`, `pr.sh create` for a slice, the line warning, and `flow.sh status` and
// `finish` for a slice PR.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';
import { jqOutput } from './jq.mjs';

const SCRIPTS = join(import.meta.dirname, '..');
const labels = (...names) => names.map((name) => ({ name }));

describe('ADR-033 platform of a ticket (scripts/slice.jq)', () => {
  const platformsOf = (tickets) =>
    JSON.parse(
      jqOutput(
        ['-c', '-L', SCRIPTS, 'include "slice"; map(platform)'],
        JSON.stringify(tickets.map(([title, ...names]) => ({ title, labels: names }))),
      ),
    );

  it('reads the platform from the way tickets are named today', () => {
    const expected = [
      ['[F054] Fivvi Android: the Deze week card on Home', 'android'],
      ['[F054] Fivvi Pro Android: Account verwijderen on Profiel', 'android'],
      ['[F054] Android: QR-code scannen on Fivvi’s no-studio screen', 'android'],
      ['[F055] Fivvi Pro iOS: makeups in the client profile’s Tegoed (TM-03)', 'ios'],
      ['[F055] Fivvi iOS: the renewal card (Verlengen)', 'ios'],
      ['[F055] iOS: Fivvi opens the invitation link and joins the workspace', 'ios'],
      ['[F057] Client web: Home with my schedule (CW-02), the base of the client dashboard', 'web'],
      ['[F057] Web: Uitbetalingen (CM-09), the Owner’s payouts', 'web'],
      ['[F057] Public web: the studio page with the class timetable', 'web'],
      ['[F057] Foundation: Boeken on the client web, the timetable /book/{slug} (PB-01)', 'web'],
      ['[F055] Foundation: a credit plan’s cycles and when credits expire (DB, domain)', 'backend'],
      [
        '[F055] Foundation: the client timetable and class reads, with the list rules (API, domain)',
        'backend',
      ],
      ['[F055] Record a payment outside Fivvi for a client (API)', 'backend'],
      ['[F055] The class level on weekly series through the API', 'backend'],
      ['[F055] Owner invoices API: the list with filters and the PDF download', 'backend'],
      ['[F055] The daily expiry pass writes Vervallen lines once (domain, cron)', 'backend'],
      [
        '[F055] EM-06 Nieuwe boeking to the date’s current trainer when a client books (API, email)',
        'backend',
      ],
    ];
    assert.deepEqual(
      platformsOf(expected.map(([title]) => [title])),
      expected.map(([, platform]) => platform),
    );
  });

  it('gives a ticket that names no platform, or two, none', () => {
    assert.deepEqual(
      platformsOf([
        ['[E001] Runbook: restore production to a point in time'],
        ['[F055] Offers in a workspace that charges no VAT'],
        ['[F054] iOS and Android: the same card on Home'],
        ['[F055] Preview seed: balances with every line type'],
      ]),
      [null, null, null, null],
    );
  });

  it('lets one platform label decide, over the title', () => {
    assert.deepEqual(
      platformsOf([
        ['[F055] Offers in a workspace that charges no VAT', 'ready-for-agent', 'backend'],
        ['[F055] Web: something', 'ready-for-agent', 'ios'],
        ['[F055] Web: something', 'ios', 'android'],
      ]),
      ['backend', 'ios', 'web'],
    );
  });
});

describe('ADR-033 the pick of a slice (scripts/slice.jq)', () => {
  const ticket = (number, title, blockers = []) => ({ number, title, labels: [], blockers });
  const pick = (tickets, platform = 'android', max = 5) =>
    JSON.parse(
      jqOutput(
        [
          '-c',
          '-L',
          SCRIPTS,
          '--argjson',
          'max',
          String(max),
          `include "slice"; pick("${platform}"; $max)`,
        ],
        JSON.stringify(tickets),
      ),
    );
  const A = (n, ...rest) => ticket(n, `Android: card ${n}`, ...rest);

  it('takes the unblocked tickets of one platform, in order, at most 5', () => {
    const tickets = [1, 2, 3, 4, 5, 6, 7].map((n) => A(n));
    tickets.push(ticket(8, 'Web: the card'), ticket(9, 'Foundation: x (DB, domain)'));
    assert.deepEqual(pick(tickets), [1, 2, 3, 4, 5]);
    assert.deepEqual(pick(tickets, 'web'), [8]);
    assert.deepEqual(pick(tickets, 'backend'), [9]);
    assert.deepEqual(pick(tickets, 'ios'), []);
  });

  it('includes a ticket blocked only by tickets in the slice', () => {
    const tickets = [A(1), A(2, [1]), A(3, [1, 2]), A(4)];
    assert.deepEqual(pick(tickets), [1, 2, 3, 4]);
  });

  it('leaves out a ticket blocked by one outside the slice, and one blocked by it in turn', () => {
    const tickets = [
      A(1),
      A(2, [50]), // blocked by something that is not in the slice
      A(3, [2]), // blocked by a ticket that cannot join
      A(4, [1]),
    ];
    assert.deepEqual(pick(tickets), [1, 4]);
  });

  it('leaves out a ticket that waits for one that did not fit in the 5', () => {
    const tickets = [A(1), A(2), A(3), A(4), A(5), A(6, [5]), A(7, [6])];
    assert.deepEqual(pick(tickets), [1, 2, 3, 4, 5]);
  });
});

// A checkout with a bare origin, a copy of scripts/ and a stand-in for wt.sh add (the real one fetches and installs
// dependencies): it makes the worktree and the branch with git alone.
function sliceRepo(prefix) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const repo = join(base, 'repo');
  const remote = join(base, 'remote.git');
  execFileSync('git', ['init', '--quiet', '--bare', remote]);
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo]);
  cpSync(SCRIPTS, join(repo, 'scripts'), { recursive: true });
  writeFileSync(join(repo, '.gitignore'), '.work/\n.worktrees/\n');
  // The pipeline switch `flow.sh next` reads (ADR-034).
  mkdirSync(join(repo, '.github'));
  writeFileSync(
    join(repo, '.github/pipeline.json'),
    JSON.stringify({ ci: 'fast', review: 'per-pr' }),
  );
  const git = (...args) =>
    execFileSync(
      'git',
      ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      { encoding: 'utf8' },
    ).trim();
  git('add', '.');
  git('commit', '--quiet', '-m', 'chore: base');
  git('remote', 'add', 'origin', 'https://github.com/o/r.git');
  git('config', `url.${remote}.insteadOf`, 'https://github.com/o/r.git');
  git('push', '--quiet', 'origin', 'main');
  git('fetch', '--quiet');
  return { base, repo, remote, git };
}

const STUB_WT = `#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd -P)"
[ "$1" = add ] || exit 1
git -C "$repo" worktree add --quiet --no-track -b "$2" "$repo/.worktrees/$(echo "$2" | tr / -)" main
echo "worktree ready"
`;

const ticketFacts = (number, title, extra = {}) => ({
  number,
  title,
  state: 'OPEN',
  labels: labels('ready-for-agent'),
  assignees: [],
  body: '## Acceptance criteria\n\n- [ ] it works',
  comments: [],
  parent: {
    number: 9000,
    title: '[F054] Home',
    state: 'OPEN',
    labels: labels('spec', 'spec-approved'),
  },
  subIssues: { totalCount: 0, nodes: [] },
  blockedBy: { nodes: [] },
  ...extra,
});
const blockedBy = (...numbers) => ({
  nodes: numbers.map((number) => ({ number, title: `ticket ${number}`, state: 'OPEN' })),
});

// The tickets of spec #9000: six free Android tickets, one Android ticket blocked by the first, one blocked by a web
// ticket, one taken by someone else, one that is not ready, a web ticket and a backend ticket.
const TICKETS = [
  ticketFacts(9001, '[F054] Fivvi Android: the Deze week card on Home'),
  ticketFacts(9002, '[F054] Fivvi Android: my waitlists on Home'),
  ticketFacts(9003, '[F054] Android: QR-code scannen on the no-studio screen', {
    blockedBy: blockedBy(9001),
  }),
  ticketFacts(9004, '[F054] Android: the studio switcher', { blockedBy: blockedBy(9006) }),
  ticketFacts(9005, '[F054] Foundation: the cycles of a credit plan (DB, domain)'),
  ticketFacts(9006, '[F054] Client web: Home with my schedule (CW-02)'),
  ticketFacts(9007, '[F054] Fivvi Pro Android: the credit line on TD-02'),
  ticketFacts(9008, '[F054] Fivvi Android: the renewal card'),
  ticketFacts(9009, '[F054] Fivvi Android: the invoice details'),
  ticketFacts(9010, '[F054] Android: join links open Fivvi', { assignees: [{ login: 'someone' }] }),
  ticketFacts(9011, '[F054] Android: attendance on TD-02', { labels: labels('needs-triage') }),
];

describe('ADR-033 flow.sh start --slice', () => {
  const gh = fakeGh();
  let sandbox;
  beforeEach(() => {
    sandbox = sliceRepo('slice-start-');
    writeFileSync(join(sandbox.repo, 'scripts/wt.sh'), STUB_WT);
    chmodSync(join(sandbox.repo, 'scripts/wt.sh'), 0o755);
  });
  afterEach(() => rmSync(sandbox.base, { recursive: true, force: true }));
  after(() => gh.cleanup());

  const rules = (tickets = TICKETS, spec = {}, extra = []) => [
    ...extra,
    { match: '^api user', out: { login: 'thekeyvan' } },
    {
      match: '^issue view 9000 ',
      out: {
        number: 9000,
        title: '[F054] Home',
        state: 'OPEN',
        labels: labels('spec', 'spec-approved'),
        subIssues: {
          totalCount: tickets.length,
          nodes: tickets.map(({ number, state }) => ({ number, state })),
        },
        ...spec,
      },
    },
    ...tickets.map((t) => ({ match: `^issue view ${t.number} `, out: t })),
    { match: '^issue edit ', out: '' },
    { match: '^pr list ', out: [] },
  ];
  const start = (args, tickets, spec, extra) =>
    spawnSync(join(sandbox.repo, 'scripts/flow.sh'), ['start', '--slice', ...args], {
      cwd: sandbox.repo,
      encoding: 'utf8',
      env: gh.env(rules(tickets, spec, extra)),
    });
  const claimed = () =>
    gh
      .calls()
      .filter(
        (c) => c.args[0] === 'issue' && c.args[1] === 'edit' && c.args.includes('--add-assignee'),
      )
      .map((c) => Number(c.args[2]))
      .sort();

  it('claims up to 5 unblocked tickets of one platform, and one blocked only inside the slice', () => {
    const result = start(['9000', 'android']);
    assert.equal(result.status, 0, result.stderr);
    // 9004 waits for a web ticket, 9009 and 9010..: 9010 is taken, 9011 is not ready, 9009 does not fit in the 5.
    assert.deepEqual(claimed(), [9001, 9002, 9003, 9007, 9008]);
    assert.match(result.stdout, /Slice: #9001 #9002 #9003 #9007 #9008 \(spec #9000, android\)/);
  });

  it('makes one worktree, branch and notes file, named after the first ticket', () => {
    const result = start(['9000', 'android']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      sandbox.git('worktree', 'list'),
      /\.worktrees\/feature-9001-fivvi-android-the-deze/,
    );
    assert.match(sandbox.git('branch', '--list', 'feature/9001-*'), /feature\/9001-fivvi-android/);
    assert.match(result.stdout, /Worktree: .*feature-9001-/);
    assert.match(result.stdout, new RegExp(`Notes: ${join(sandbox.repo, '.work/9001/notes.md')}`));
    const notes = readFileSync(join(sandbox.repo, '.work/9001/notes.md'), 'utf8');
    for (const n of [9001, 9002, 9003, 9007, 9008]) assert.match(notes, new RegExp(`#${n} `));
    assert.doesNotMatch(notes, /#9009 /);
    assert.equal(
      readFileSync(join(sandbox.repo, '.work/9001/slice'), 'utf8'),
      '9001\n9002\n9003\n9007\n9008\n',
    );
    assert.equal(existsSync(join(sandbox.repo, '.work/9002')), false);
  });

  it('takes the tickets of the platform asked for', () => {
    const result = start(['9000', 'web']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9006]);
    const backend = start(['9000', 'backend']);
    assert.equal(backend.status, 0, backend.stderr);
    assert.deepEqual(claimed(), [9005]);
  });

  // #1485: tickets tagged API or DB wait for the open PR that changes the contract or adds a migration.
  const CONTRACT = 'packages/contract/openapi.json';
  const MIGRATION = 'packages/database/migrations/0042_hold.sql';
  const openPrs = (...prs) => [
    {
      match: '^pr list .*--state open',
      out: prs.map(({ number, files, branch = 'docs/no-issue', closing = [] }) => ({
        number,
        title: `[E001] PR ${number}`,
        headRefName: branch,
        headRefOid: 'a'.repeat(40),
        mergeable: 'MERGEABLE',
        closingIssuesReferences: closing.map((n) => ({ number: n })),
        files: files.map((path) => ({ path })),
      })),
    },
  ];
  const BACKEND = [
    ticketFacts(9101, '[F055] The credit plan tables (DB, domain)'),
    ticketFacts(9102, '[F055] The credit plan route (API, domain)'),
    ticketFacts(9103, '[F055] The expiry pass (domain, cron)'),
    ticketFacts(9104, '[F055] The plan list reads (domain)', { blockedBy: blockedBy(9102) }),
    ticketFacts(9105, '[F055] The renewal job (domain, cron)', { blockedBy: blockedBy(9101) }),
  ];

  it('AC8: leaves an API-tagged ticket, and the ticket blocked by it, out of the slice while an open PR changes openapi.json', () => {
    const result = start(
      ['9000', 'backend'],
      BACKEND,
      {},
      openPrs({ number: 60, files: [CONTRACT] }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9101, 9103, 9105]);
    assert.match(result.stdout, /#9102 waits for #60 \(API contract\): left out of the slice/);
    assert.doesNotMatch(result.stdout, /#9104 waits/);
  });

  it('AC9: leaves a DB-tagged ticket, and what is blocked by it, out of the slice while an open PR adds a migration', () => {
    const result = start(
      ['9000', 'backend'],
      BACKEND,
      {},
      openPrs({ number: 61, files: [MIGRATION] }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9102, 9103, 9104]);
    assert.match(result.stdout, /#9101 waits for #61 \(migration\): left out of the slice/);
  });

  it('AC8: takes every ticket once that PR is merged or closed', () => {
    const result = start(
      ['9000', 'backend'],
      BACKEND,
      {},
      openPrs({ number: 62, files: ['apps/web/page.tsx'] }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9101, 9102, 9103, 9104, 9105]);
    assert.doesNotMatch(result.stdout, /waits for/);
  });

  it('AC9: a slice of tickets without API or DB tags is never held', () => {
    const result = start(
      ['9000', 'android'],
      undefined,
      undefined,
      openPrs({ number: 60, files: [CONTRACT, MIGRATION] }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9001, 9002, 9003, 9007, 9008]);
    assert.doesNotMatch(result.stdout, /waits for/);
  });

  it('refuses a slice whose every ticket waits, naming the PR, and starts nothing', () => {
    const result = start(
      ['9000', 'backend'],
      [ticketFacts(9102, '[F055] The credit plan route (API, domain)')],
      {},
      openPrs({ number: 60, files: [CONTRACT] }),
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /waits for an open PR/);
    assert.match(result.stdout, /#9102 waits for #60 \(API contract\)/);
    assert.deepEqual(claimed(), []);
    assert.equal(existsSync(join(sandbox.repo, '.work/9102')), false);
  });

  it('the PR of the slice itself, or one that closes a ticket of it, does not hold it', () => {
    const own = start(
      ['9000', 'backend'],
      BACKEND,
      {},
      openPrs({ number: 60, files: [CONTRACT], closing: [9102] }),
    );
    assert.equal(own.status, 0, own.stderr);
    assert.deepEqual(claimed(), [9101, 9102, 9103, 9104, 9105]);
  });

  it('--force starts the slice with the tickets that wait', () => {
    const result = start(
      ['9000', 'backend', '--force'],
      BACKEND,
      {},
      openPrs({ number: 60, files: [CONTRACT] }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9101, 9102, 9103, 9104, 9105]);
  });

  it('refuses when the open PRs cannot be read, rather than starting colliding work on a guess', () => {
    const result = start(['9000', 'backend'], BACKEND, {}, [
      { match: '^pr list .*--state open', out: '', status: 1 },
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not read the open PRs/);
    assert.match(result.stderr, /--force/);
    assert.deepEqual(claimed(), []);
  });

  it('AC12: behaves the same with ci: full and review: per-pr', () => {
    writeFileSync(
      join(sandbox.repo, '.github/pipeline.json'),
      JSON.stringify({ ci: 'full', review: 'per-pr' }),
    );
    const result = start(
      ['9000', 'backend'],
      BACKEND,
      {},
      openPrs({ number: 60, files: [CONTRACT] }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9101, 9103, 9105]);
    assert.match(result.stdout, /#9102 waits for #60 \(API contract\)/);
  });

  it('prints the FEATURES.md hint of each ticket of the slice', () => {
    const result = start(
      ['9000', 'web'],
      [
        ticketFacts(9006, '[F057] Web: the card', {
          parent: {
            number: 9000,
            title: 'x',
            state: 'OPEN',
            labels: labels('spec', 'spec-approved'),
            open: 1,
            total: 3,
          },
        }),
      ],
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Hint \(#9006\): /);
  });

  it('leaves a bug out of the slice: it has its PR of its own', () => {
    const result = start(
      ['9000', 'android'],
      [
        ticketFacts(9001, '[F054] Fivvi Android: the Deze week card on Home'),
        ticketFacts(9002, '[F054] Fivvi Android: the card crashes on rotation', {
          labels: labels('ready-for-agent', 'bug'),
        }),
      ],
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9001]);
    assert.equal(readFileSync(join(sandbox.repo, '.work/9001/slice'), 'utf8'), '9001\n');
  });

  it('lets a new slice take a ticket that was dropped from an earlier one, and none still in it', () => {
    sandbox.git('branch', 'feature/9001-android-home');
    mkdirSync(join(sandbox.repo, '.work/9001'), { recursive: true });
    writeFileSync(join(sandbox.repo, '.work/9001/slice'), '9001\n9002\n9003\n');
    const tickets = [9001, 9002, 9003].map((n) => ticketFacts(n, `[F054] Android: card ${n}`));
    const before = start(['9000', 'android'], tickets);
    assert.notEqual(before.status, 0, 'every ticket still belongs to the slice that has a branch');
    assert.match(before.stderr, /no ready, unblocked ticket of spec #9000 on android/);

    const drop = spawnSync(
      join(sandbox.repo, 'scripts/flow.sh'),
      ['slice', '9002', '--drop', '9003'],
      {
        cwd: sandbox.repo,
        encoding: 'utf8',
        env: gh.env(rules(tickets)),
      },
    );
    assert.equal(drop.status, 0, drop.stderr);
    const result = start(['9000', 'android'], tickets);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(claimed(), [9003]);
    assert.equal(readFileSync(join(sandbox.repo, '.work/9003/slice'), 'utf8'), '9003\n');
    assert.equal(readFileSync(join(sandbox.repo, '.work/9001/slice'), 'utf8'), '9001\n9002\n');
  });

  it('refuses a platform that is not one of backend, web, ios, android', () => {
    const result = start(['9000', 'desktop']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /platform must be one of: backend web ios android/);
    assert.deepEqual(claimed(), []);
  });

  it('refuses a spec the owner has not approved', () => {
    const result = start(['9000', 'android'], TICKETS, { labels: labels('spec') });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not approved/);
    assert.deepEqual(claimed(), []);
  });

  it('stops, claiming nothing, when no ticket of the platform is ready', () => {
    const result = start(['9000', 'ios']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no ready, unblocked ticket of spec #9000 on ios/);
    assert.deepEqual(claimed(), []);
  });
});

describe('ADR-033 pr.sh create for a slice', () => {
  const gh = fakeGh();
  let sandbox;
  beforeEach(() => {
    sandbox = sliceRepo('slice-create-');
    sandbox.git('checkout', '--quiet', '-b', 'feature/9001-android-home');
  });
  afterEach(() => rmSync(sandbox.base, { recursive: true, force: true }));
  after(() => gh.cleanup());

  const create = ({ body, existing = false, args = [] } = {}) => {
    const result = spawnSync(
      join(sandbox.repo, 'scripts/pr.sh'),
      ['create', '--no-check', ...(body === undefined ? [] : ['--body-file', '-']), ...args],
      {
        cwd: sandbox.repo,
        encoding: 'utf8',
        input: body ?? '',
        env: gh.env([
          { match: '^pr list ', out: existing ? [{ number: 60 }] : [] },
          { match: '^issue view 9001 .*--json title', out: { title: '[F054] Android: Home' } },
          { match: '^issue view 9001 .*--json labels', out: { labels: labels('ready-for-agent') } },
          { match: '^pr create ', out: 'https://github.com/o/r/pull/60' },
          { match: '^pr edit ', out: '' },
          { match: '^pr view 60 ', out: { url: 'https://github.com/o/r/pull/60' } },
        ]),
      },
    );
    const arg = (name) => {
      const call = gh.calls().find((c) => c.args[0] === 'pr' && c.args[1] === name);
      return call?.args[call.args.indexOf('--body') + 1];
    };
    return { ...result, created: arg('create'), edited: arg('edit') };
  };
  const writeSlice = (...numbers) => {
    mkdirSync(join(sandbox.repo, '.work/9001'), { recursive: true });
    writeFileSync(join(sandbox.repo, '.work/9001/slice'), `${numbers.join('\n')}\n`);
  };
  const commitLines = (count) => {
    writeFileSync(
      join(sandbox.repo, 'big.txt'),
      Array.from({ length: count }, (_, i) => `line ${i}`).join('\n') + '\n',
    );
    sandbox.git('add', 'big.txt');
    sandbox.git('commit', '--quiet', '-m', 'feat(F054): lines');
  };

  it('closes every ticket of the slice, once each', () => {
    writeSlice(9001, 9002, 9003);
    const result = create({ body: 'Body.' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.created, 'Body.\n\nCloses #9001\nCloses #9002\nCloses #9003');
  });

  it('adds only the Closes the body lacks, also when it updates an open PR', () => {
    writeSlice(9001, 9002);
    const result = create({ body: 'Body.\n\nCloses #9001', existing: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.edited, 'Body.\n\nCloses #9001\n\nCloses #9002');
  });

  it('closes no ticket that flow.sh slice --drop took out of the slice', () => {
    writeSlice(9001, 9002, 9003);
    const drop = spawnSync(
      join(sandbox.repo, 'scripts/flow.sh'),
      ['slice', '9001', '--drop', '9002'],
      {
        cwd: sandbox.repo,
        encoding: 'utf8',
        env: gh.env([{ match: '^issue edit ', out: '' }]),
      },
    );
    assert.equal(drop.status, 0, drop.stderr);
    const result = create({ body: 'Body.' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.created, 'Body.\n\nCloses #9001\nCloses #9003');
  });

  it('still closes only its own issue on a branch that is no slice', () => {
    const result = create({ body: 'Body.' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.created, 'Body.\n\nCloses #9001');
  });

  describe('AC2: the size of the branch', () => {
    it('warns above 1,500 changed lines and still pushes and opens the PR', () => {
      commitLines(1501);
      const result = create();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout + result.stderr, /changes 1501 lines, more than about 1,500/);
      assert.match(result.stdout + result.stderr, /ADR-033/);
      assert.equal(result.created !== undefined, true);
      assert.match(sandbox.git('ls-remote', sandbox.remote), /feature\/9001-android-home/);
    });

    it('says nothing at 1,500 lines or fewer', () => {
      commitLines(1500);
      const result = create();
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout + result.stderr, /more than about 1,500/);
    });

    it('counts added and deleted lines of every commit of the branch', () => {
      commitLines(900);
      writeFileSync(join(sandbox.repo, 'other.txt'), 'x\n'.repeat(700));
      sandbox.git('add', 'other.txt');
      sandbox.git('commit', '--quiet', '-m', 'feat(F054): more');
      const result = create();
      assert.match(result.stdout + result.stderr, /changes 1600 lines/);
    });
  });
});

describe('ADR-033 flow.sh status and finish for a slice PR', () => {
  const gh = fakeGh();
  let sandbox;
  const BRANCH = 'feature/9001-android-home';
  beforeEach(() => {
    sandbox = sliceRepo('slice-finish-');
    sandbox.git('branch', BRANCH);
    mkdirSync(join(sandbox.repo, '.work/9001'), { recursive: true });
    writeFileSync(join(sandbox.repo, '.work/9001/notes.md'), 'notes');
    writeFileSync(join(sandbox.repo, '.work/9001/slice'), '9001\n9002\n9003\n');
    writeFileSync(join(sandbox.repo, 'scripts/clean.sh'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(sandbox.repo, 'scripts/clean.sh'), 0o755);
  });
  afterEach(() => rmSync(sandbox.base, { recursive: true, force: true }));
  after(() => gh.cleanup());

  const run = (command, n, options = {}) => runFlow([command, String(n)], options);
  const runFlow = (args, { prState = 'MERGED', states = {}, assigned = [] } = {}) =>
    spawnSync(join(sandbox.repo, 'scripts/flow.sh'), args, {
      cwd: sandbox.repo,
      encoding: 'utf8',
      env: gh.env([
        { match: '^api user', out: { login: 'thekeyvan' } },
        {
          match: '^issue view 9000 ',
          out: {
            number: 9000,
            title: '[F054] Home',
            state: 'OPEN',
            labels: labels('spec', 'spec-approved'),
            assignees: [],
            body: 'Spec.',
            comments: [],
            parent: null,
            blockedBy: { nodes: [] },
            subIssues: {
              totalCount: 4,
              nodes: [9001, 9002, 9003, 9004].map((number) => ({ number, state: 'OPEN' })),
            },
          },
        },
        ...[9001, 9002, 9003, 9004].map((number) => ({
          match: `^issue view ${number} `,
          out: ticketFacts(number, `[F054] Android: card ${number}`, {
            state: states[number] ?? 'OPEN',
            assignees: number < 9004 ? [{ login: 'thekeyvan' }] : [],
          }),
        })),
        {
          match: '^issue list .*--assignee',
          out: assigned.map((number) => ({ number })),
        },
        { match: '^issue edit ', out: '' },
        {
          match: `^pr list .*--head ${BRANCH}`,
          out: [
            {
              number: 70,
              state: prState,
              isDraft: false,
              reviewDecision: '',
              statusCheckRollup: [],
              url: 'https://github.com/o/r/pull/70',
              createdAt: '2026-10-18T10:00:00Z',
              headRefOid: sandbox.git('rev-parse', BRANCH),
            },
          ],
        },
        { match: '^issue close ', out: '' },
        // What `next` also reads: nothing else is open.
        { match: '^issue list .*--label (spec|needs-info|ready-for-agent)', out: [] },
        { match: '^issue list .*in:title', out: [] },
        { match: '^pr list .*--state (open|merged)', out: [] },
        {
          match: '^api graphql ',
          out: { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } },
        },
      ]),
    });
  const closedIssues = () =>
    gh
      .calls()
      .filter((c) => c.args[0] === 'issue' && c.args[1] === 'close')
      .map((c) => Number(c.args[2]))
      .sort();

  it('status of any ticket of the slice shows the branch and PR of the slice, and the slice', () => {
    for (const n of [9001, 9003]) {
      const result = run('status', n, { prState: 'MERGED' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`Branch: ${BRANCH}`));
      assert.match(result.stdout, /PR: #70 MERGED/);
      assert.match(result.stdout, /Slice: #9001 #9002 #9003/);
      assert.match(result.stdout, /Phase: merged/);
      assert.match(result.stdout, /Notes: .*\.work\/9001\/notes\.md/);
    }
  });

  it('finish, run for any ticket of the slice, closes every ticket that is still open and removes the notes', () => {
    const result = run('finish', 9002, { states: { 9003: 'CLOSED' } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(closedIssues(), [9001, 9002]);
    assert.equal(sandbox.git('branch', '--list', BRANCH), '');
    assert.equal(existsSync(join(sandbox.repo, '.work/9001')), false);
    assert.match(result.stdout, /#9001 done/);
    assert.match(result.stdout, /#9002 done/);
    assert.match(result.stdout, /#9003 done/);
  });

  it('finish leaves an open sibling ticket of the same spec outside the slice open', () => {
    const result = run('finish', 9001);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(closedIssues(), [9001, 9002, 9003]);
    assert.doesNotMatch(result.stdout, /#9004 done/);
  });

  it('finish closes no ticket that was dropped from the slice, and leaves it open', () => {
    const drop = runFlow(['slice', '9002', '--drop', '9003']);
    assert.equal(drop.status, 0, drop.stderr);
    assert.equal(readFileSync(join(sandbox.repo, '.work/9001/slice'), 'utf8'), '9001\n9002\n');
    assert.match(readFileSync(join(sandbox.repo, '.work/9001/notes.md'), 'utf8'), /dropped #9003/);
    const unassigned = gh
      .calls()
      .filter(
        (c) =>
          c.args[0] === 'issue' && c.args[1] === 'edit' && c.args.includes('--remove-assignee'),
      );
    assert.deepEqual(
      unassigned.map((c) => c.args[2]),
      ['9003'],
    );

    const result = run('finish', 9002);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(closedIssues(), [9001, 9002]);
    assert.doesNotMatch(result.stdout, /#9003 done/);
    assert.equal(existsSync(join(sandbox.repo, '.work/9001')), false);
  });

  it('status of a dropped ticket no longer shows the slice, its branch or its PR', () => {
    const drop = runFlow(['slice', '9001', '--drop', '9003']);
    assert.equal(drop.status, 0, drop.stderr);
    const result = run('status', 9003);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Slice:/);
    assert.doesNotMatch(result.stdout, new RegExp(BRANCH));
  });

  it('drop refuses the first ticket, a ticket outside the slice and a ticket in no slice, changing nothing', () => {
    for (const [args, message] of [
      [
        ['slice', '9002', '--drop', '9001'],
        /#9001 is the ticket the branch of the slice is named after/,
      ],
      [['slice', '9001', '--drop', '9004'], /#9004 is not in the slice of #9001/],
      [['slice', '9004', '--drop', '9001'], /#9004 is in no slice/],
    ]) {
      const result = runFlow(args);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, message);
    }
    assert.equal(
      readFileSync(join(sandbox.repo, '.work/9001/slice'), 'utf8'),
      '9001\n9002\n9003\n',
    );
    assert.deepEqual(
      gh.calls().filter((c) => c.args[1] === 'edit'),
      [],
    );
  });

  describe('which slice a ticket belongs to when several files list it', () => {
    const primary = (n) =>
      execFileSync(
        'bash',
        [
          '-c',
          `source "${join(sandbox.repo, 'scripts/_lib.sh')}"; slice_primary "$1"`,
          'x',
          String(n),
        ],
        { cwd: sandbox.repo, encoding: 'utf8' },
      ).trim();
    const writeSlice = (first, tickets, ageSeconds) => {
      mkdirSync(join(sandbox.repo, '.work', String(first)), { recursive: true });
      const file = join(sandbox.repo, '.work', String(first), 'slice');
      writeFileSync(file, `${tickets.join('\n')}\n`);
      const when = new Date(Date.now() - ageSeconds * 1000);
      utimesSync(file, when, when);
    };

    it('prefers the slice whose branch still exists, however old its file is', () => {
      writeSlice(9005, [9005, 9003], 10); // newer, no branch
      writeSlice(9001, [9001, 9002, 9003], 1000); // older, has the branch
      assert.equal(primary(9003), '9001');
    });

    it('takes the newest file when no branch exists for any of them, in either order', () => {
      writeSlice(9005, [9005, 9007], 1000);
      writeSlice(9006, [9006, 9007], 10);
      assert.equal(primary(9007), '9006');
      writeSlice(9005, [9005, 9007], 1);
      assert.equal(primary(9007), '9005');
    });

    it('answers the ticket itself when no slice lists it', () => {
      assert.equal(primary(9004), '9004');
    });
  });

  describe('flow.sh next after the PR of the slice merged', () => {
    const next = (assigned) => {
      sandbox.git(
        'worktree',
        'add',
        '--quiet',
        join(sandbox.repo, '.worktrees/feature-9001-android-home'),
        BRANCH,
      );
      return runFlow(['next'], { assigned });
    };

    it('prints Finish for the slice once, as the merged PR closed its tickets', () => {
      const result = next([]);
      assert.equal(result.status, 0, result.stderr);
      const finish = result.stdout.split('\n').filter((line) => line.startsWith('Finish #'));
      assert.equal(finish.length, 1, result.stdout);
      assert.match(finish[0], /^Finish #9001 feature\/9001-android-home /);
    });

    it('shows every assigned ticket of the slice with its phase, and no Finish for them', () => {
      const result = next([9001, 9002, 9003]);
      assert.equal(result.status, 0, result.stderr);
      for (const n of [9001, 9002, 9003]) {
        assert.match(
          result.stdout,
          new RegExp(`^#${n} \\[F054\\] Android: card ${n} → merged$`, 'm'),
        );
      }
      assert.doesNotMatch(result.stdout, /^Finish #/m);
    });
  });

  it('finish waits while the PR of the slice is not merged, and changes nothing', () => {
    const result = run('finish', 9001, { prState: 'OPEN' });
    assert.notEqual(result.status, 0);
    assert.deepEqual(closedIssues(), []);
    assert.equal(existsSync(join(sandbox.repo, '.work/9001/slice')), true);
  });
});
