// scripts/usage.mjs measures a factory run from Claude Code's transcripts and GitHub. The transcripts here are synthetic
// fixtures in a temp dir; gh is the fake from fake-gh.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
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
import { after, before, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';
import {
  areaOf,
  branchOfDir,
  classifyCommand,
  parseVerdict,
  sizeClass,
  unionSeconds,
  unitsOf,
} from '../usage.mjs';

const SCRIPT = join(import.meta.dirname, '../usage.mjs');
const REPO_PATH = '/fake/work.tree/fivvi';
const PROJECT_DIR = '-fake-work-tree-fivvi';
const T0 = Date.parse('2026-10-24T10:00:00Z');
const at = (seconds) => new Date(T0 + seconds * 1000).toISOString();

let counter = 0;
const call = (
  s,
  { id = `msg${++counter}`, model = 'claude-opus-5-5', i = 1, cr = 0, cw = 0, o = 0, content = [] },
) => ({
  type: 'assistant',
  timestamp: at(s),
  message: {
    id,
    model,
    usage: {
      input_tokens: i,
      cache_read_input_tokens: cr,
      cache_creation_input_tokens: cw,
      output_tokens: o,
    },
    content,
  },
});
const bash = (s, toolId, command, opts = {}) =>
  call(s, {
    ...opts,
    content: [{ type: 'tool_use', id: toolId, name: 'Bash', input: { command } }],
  });
const result = (s, toolId) => ({
  type: 'user',
  timestamp: at(s),
  message: {
    content: [{ type: 'tool_result', tool_use_id: toolId, content: 'output that is never read' }],
  },
});
const say = (s, text, opts = {}) => call(s, { ...opts, content: [{ type: 'text', text }] });
const compaction = (s) => ({ type: 'system', subtype: 'compact_boundary', timestamp: at(s) });

describe('pure helpers', () => {
  it('prices tokens per model with the ratios of Anthropic: input 1, cache write 1.25, cache read 0.1, output 5', () => {
    assert.equal(unitsOf({ input: 10, cacheWrite: 20, cacheRead: 100, output: 5 }), 70);
  });

  it('maps a worktree folder to its branch and issue', () => {
    assert.deepEqual(branchOfDir('feature-135-get-me'), {
      branch: 'feature/135-get-me',
      issue: 135,
    });
    assert.deepEqual(branchOfDir('chore-agent-usage-cost'), {
      branch: 'chore/agent-usage-cost',
      issue: null,
    });
    assert.deepEqual(branchOfDir('odd'), { branch: 'odd', issue: null });
  });

  it('classifies a command by the time it takes', () => {
    assert.equal(classifyCommand('cd w && scripts/check.sh'), 'check');
    for (const command of [
      'pnpm test:ios',
      'scripts/test-ios.sh',
      'cd a && ./gradlew test',
      'xcodebuild test',
      'maestro test x',
    ]) {
      assert.equal(classifyCommand(command), 'native', command);
    }
    for (const command of [
      'gh run watch 1',
      'gh pr checks 3',
      'scripts/pr.sh wait 3',
      'scripts/pr.sh ship 3',
      'until x; do sleep 5; done',
    ]) {
      assert.equal(classifyCommand(command), 'wait', command);
    }
    assert.equal(classifyCommand('git status'), 'other');
    assert.equal(classifyCommand(undefined), 'other');
  });

  it('classifies only the shell keywords until and sleep as waiting, not a flag of that name', () => {
    for (const command of [
      'git log --until=2026-10-24',
      'gh run list --until 5',
      'node scripts/usage.mjs snapshot --since 1 --until 2',
      'cat sleep.txt',
    ]) {
      assert.equal(classifyCommand(command), 'other', command);
    }
    for (const command of [
      'cd w && sleep 5',
      'sleep 5',
      'cd w; until x; do :; done',
      'x | sleep 1',
      'while sleep 5; do :; done',
      'cd w && while sleep 5; do gh pr checks 1; done',
    ]) {
      assert.equal(classifyCommand(command), 'wait', command);
    }
  });

  it('classifies a command as a check only when it runs scripts/check.sh, not when it reads it', () => {
    for (const command of [
      'cd w && scripts/check.sh',
      'cd w && scripts/check.sh --fast 2>&1 | tail -20',
      './scripts/check.sh',
      '/r/.worktrees/x/scripts/check.sh',
      'cd w && bash scripts/check.sh',
      'CI=1 scripts/check.sh',
      'cd w && time scripts/check.sh --fast',
      'cd w && timeout 900 scripts/check.sh',
      'cd w && timeout -k 5 900 scripts/check.sh --fast',
      'env CI=1 scripts/check.sh',
      'cd w && nohup scripts/check.sh > out.log 2>&1 &',
      'rtk proxy scripts/check.sh --fast',
      'cd w && rtk proxy bash scripts/check.sh',
    ]) {
      assert.equal(classifyCommand(command), 'check', command);
    }
    for (const command of [
      'cat scripts/check.sh',
      'cd w && grep -n fast scripts/check.sh',
      'sed -n 1,20p scripts/check.sh',
      'git diff main -- scripts/check.sh',
      'git commit -m "docs: scripts/check.sh prints a summary"',
      'bash -n scripts/check.sh',
    ]) {
      assert.equal(classifyCommand(command), 'other', command);
    }
  });

  it('parses the verdict of a reviewer and counts its findings', () => {
    const text = [
      'Head abc1234.',
      '- must-fix: a.ts:3 something',
      '- should-fix: b.ts:9 something else',
      '- judgement: c.ts:1 optional',
      'Verdict: not clean on abc1234 (one must-fix, one should-fix)',
    ].join('\n');
    assert.deepEqual(parseVerdict(text), { verdict: 'not-clean', sha: 'abc1234', findings: 2 });
    assert.deepEqual(parseVerdict('No findings.\nVerdict: clean on def5678'), {
      verdict: 'clean',
      sha: 'def5678',
      findings: 0,
    });
    assert.deepEqual(parseVerdict('nothing to see'), { verdict: null, sha: null, findings: 0 });
  });

  it('counts a line only when it states a finding, not when it says there are none', () => {
    const text = [
      '- **Standards axis:** no must-fix or should-fix.',
      'No must-fix or should-fix findings.',
      'Findings (none must-fix or should-fix):',
      '- no must-fix or should-fix findings',
      '- must-fix: none',
      '- Must-fix and should-fix: none',
      '- must-fix: n/a',
      '- should-fix: —',
      '- should-fix: - ',
      '- should-fix: 0',
      '- **must-fix** `a.ts:3`: one',
      '- should-fix, b.ts:9: two',
      '1. `should-fix` c.ts:1: three',
      '  - [should-fix] d.ts:2: four',
      'should-fix: e.ts:5: five',
      '**should-fix (standards):** f.ts:6: six',
      'Verdict: not clean on abc1234 (one must-fix, five should-fix)',
    ].join('\n');
    assert.deepEqual(parseVerdict(text), { verdict: 'not-clean', sha: 'abc1234', findings: 6 });
  });

  it('sizes a PR from additions and deletions without the lockfile and generated code', () => {
    const file = (path, additions, deletions = 0) => ({ path, additions, deletions });
    assert.equal(sizeClass([file('a.ts', 100, 50)]), 'S');
    assert.equal(sizeClass([file('a.ts', 151)]), 'M');
    assert.equal(sizeClass([file('a.ts', 400, 200)]), 'M');
    assert.equal(sizeClass([file('a.ts', 601)]), 'L');
    assert.equal(
      sizeClass([
        file('a.ts', 100),
        file('pnpm-lock.yaml', 5000),
        file('packages/contract/generated/x.ts', 9000),
      ]),
      'S',
    );
  });

  it('gives a PR the area of its paths: native, then app, then tooling, else docs', () => {
    assert.equal(areaOf(['apps/ios/A.swift', 'packages/api/x.ts']), 'native');
    assert.equal(areaOf(['apps/android/a.kt']), 'native');
    assert.equal(areaOf(['apps/web/a.ts', 'scripts/a.sh']), 'app');
    assert.equal(areaOf(['packages/api/a.ts']), 'app');
    for (const path of [
      'scripts/a.sh',
      '.agents/a.md',
      '.claude/a.json',
      '.github/a.yml',
      '.codex/a.toml',
    ]) {
      assert.equal(areaOf([path, 'docs/a.md']), 'tooling', path);
    }
    assert.equal(areaOf(['docs/a.md', 'README.md']), 'docs');
  });

  it('joins overlapping agent intervals before it adds them up', () => {
    assert.equal(
      unionSeconds([
        [0, 10],
        [5, 20],
        [30, 40],
      ]),
      30,
    );
    assert.equal(
      unionSeconds([
        [0, 10],
        [2, 4],
      ]),
      10,
    );
    assert.equal(unionSeconds([]), 0);
  });
});

describe('usage.mjs', () => {
  let base;
  let gh;
  let n = 0;

  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'usage-')));
    gh = fakeGh();
  });
  after(() => {
    rmSync(base, { recursive: true, force: true });
    gh.cleanup();
  });

  const jsonl = (records) => `${records.map((r) => JSON.stringify(r)).join('\n')}\n`;

  // A projects folder with the sessions given: {id, records, agents: [{name, meta, records}]}.
  const projects = (sessions, dirName = PROJECT_DIR) => {
    const dir = join(base, `projects-${++n}`);
    const project = join(dir, dirName);
    for (const session of sessions) {
      mkdirSync(join(project, session.id, 'subagents'), { recursive: true });
      writeFileSync(join(project, `${session.id}.jsonl`), jsonl(session.records));
      for (const agent of session.agents ?? []) {
        const file = join(project, session.id, 'subagents', `agent-${agent.name}`);
        writeFileSync(`${file}.jsonl`, jsonl(agent.records));
        writeFileSync(`${file}.meta.json`, JSON.stringify(agent.meta));
      }
    }
    return dir;
  };
  const meta = (agentType, description = 'a task') => ({ agentType, description });
  const noGh = [{ match: '.', out: '', status: 1 }];

  const run = (args, rules = noGh, env = {}) =>
    spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...gh.env(rules), ...env } });
  const snapshot = (dir, args = [], rules = noGh, env = {}) => {
    const out = join(base, `snapshot-${++n}.json`);
    const done = run(
      [
        'snapshot',
        '--projects',
        dir,
        '--root',
        REPO_PATH,
        '--out',
        out,
        '--since',
        '2026-10-24',
        ...args,
      ],
      rules,
      env,
    );
    assert.equal(done.status, 0, done.stderr);
    return { ...done, data: JSON.parse(readFileSync(out, 'utf8')), out };
  };

  describe('the main conversation', () => {
    it('counts the usage of a message once, however many records it has', () => {
      const dir = projects([
        {
          id: 's1',
          records: [
            call(0, { id: 'm1', i: 10, cr: 100, cw: 20, o: 5 }),
            call(1, { id: 'm1', i: 10, cr: 100, cw: 20, o: 5 }),
            call(2, { id: 'm1', i: 10, cr: 100, cw: 20, o: 5 }),
            call(3, { id: 'm2', i: 1, cr: 300, cw: 0, o: 1 }),
          ],
        },
      ]);
      const [session] = snapshot(dir).data.sessions;
      assert.equal(session.calls, 2);
      assert.deepEqual(session.tokens.opus, {
        calls: 2,
        input: 11,
        cacheRead: 400,
        cacheWrite: 20,
        output: 6,
      });
      assert.equal(session.cost.opus, 70 + Math.round(1 + 30 + 5));
      assert.equal(session.avgContext, (130 + 301) / 2);
      assert.equal(session.peakContext, 301);
    });

    it('counts compactions and prices each model on its own', () => {
      const dir = projects([
        {
          id: 's1',
          records: [
            call(0, { id: 'a', model: 'claude-opus-5-5', i: 100, o: 10 }),
            call(1, { id: 'b', model: 'claude-sonnet-5-5', i: 100, o: 10 }),
            call(2, { id: 'c', model: 'claude-haiku-5-5', i: 100, o: 10 }),
            compaction(3),
          ],
        },
      ]);
      const [session] = snapshot(dir).data.sessions;
      assert.equal(session.compactions, 1);
      assert.deepEqual(session.cost, { opus: 150, sonnet: 150, haiku: 150 });
    });

    it('selects sessions by their first timestamp with --since and --until', () => {
      const dir = projects([
        { id: 'early', records: [{ ...call(0, { id: 'e' }), timestamp: '2026-10-23T23:59:00Z' }] },
        { id: 'inside', records: [{ ...call(0, { id: 'i' }), timestamp: '2026-10-25T08:00:00Z' }] },
        { id: 'late', records: [{ ...call(0, { id: 'l' }), timestamp: '2026-10-26T16:00:00Z' }] },
      ]);
      const { data } = snapshot(dir, ['--until', '2026-10-26T15:00:00Z', '--label', 'window']);
      assert.deepEqual(
        data.sessions.map((s) => s.id),
        ['inside'],
      );
      assert.equal(data.label, 'window');
      assert.equal(data.since, '2026-10-24');
      assert.equal(data.until, '2026-10-26T15:00:00Z');
      assert.equal(data.version, 1);
    });

    it('leaves out what happened after --until in a session that kept running, and keeps an agent whole', () => {
      const stamp = (record, iso) => ({ ...record, timestamp: iso });
      const inside = (id) => stamp(call(0, { id, i: 10 }), '2026-10-26T14:00:00Z');
      const outside = (id) => stamp(call(0, { id, i: 1000 }), '2026-10-26T16:00:00Z');
      const agent = (name, records) => ({ name, meta: meta('builder'), records });
      const dir = projects([
        {
          id: 's1',
          records: [
            stamp(call(0, { id: 'first', i: 10 }), '2026-10-25T08:00:00Z'),
            inside('m2'),
            outside('m3'),
            stamp(compaction(0), '2026-10-26T16:30:00Z'),
          ],
          agents: [
            agent('a1', [
              stamp(call(0, { id: 'x1', i: 7 }), '2026-10-26T14:10:00Z'),
              stamp(call(0, { id: 'x2', i: 9 }), '2026-10-26T15:30:00Z'),
            ]),
            agent('a2', [stamp(call(0, { id: 'y1', i: 7 }), '2026-10-26T15:00:00Z')]),
            agent('a0', [stamp(call(0, { id: 'z1', i: 7 }), '2026-10-23T22:00:00Z')]),
          ],
        },
      ]);
      const { data } = snapshot(dir, ['--until', '2026-10-26T14:12:00Z']);
      const [session] = data.sessions;
      assert.equal(session.calls, 2);
      assert.equal(session.tokens.opus.input, 20);
      assert.equal(session.compactions, 0);
      assert.equal(session.subagents, 1);
      assert.equal(data.agents.byRole.builder.count, 1);
      assert.equal(data.agents.byRole.builder.medianPeakContext, 9);
    });

    it('reads the folders of the repo and of its worktrees, and no others', () => {
      const dir = projects([{ id: 'main', records: [call(0, { id: 'a' })] }]);
      const worktree = join(dir, `${PROJECT_DIR}--worktrees-feature-1-x`, 'wt.jsonl');
      mkdirSync(join(dir, `${PROJECT_DIR}--worktrees-feature-1-x`), { recursive: true });
      writeFileSync(worktree, jsonl([call(0, { id: 'b' })]));
      const other = join(dir, `${PROJECT_DIR}x`);
      mkdirSync(other);
      writeFileSync(join(other, 'o.jsonl'), jsonl([call(0, { id: 'c' })]));
      // a sibling repository whose name starts like this one (fivvi-site next to fivvi)
      const sibling = join(dir, `${PROJECT_DIR}-site`);
      mkdirSync(sibling);
      writeFileSync(join(sibling, 'sib.jsonl'), jsonl([call(0, { id: 'd' })]));
      const ids = snapshot(dir)
        .data.sessions.map((s) => s.id)
        .sort();
      assert.deepEqual(ids, ['main', 'wt']);
    });
  });

  describe('agents and tickets', () => {
    const builder = (name, worktree, extra = []) => ({
      name,
      meta: meta('builder', 'Build #7'),
      records: [
        bash(0, 't1', `cd /r/.worktrees/${worktree} && git status`, {
          id: `${name}1`,
          i: 5,
          cr: 1000,
          cw: 100,
          o: 10,
        }),
        result(1, 't1'),
        bash(2, 't2', `cd /r/.worktrees/${worktree} && ls`, {
          id: `${name}2`,
          i: 5,
          cr: 2000,
          cw: 50,
          o: 10,
        }),
        result(3, 't2'),
        bash(4, 't3', 'cd /r/.worktrees/other-thing && ls', {
          id: `${name}3`,
          i: 5,
          cr: 500,
          cw: 0,
          o: 10,
        }),
        result(5, 't3'),
        ...extra,
      ],
    });
    const mainWith = (agents) => [
      { id: 's1', records: [call(0, { id: 'm1', i: 100, o: 10 })], agents },
    ];

    it('puts an agent on the ticket of the worktree its commands name most often', () => {
      const { data } = snapshot(projects(mainWith([builder('a1', 'feature-135-get-me')])));
      assert.deepEqual(
        data.tickets.map((t) => [t.branch, t.issue, t.agents]),
        [['feature/135-get-me', 135, { builder: 1 }]],
      );
      assert.deepEqual(data.sessions[0].tickets, ['feature/135-get-me']);
    });

    it('measures an agent: calls, tokens, first and peak context', () => {
      const { data } = snapshot(projects(mainWith([builder('a1', 'feature-135-get-me')])));
      const [ticket] = data.tickets;
      assert.deepEqual(ticket.tokens.opus, {
        calls: 3,
        input: 15,
        cacheRead: 3500,
        cacheWrite: 150,
        output: 30,
      });
      assert.deepEqual(data.agents.byRole.builder, {
        count: 1,
        medianFirstContext: 1105,
        medianPeakContext: 2055,
      });
    });

    // gh as far as the `#n` fallback needs it: the owner and the PRs of the repo.
    const prs = (list) => [
      { match: 'repo view', out: { owner: { login: 'owner' } } },
      {
        match: 'pr list --state all --limit',
        out: list.map(([number, headRefName]) => ({
          number,
          headRefName,
          title: '',
          body: '',
          createdAt: '2026-10-24T00:00:00Z',
        })),
      },
      { match: '.', out: '', status: 1 },
    ];
    const lonely = (name, description) => ({
      name,
      meta: meta('mechanic', description),
      records: [call(0, { id: `${name}1`, i: 1, o: 1 })],
    });

    it('puts an agent that names a PR as #n on the ticket of the head branch of that PR', () => {
      // 208 is the PR of issue 138: counting it as an issue would make a second ticket of the same work
      const { data } = snapshot(
        projects(
          mainWith([
            lonely('b1', 'Wait for the checks of #208 and #43'),
            lonely('b2', 'Tidy up'),
            builder('a1', 'feature-138-x'),
          ]),
        ),
        [],
        prs([[208, 'feature/138-x']]),
      );
      assert.deepEqual(
        data.tickets.map((t) => [t.branch, t.issue, t.agents]),
        [['feature/138-x', 138, { builder: 1, mechanic: 1 }]],
      );
      assert.equal(data.agents.byRole.mechanic.count, 2);
    });

    it('takes a #n that is no PR for an issue: the branch of a worktree with that issue, else a ticket of its own', () => {
      const { data } = snapshot(
        projects(
          mainWith([
            lonely('b1', 'Fix #42'),
            lonely('b2', 'Fix #99'),
            builder('a1', 'feature-42-x'),
          ]),
        ),
        [],
        prs([[208, 'feature/138-x']]),
      );
      assert.deepEqual(
        data.tickets.map((t) => [t.branch, t.issue, t.agents]),
        [
          [null, 99, { mechanic: 1 }],
          ['feature/42-x', 42, { builder: 1, mechanic: 1 }],
        ],
      );
    });

    it('drops the #n fallback when gh is missing: a number could be a PR, and guessing double counts a ticket', () => {
      const { data } = snapshot(
        projects(
          mainWith([
            lonely('b1', 'Fix #42'),
            lonely('b2', 'Fix #99'),
            builder('a1', 'feature-42-x'),
          ]),
        ),
      );
      assert.deepEqual(
        data.tickets.map((t) => [t.branch, t.agents]),
        [['feature/42-x', { builder: 1 }]],
      );
      assert.equal(data.agents.byRole.mechanic.count, 2);
    });

    it('counts a general-purpose agent whose description says axis as a review-axis', () => {
      const axis = {
        name: 'x1',
        meta: meta('general-purpose', 'Spec axis review #7'),
        records: [call(0, { id: 'q', i: 1 })],
      };
      const other = {
        name: 'x2',
        meta: meta('general-purpose', 'Explore the repo'),
        records: [call(0, { id: 'r', i: 1 })],
      };
      const { data } = snapshot(projects(mainWith([axis, other])));
      assert.deepEqual(Object.keys(data.agents.byRole).sort(), ['general-purpose', 'review-axis']);
    });

    it('adds up tool seconds by class and counts the check runs', () => {
      const records = [
        bash(0, 'a', 'cd /r/.worktrees/fix-1-x && scripts/check.sh', { id: 'k1' }),
        result(100, 'a'),
        bash(101, 'b', 'cd /r/.worktrees/fix-1-x && scripts/check.sh --fast', { id: 'k2' }),
        result(131, 'b'),
        bash(132, 'c', 'cd /r/.worktrees/fix-1-x && pnpm test:ios', { id: 'k3' }),
        result(200, 'c'),
        bash(201, 'd', 'cd /r/.worktrees/fix-1-x && scripts/pr.sh wait 5', { id: 'k4' }),
        result(261, 'd'),
        bash(262, 'e', 'cd /r/.worktrees/fix-1-x && git log', { id: 'k5' }),
        result(264, 'e'),
        bash(265, 'f', 'cd /r/.worktrees/fix-1-x && git push', { id: 'k6' }),
      ];
      const { data } = snapshot(
        projects(mainWith([{ name: 'a1', meta: meta('builder'), records }])),
      );
      const [ticket] = data.tickets;
      assert.deepEqual(ticket.toolSeconds, { check: 130, native: 68, wait: 60, other: 2 });
      assert.equal(ticket.checkRuns, 2);
    });

    it('measures agent seconds as the union of the intervals of the agents of a ticket', () => {
      const span = (name, from, to) => ({
        name,
        meta: meta('builder'),
        records: [
          bash(from, `${name}t`, 'cd /r/.worktrees/fix-1-x && ls', { id: `${name}1` }),
          result(to, `${name}t`),
        ],
      });
      const { data } = snapshot(
        projects(mainWith([span('a', 0, 100), span('b', 50, 150), span('c', 300, 360)])),
      );
      assert.equal(data.tickets[0].agentSeconds, 210);
    });

    it('prices the tokens of a ticket per model and never adds two models together', () => {
      const records = [
        bash(0, 'a', 'cd /r/.worktrees/fix-1-x && ls', {
          id: 'p1',
          model: 'claude-sonnet-5-5',
          i: 100,
          o: 10,
        }),
        bash(1, 'b', 'cd /r/.worktrees/fix-1-x && ls', {
          id: 'p2',
          model: 'claude-opus-5-5',
          i: 200,
          cr: 1000,
        }),
      ];
      const { data } = snapshot(
        projects(mainWith([{ name: 'a1', meta: meta('builder'), records }])),
      );
      assert.deepEqual(data.tickets[0].cost, { sonnet: 150, opus: 300 });
    });

    describe('reviews', () => {
      const reviewer = (name, offset, text, extra = {}) => ({
        name,
        meta: meta('reviewer', 'Review #7'),
        records: [
          bash(offset, `${name}t`, 'cd /r/.worktrees/fix-7-x && git diff', {
            id: `${name}1`,
            ...extra,
          }),
          result(offset + 1, `${name}t`),
          say(offset + 2, text, { id: `${name}2` }),
        ],
      });
      const findingsText = [
        '- must-fix: a.ts:1 x',
        '- should-fix: a.ts:2 y',
        '- judgement: a.ts:3 z',
        'not clean on abc1234',
      ].join('\n');

      it('records the first and the last verdict and the mean findings per review', () => {
        const { data } = snapshot(
          projects(
            mainWith([
              reviewer('r1', 0, findingsText),
              reviewer('r2', 100, '- should-fix: b.ts:1 w\nnot clean on bcd2345'),
              reviewer('r3', 200, 'No findings. clean on cde3456'),
            ]),
          ),
        );
        const [ticket] = data.tickets;
        assert.equal(ticket.reviews, 3);
        assert.equal(ticket.firstReviewClean, false);
        assert.equal(ticket.reachedClean, true);
        assert.equal(ticket.findingsPerReview, 1);
      });

      it('reads the verdict from the report a reviewer hands back', () => {
        const handback = (offset, message) =>
          call(offset, {
            content: [
              { type: 'tool_use', id: `h${offset}`, name: 'SubagentHandback', input: { message } },
            ],
          });
        const agent = {
          name: 'h1',
          meta: meta('reviewer', 'Review #7'),
          records: [
            bash(0, 't', 'cd /r/.worktrees/fix-7-x && git diff', { id: 'h0' }),
            say(1, 'Working on it; clean on 1111111'),
            handback(2, '- should-fix: a.ts:1 x\nnot clean on 2222222'),
          ],
        };
        const [ticket] = snapshot(projects(mainWith([agent]))).data.tickets;
        assert.equal(ticket.firstReviewClean, false);
        assert.equal(ticket.findingsPerReview, 1);
      });

      it('has no review verdicts for a ticket without reviewers', () => {
        const { data } = snapshot(
          projects(
            mainWith([
              {
                name: 'b',
                meta: meta('builder'),
                records: [bash(0, 'q', 'cd /r/.worktrees/fix-7-x', { id: 'z' })],
              },
            ]),
          ),
        );
        const [ticket] = data.tickets;
        assert.equal(ticket.reviews, 0);
        assert.equal(ticket.firstReviewClean, null);
        assert.equal(ticket.reachedClean, null);
        assert.equal(ticket.findingsPerReview, null);
      });
    });

    it('never writes what the transcripts say', () => {
      const secret = 'a-line-the-snapshot-must-not-copy';
      const agent = {
        name: 'a1',
        meta: meta('reviewer', `Review #7 ${secret}`),
        records: [
          bash(0, 'a', `cd /r/.worktrees/fix-7-x && echo ${secret}`, { id: 'v1' }),
          result(1, 'a'),
          say(2, `${secret}\nclean on abc1234`, { id: 'v2' }),
        ],
      };
      const { out } = snapshot(projects(mainWith([agent])));
      assert.ok(!readFileSync(out, 'utf8').includes(secret));
    });
  });

  describe('GitHub', () => {
    const files = (...specs) =>
      specs.map(([path, additions, deletions = 0]) => ({ path, additions, deletions }));
    const prRules = (extra = []) => [
      ...extra,
      { match: 'repo view', out: { owner: { login: 'owner1' } } },
      { match: 'api user', out: { login: 'person1' } },
      {
        match: 'pr list --state all --head fix/7-x',
        out: [
          {
            number: 70,
            state: 'MERGED',
            createdAt: '2026-10-24T12:00:00Z',
            mergedAt: '2026-10-24T14:00:00Z',
            additions: 5300,
            deletions: 20,
          },
        ],
      },
      {
        match: 'pr view 70 --json files',
        out: {
          files: files(
            ['apps/web/a.ts', 100, 20],
            ['pnpm-lock.yaml', 5000],
            ['packages/contract/generated/x.ts', 180],
          ),
        },
      },
      {
        match: 'pr view 70 --json comments,reviews',
        out: {
          comments: [
            { author: { login: 'owner1' } },
            { author: { login: 'someone' } },
            { author: { login: 'person1' } },
          ],
          reviews: [{ author: { login: 'owner1' } }],
        },
      },
      {
        match: 'pulls/70/comments',
        out: [
          { user: { login: 'owner1' } },
          { user: { login: 'owner1' } },
          { user: { login: 'x' } },
        ],
      },
      {
        match: 'issues/70/timeline',
        out: [
          { event: 'commented' },
          { event: 'removed_from_merge_queue' },
          { event: 'removed_from_merge_queue' },
          { event: 'merged' },
        ],
      },
      {
        match: 'run list --branch fix/7-x',
        out: [
          { conclusion: 'failure', event: 'pull_request' },
          { conclusion: 'success', event: 'pull_request' },
          { conclusion: 'failure', event: 'merge_group' },
          { conclusion: 'failure', event: 'pull_request' },
        ],
      },
      {
        match: 'pr list --state all --limit',
        out: [
          {
            number: 70,
            title: '[F1] x',
            body: '',
            createdAt: '2026-10-24T12:00:00Z',
            headRefName: 'fix/7-x',
          },
          {
            number: 71,
            title: 'fix(F1): follow up',
            body: 'Follows up on #70.',
            createdAt: '2026-10-25T12:00:00Z',
            headRefName: 'fix/8-y',
          },
          {
            number: 72,
            title: 'fix: about #7',
            body: '',
            createdAt: '2026-10-26T12:00:00Z',
            headRefName: 'fix/9-z',
          },
          {
            number: 73,
            title: 'fix: about #70',
            body: '',
            createdAt: '2026-10-24T13:00:00Z',
            headRefName: 'fix/10-w',
          },
          {
            number: 74,
            title: 'fix: about #701',
            body: '',
            createdAt: '2026-10-25T13:00:00Z',
            headRefName: 'fix/11-v',
          },
          {
            number: 75,
            title: 'feat: about #70',
            body: '',
            createdAt: '2026-10-25T13:00:00Z',
            headRefName: 'feature/12-u',
          },
          {
            number: 76,
            title: 'fix: much later #70',
            body: '',
            createdAt: '2026-12-25T13:00:00Z',
            headRefName: 'fix/13-t',
          },
          {
            number: 77,
            title: 'Revert "[F1] x (#70)"',
            body: '',
            createdAt: '2026-10-25T15:00:00Z',
            headRefName: 'revert-70',
          },
        ],
      },
    ];
    const agentOf = () => [
      {
        id: 's1',
        records: [call(0, { id: 'm1' })],
        agents: [
          {
            name: 'a1',
            meta: meta('builder'),
            records: [bash(0, 't', 'cd /r/.worktrees/fix-7-x && ls', { id: 'g1' }), result(1, 't')],
          },
        ],
      },
    ];

    it('adds the PR, its size class and area, and the quality signals of GitHub', () => {
      const { data } = snapshot(projects(agentOf()), [], prRules());
      const [ticket] = data.tickets;
      assert.deepEqual(ticket.pr, {
        number: 70,
        state: 'MERGED',
        createdAt: '2026-10-24T12:00:00Z',
        mergedAt: '2026-10-24T14:00:00Z',
        additions: 5300,
        deletions: 20,
      });
      assert.deepEqual([ticket.area, ticket.size, ticket.group], ['app', 'S', 'app-S']);
      assert.equal(ticket.ciFailures, 2);
      assert.equal(ticket.queueRemovals, 1);
      assert.equal(ticket.ownerComments, 5);
      assert.equal(ticket.followUpFixes, 2);
      assert.equal(ticket.reverted, true);
    });

    it('FIVVI_ASSIGNEE is the person using gh, where gh api user is not allowed (a GitHub App token)', () => {
      const rules = prRules().map((rule) =>
        rule.match === 'api user' ? { ...rule, out: '', status: 1 } : rule,
      );
      const without = snapshot(projects(agentOf()), [], rules);
      assert.equal(without.data.tickets[0].ownerComments, 4, 'only the repository owner counts');
      const withIt = snapshot(projects(agentOf()), [], rules, { FIVVI_ASSIGNEE: 'person1' });
      assert.equal(withIt.data.tickets[0].ownerComments, 5);
      assert.ok(
        !gh.calls().some((c) => c.args[0] === 'api' && c.args[1] === 'user'),
        'gh api user not called',
      );
    });

    it('asks for the runs of a branch with a limit above the default of gh, so none are cut off', () => {
      snapshot(projects(agentOf()), [], prRules());
      const list = gh.calls().find((c) => c.args[0] === 'run' && c.args[1] === 'list');
      const limit = list.args[list.args.indexOf('--limit') + 1];
      assert.ok(Number(limit) >= 200, `--limit ${limit}`);
    });

    it('writes null for the GitHub fields and warns when gh fails, and still writes the snapshot', () => {
      const done = snapshot(projects(agentOf()));
      const [ticket] = done.data.tickets;
      assert.match(done.stderr, /warning: .*gh/i);
      for (const field of [
        'pr',
        'ciFailures',
        'queueRemovals',
        'ownerComments',
        'followUpFixes',
        'reverted',
      ]) {
        assert.equal(ticket[field], null, field);
      }
      assert.equal(ticket.group, 'unknown');
      assert.equal(ticket.agents.builder, 1);
    });

    it('writes null when there is no PR for the branch', () => {
      const rules = [
        { match: 'repo view', out: { owner: { login: 'owner1' } } },
        { match: 'pr list --state all --head', out: [] },
        { match: 'pr list --state all --limit', out: [] },
      ];
      const { data } = snapshot(projects(agentOf()), [], rules);
      assert.equal(data.tickets[0].pr, null);
      assert.equal(data.tickets[0].ciFailures, null);
    });
  });

  describe('flow', () => {
    const WINDOW = ['--since', '2026-11-02', '--until', '2026-11-04T23:59:59Z'];
    const search = (nodes, extra = {}) => ({
      data: {
        search: { issueCount: nodes.length, pageInfo: { hasNextPage: false }, nodes, ...extra },
      },
    });
    const event = (type, createdAt, reason) => ({
      __typename: type,
      createdAt,
      ...(reason ? { reason } : {}),
    });
    const issue = (number, createdAt) => ({ number, createdAt });
    const mergedPrs = [
      {
        number: 10,
        title: '[F1] one secret title',
        body: 'a body that is never stored',
        createdAt: '2026-11-02T14:00:00Z',
        mergedAt: '2026-11-02T19:00:00Z',
        commits: { nodes: [{ commit: { committedDate: '2026-11-02T12:00:00Z' } }] },
        closingIssuesReferences: { nodes: [issue(1, '2026-11-02T00:00:00Z')] },
        timelineItems: {
          nodes: [
            event('ReadyForReviewEvent', '2026-11-02T15:00:00Z'),
            event('AddedToMergeQueueEvent', '2026-11-02T16:00:00Z'),
            event('RemovedFromMergeQueueEvent', '2026-11-02T17:00:00Z', 'FAILED_CHECKS'),
            event('AddedToMergeQueueEvent', '2026-11-02T18:00:00Z'),
            event('RemovedFromMergeQueueEvent', '2026-11-02T19:00:00Z', 'merged'),
          ],
        },
      },
      {
        number: 11,
        title: '[F2] two',
        body: '**Self-review:** standards and spec reviewers clean on `abc1234` ✅ (low risk: 1 should-fix finding left as a follow-up, ADR-033)',
        createdAt: '2026-11-02T06:00:00Z',
        mergedAt: '2026-11-02T10:00:00Z',
        commits: { nodes: [{ commit: { committedDate: '2026-11-02T00:00:00Z' } }] },
        closingIssuesReferences: {
          nodes: [issue(2, '2026-11-01T00:00:00Z'), issue(3, '2026-11-01T12:00:00Z')],
        },
        timelineItems: {
          nodes: [
            event('AddedToMergeQueueEvent', '2026-11-02T08:00:00Z'),
            event('RemovedFromMergeQueueEvent', '2026-11-02T08:30:00Z', 'MERGE_CONFLICT'),
            event('RemovedFromMergeQueueEvent', '2026-11-02T10:00:00Z', 'merged'),
          ],
        },
      },
      {
        number: 12,
        title: 'Revert "[F1] one"',
        body: '',
        createdAt: '2026-11-03T00:30:00Z',
        mergedAt: '2026-11-03T01:00:00Z',
        commits: { nodes: [{ commit: { committedDate: '2026-11-03T00:00:00Z' } }] },
        closingIssuesReferences: { nodes: [] },
        timelineItems: { nodes: [] },
      },
    ];
    const specs = [
      {
        number: 100,
        createdAt: '2026-11-01T00:00:00Z',
        closedAt: '2026-11-03T12:00:00Z',
        subIssues: {
          nodes: [
            {
              number: 900,
              createdAt: '2026-11-01T11:00:00Z',
              labels: { nodes: [{ name: 'bug' }] },
            },
            { number: 101, createdAt: '2026-11-01T12:00:00Z', labels: { nodes: [] } },
          ],
        },
        timelineItems: {
          nodes: [
            { createdAt: '2026-11-01T00:00:01Z', label: { name: 'spec' } },
            { createdAt: '2026-11-01T10:00:00Z', label: { name: 'spec-approved' } },
          ],
        },
      },
    ];
    const bugs = [
      { number: 200, title: 'Nightly UI tests failed', body: 'run 1' },
      { number: 201, title: 'x', body: 'text\nFound by: spec review\nmore' },
      { number: 202, title: 'Deploy failed', body: '<!-- fivvi:deploy-failed production -->' },
      { number: 203, title: 'y', body: 'owner found it' },
    ].map((b) => ({ ...b, createdAt: '2026-11-03T00:00:00Z' }));
    const run = (id, event, conclusion, start, minutes) => ({
      id,
      event,
      conclusion,
      created_at: start,
      run_started_at: start,
      updated_at: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
    });
    const runs = [
      run(1, 'pull_request', 'failure', '2026-11-02T10:00:00Z', 30),
      run(2, 'pull_request', 'success', '2026-11-02T11:00:00Z', 20),
      run(3, 'pull_request', 'success', '2026-11-02T12:00:00Z', 10),
      run(4, 'merge_group', 'success', '2026-11-02T13:00:00Z', 25),
      run(5, 'merge_group', 'failure', '2026-11-02T14:00:00Z', 35),
      run(6, 'schedule', 'success', '2026-11-03T02:00:00Z', 50),
      run(7, 'push', null, '2026-11-03T03:00:00Z', 1),
    ];
    const job = (name, conclusion, seconds, label) => ({
      name,
      conclusion,
      started_at: '2026-11-02T10:00:00Z',
      completed_at: new Date(Date.parse('2026-11-02T10:00:00Z') + seconds * 1000).toISOString(),
      labels: [label],
    });
    const jobsOfRun = {
      1: [
        job('Checks (Linux)', 'failure', 600, 'ubuntu-latest'),
        job('iOS tests (nl)', 'success', 1200, 'macos-15'),
      ],
      2: [
        job('Checks (Linux)', 'success', 300, 'ubuntu-latest'),
        job('iOS tests (nl)', 'success', 1500, 'macos-15'),
        job('E2E (Linux)', 'skipped', 0, 'ubuntu-latest'),
      ],
      3: [job('Checks (Linux)', 'success', 400, 'ubuntu-latest')],
      4: [
        job('Checks (Linux)', 'success', 500, 'ubuntu-latest'),
        job('iOS tests (nl)', 'success', 1000, 'macos-15'),
      ],
      5: [job('Checks (Linux)', 'failure', 700, 'ubuntu-latest')],
      6: [job('iOS tests (nl)', 'success', 1800, 'macos-15')],
    };
    const flowRules = (over = {}) => [
      { match: 'repo view', out: { owner: { login: 'owner1' }, nameWithOwner: 'o/r' } },
      { match: 'api user', out: { login: 'person1' } },
      { match: 'pr list --state all --limit', out: [] },
      { match: 'is:merged', out: search(over.prs ?? mergedPrs) },
      { match: 'label:spec', out: search(over.specs ?? specs) },
      { match: 'label:bug', out: search(over.bugs ?? bugs) },
      { match: 'workflows/ci.yml/runs', out: { workflow_runs: over.runs ?? runs } },
      ...Object.entries(jobsOfRun).map(([id, list]) => ({
        match: `actions/runs/${id}/jobs`,
        out: { jobs: list },
      })),
      ...(over.extra ?? []),
    ];

    // A repo whose main holds .github/pipeline.json as `files` says at each date: [[date, {ci, review} | null]].
    const repoWith = (commits) => {
      const dir = join(base, `repo-${++n}`);
      mkdirSync(dir);
      const git = (args, date) =>
        spawnSync('git', ['-C', dir, ...args], {
          encoding: 'utf8',
          env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
        });
      git(['init', '-q', '-b', 'main'], '2026-10-01T00:00:00Z');
      git(['config', 'user.email', '1+t@users.noreply.github.com'], '2026-10-01T00:00:00Z');
      git(['config', 'user.name', 't'], '2026-10-01T00:00:00Z');
      git(['config', 'commit.gpgsign', 'false'], '2026-10-01T00:00:00Z');
      for (const [date, settings] of commits) {
        mkdirSync(join(dir, '.github'), { recursive: true });
        if (settings) writeFileSync(join(dir, '.github/pipeline.json'), JSON.stringify(settings));
        else writeFileSync(join(dir, 'README'), date);
        git(['add', '-A'], date);
        assert.equal(git(['commit', '-q', '-m', 'c', '--no-verify'], date).status, 0);
      }
      return dir;
    };
    const fullRepo = () => repoWith([['2026-10-01T00:00:00Z', null]]);
    const flowSnapshot = (rules = flowRules(), { git = fullRepo(), cache, args = [] } = {}) => {
      const dir = projects([]);
      const done = snapshot(
        dir,
        [...WINDOW, '--git', git, '--cache', cache ?? join(base, `cache-${++n}`), ...args],
        rules,
      );
      return done;
    };

    it('measures the time of the merged PRs in hours, median and p90, and the tickets merged per day', () => {
      const { flow } = flowSnapshot().data;
      const t = flow.time;
      assert.equal(t.mergedPrs, 3);
      assert.equal(t.tickets, 3);
      assert.equal(t.ticketsPerDay, 1);
      assert.deepEqual(t.backlog, { n: 3, median: 12, p90: 24 });
      assert.deepEqual(t.firstCommitToPr, { n: 3, median: 2, p90: 6 });
      // a PR that never was a draft is ready when it opens
      assert.deepEqual(t.prToReady, { n: 3, median: 0, p90: 1 });
      // a PR that was never queued has no queue times
      assert.deepEqual(t.readyToQueued, { n: 2, median: 1.5, p90: 2 });
      assert.deepEqual(t.queuedToMerged, { n: 2, median: 2.5, p90: 3 });
      assert.deepEqual(t.prToMerged, { n: 3, median: 4, p90: 5 });
      assert.deepEqual(t.issueToMerged, { n: 3, median: 22, p90: 34 });
      assert.deepEqual(flow.window, {
        since: '2026-11-02T00:00:00Z',
        until: '2026-11-04T23:59:59Z',
        days: 3,
      });
    });

    it('measures a spec from created to spec-approved, first ticket and closed, leaving its bugs out of the tickets', () => {
      const { spec } = flowSnapshot().data.flow.time;
      assert.equal(spec.n, 1);
      assert.deepEqual(spec.createdToApproved, { n: 1, median: 10, p90: 10 });
      assert.deepEqual(spec.approvedToFirstTicket, { n: 1, median: 2, p90: 2 });
      assert.deepEqual(spec.firstTicketToClosed, { n: 1, median: 48, p90: 48 });
      assert.deepEqual(spec.createdToClosed, { n: 1, median: 60, p90: 60 });
    });

    it('counts CI runs per event with wall time and failure rate, a run per merged PR and the runner hours', () => {
      const { ci } = flowSnapshot().data.flow;
      assert.equal(ci.runs, 7);
      assert.deepEqual(ci.events.pull_request, {
        runs: 3,
        wallMedianMinutes: 20,
        wallP90Minutes: 30,
        failureRate: 0.333,
        nativeRuns: 2,
        nativeWallMedianMinutes: 25,
      });
      assert.deepEqual(ci.events.merge_group, {
        runs: 2,
        wallMedianMinutes: 30,
        wallP90Minutes: 35,
        failureRate: 0.5,
        nativeRuns: 1,
        nativeWallMedianMinutes: 25,
      });
      assert.equal(ci.events.schedule.runs, 1);
      assert.equal(ci.events.schedule.nativeWallMedianMinutes, 50);
      // a run still going has no outcome and no wall time yet
      assert.equal(ci.events.push.failureRate, null);
      assert.equal(ci.events.push.wallMedianMinutes, null);
      assert.equal(ci.events.push.nativeWallMedianMinutes, null);
      assert.equal(ci.runsPerMergedPr, 1.67);
      assert.deepEqual(ci.runnerHours, { linux: 0.7, macos: 1.5, other: 0 });
    });

    it('measures each job: run time and failure rate, the nightly run apart, a skipped job counted in neither', () => {
      const { jobs } = flowSnapshot().data.flow.ci;
      assert.deepEqual(jobs['Checks (Linux)'], { runs: 5, medianMinutes: 8.3, failureRate: 0.4 });
      assert.deepEqual(jobs['iOS tests (nl)'], { runs: 3, medianMinutes: 20, failureRate: 0 });
      assert.deepEqual(jobs['iOS tests (nl) (schedule)'], {
        runs: 1,
        medianMinutes: 30,
        failureRate: 0,
      });
      assert.equal(jobs['E2E (Linux)'], undefined);
    });

    it('counts queue removals per PR by reason and does not count the removal that comes with a merge', () => {
      const { ci } = flowSnapshot().data.flow;
      assert.deepEqual(ci.removalsByReason, { failed_checks: 1, merge_conflict: 1 });
      assert.equal(ci.queueRemovals, 2);
      assert.equal(ci.queueRemovalsPerPr, 0.67);
      const { prs } = flowSnapshot().data.flow;
      assert.deepEqual(prs.find((p) => p.number === 10).removals, { failed_checks: 1 });
    });

    it('sorts the bugs of the window by source and counts them per merged ticket', () => {
      const { quality } = flowSnapshot().data.flow;
      assert.equal(quality.bugs.total, 4);
      assert.equal(quality.bugs.perTicket, 1.33);
      assert.deepEqual(quality.bugs.numbers, {
        nightly: [200],
        specReview: [201],
        deploy: [202],
        other: [203],
      });
    });

    it('totals reverts, follow-up fixes and the PRs merged with should-fix follow-ups', () => {
      const inWindow = (record) => ({ ...record, timestamp: '2026-11-03T00:00:00Z' });
      const dir = projects([
        {
          id: 's',
          records: [inWindow(call(0, { id: 'm' }))],
          agents: [
            {
              name: 'a',
              meta: meta('builder'),
              records: [
                inWindow(bash(0, 't', 'cd /r/.worktrees/fix-7-x && ls', { id: 'g1' })),
                inWindow(result(1, 't')),
              ],
            },
          ],
        },
      ]);
      const rules = [
        {
          match: 'pr list --state all --head fix/7-x',
          out: [
            {
              number: 70,
              state: 'MERGED',
              createdAt: '2026-11-02T12:00:00Z',
              mergedAt: '2026-11-02T14:00:00Z',
              additions: 5,
              deletions: 0,
            },
          ],
        },
        {
          match: 'pr view 70 --json files',
          out: { files: [{ path: 'apps/web/a.ts', additions: 5, deletions: 0 }] },
        },
        { match: 'pr view 70 --json comments,reviews', out: { comments: [], reviews: [] } },
        { match: 'pulls/70/comments', out: [] },
        { match: 'issues/70/timeline', out: [] },
        { match: 'run list --branch fix/7-x', out: [] },
        {
          match: 'pr list --state all --limit',
          out: [
            {
              number: 70,
              title: 't',
              body: '',
              createdAt: '2026-11-02T12:00:00Z',
              headRefName: 'fix/7-x',
            },
            {
              number: 75,
              title: 'fix: a follow up of #70',
              body: '',
              createdAt: '2026-11-03T12:00:00Z',
              headRefName: 'fix/8-y',
            },
            {
              number: 76,
              title: 'Revert "t #70"',
              body: '',
              createdAt: '2026-11-03T13:00:00Z',
              headRefName: 'revert-70',
            },
          ],
        },
        ...flowRules(),
      ];
      const done = snapshot(
        dir,
        [...WINDOW, '--git', fullRepo(), '--cache', join(base, `cache-${++n}`)],
        rules,
      );
      const { quality } = done.data.flow;
      assert.equal(done.data.tickets[0].followUpFixes, 1);
      assert.equal(quality.followUpFixes, 1);
      assert.equal(quality.revertedTickets, 1);
      assert.equal(quality.reverts, 1);
      assert.equal(quality.prsWithShouldFixLeft, 1);
      assert.equal(quality.shouldFixLeft, 1);
    });

    it('keeps one record of numbers per merged PR, and no title, body or text of GitHub', () => {
      const done = flowSnapshot();
      const text = JSON.stringify(done.data.flow);
      for (const secret of [
        'one secret title',
        'never stored',
        'owner found it',
        'Nightly UI',
        'Found by',
        'fivvi:deploy',
      ]) {
        assert.ok(!text.includes(secret), secret);
      }
      assert.deepEqual(
        done.data.flow.prs.find((p) => p.number === 11),
        {
          number: 11,
          issues: [2, 3],
          backlog: [24, 12],
          issueToMerged: [34, 22],
          firstCommitToPr: 6,
          prToReady: 0,
          readyToQueued: 2,
          queuedToMerged: 2,
          prToMerged: 4,
          removals: { merge_conflict: 1 },
        },
      );
    });

    it('reads the next page of a search with the cursor of the last one', () => {
      const first = {
        ...search([mergedPrs[0]]),
        data: {
          search: {
            issueCount: 3,
            pageInfo: { hasNextPage: true, endCursor: 'c1' },
            nodes: [mergedPrs[0]],
          },
        },
      };
      const second = search([mergedPrs[1], mergedPrs[2]]);
      const rules = [{ match: 'is:merged', outs: [first, second] }, ...flowRules()];
      const { data } = flowSnapshot(rules);
      assert.equal(data.flow.time.mergedPrs, 3);
      const searches = gh.calls().filter((c) => c.args.join(' ').includes('is:merged'));
      assert.equal(searches.length, 2);
      assert.ok(!searches[0].args.join(' ').includes('after='));
      assert.ok(searches[1].args.includes('after=c1'));
    });

    it('asks for the runs a week at a time and counts a run that two weeks both return once', () => {
      const { data } = flowSnapshot(flowRules(), { args: ['--since', '2026-10-20'] });
      const lists = gh.calls().filter((c) => c.args.join(' ').includes('workflows/ci.yml/runs'));
      assert.ok(lists.length >= 2, `${lists.length} calls`);
      assert.equal(data.flow.ci.runs, 7);
    });

    it('keeps the jobs of a finished run in the cache and reads them from there next time', () => {
      const cache = join(base, `cache-${++n}`);
      flowSnapshot(flowRules(), { cache });
      const jobCalls = () => gh.calls().filter((c) => c.args.join(' ').includes('/jobs'));
      // run 7 has not finished: its jobs are neither read nor cached
      assert.equal(jobCalls().length, 6);
      assert.ok(existsSync(join(cache, '1.json')));
      assert.ok(!existsSync(join(cache, '7.json')));
      assert.deepEqual(JSON.parse(readFileSync(join(cache, '1.json'), 'utf8')), [
        { name: 'Checks (Linux)', conclusion: 'failure', seconds: 600, os: 'linux' },
        { name: 'iOS tests (nl)', conclusion: 'success', seconds: 1200, os: 'macos' },
      ]);
      const again = flowSnapshot(flowRules(), { cache });
      assert.equal(jobCalls().length, 0);
      assert.equal(again.data.flow.ci.jobs['Checks (Linux)'].runs, 5);
    });

    it('warns of a job list it could not read and goes on without it', () => {
      const rules = flowRules({ extra: [] });
      rules.unshift({ match: 'actions/runs/3/jobs', out: '', status: 1 });
      const done = flowSnapshot(rules);
      assert.deepEqual(done.data.flow.warnings.length, 1);
      assert.match(done.data.flow.warnings[0], /run 3/);
      assert.equal(done.data.flow.ci.runsWithoutJobs, 1);
      assert.equal(done.data.flow.ci.jobs['Checks (Linux)'].runs, 4);
    });

    it('says which flow it measured: the settings on main at the start and the end of the window', () => {
      const git = repoWith([
        ['2026-10-01T00:00:00Z', { ci: 'fast', review: 'split' }],
        ['2026-10-02T00:00:00Z', null],
      ]);
      const { settings, warnings } = flowSnapshot(flowRules(), { git }).data.flow;
      assert.equal(settings.start.ci, 'fast');
      assert.equal(settings.end.review, 'split');
      assert.equal(settings.changed, false);
      assert.deepEqual(warnings, []);
    });

    it('reads a main without .github/pipeline.json as the full flow', () => {
      const { settings } = flowSnapshot().data.flow;
      assert.deepEqual([settings.start.ci, settings.start.review], ['full', 'per-pr']);
      assert.deepEqual([settings.end.ci, settings.end.review], ['full', 'per-pr']);
      assert.equal(settings.changed, false);
    });

    it('warns when the settings changed inside the window, and shows both', () => {
      const git = repoWith([
        ['2026-10-01T00:00:00Z', null],
        ['2026-11-03T12:00:00Z', { ci: 'fast', review: 'split' }],
      ]);
      const { settings, warnings } = flowSnapshot(flowRules(), { git }).data.flow;
      assert.deepEqual([settings.start.ci, settings.start.review], ['full', 'per-pr']);
      assert.deepEqual([settings.end.ci, settings.end.review], ['fast', 'split']);
      assert.equal(settings.changed, true);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /changed inside the window/);
    });

    it('warns of a change that went back inside the window, though the start equals the end', () => {
      const git = repoWith([
        ['2026-10-01T00:00:00Z', { ci: 'fast', review: 'split' }],
        ['2026-11-03T00:00:00Z', { ci: 'full', review: 'split' }],
        ['2026-11-03T12:00:00Z', { ci: 'fast', review: 'split' }],
      ]);
      const { settings, warnings } = flowSnapshot(flowRules(), { git }).data.flow;
      assert.equal(settings.changed, true);
      assert.equal(warnings.length, 1);
    });

    it('writes flow null and warns when gh fails, and still writes the tickets', () => {
      const done = snapshot(projects([]));
      assert.equal(done.data.flow, null);
      assert.match(done.stderr, /warning: .*gh/i);
    });

    it('writes flow null and warns when a GitHub query fails half way', () => {
      const rules = [{ match: 'label:bug', out: '', status: 1 }, ...flowRules()];
      const done = flowSnapshot(rules);
      assert.equal(done.data.flow, null);
      assert.match(done.stderr, /warning: .*gh/i);
    });

    it('warns when a search holds as many results as GitHub returns at most', () => {
      const rules = [
        { match: 'label:bug', out: search(bugs, { issueCount: 1000 }) },
        ...flowRules(),
      ];
      const { data } = flowSnapshot(rules);
      assert.match(data.flow.warnings.join('\n'), /1000 results/);
    });
  });

  describe('files and commands', () => {
    it('writes docs/agents/usage/<label>.json by default, formatted with a trailing newline', () => {
      const dir = projects([{ id: 's1', records: [call(0, { id: 'm' })] }]);
      const out = join(base, 'default-out');
      const done = run([
        'snapshot',
        '--projects',
        dir,
        '--root',
        REPO_PATH,
        '--label',
        'lbl',
        '--out',
        join(out, 'a.json'),
      ]);
      assert.equal(done.status, 0, done.stderr);
      const text = readFileSync(join(out, 'a.json'), 'utf8');
      assert.ok(text.endsWith('}\n'));
      assert.ok(text.includes('\n  "version": 1,'));
    });

    it('prints the usage and exits 2 for an unknown command or option', () => {
      for (const args of [
        [],
        ['frobnicate'],
        ['snapshot', '--nope'],
        ['compare', 'only-one.json'],
      ]) {
        const done = run(args);
        assert.equal(done.status, 2, args.join(' '));
        assert.match(done.stderr, /usage\.mjs snapshot/);
        assert.doesNotMatch(done.stderr, /import |const /);
      }
    });
  });

  describe('compare', () => {
    const ticket = (over = {}) => ({
      branch: 'feature/1-a',
      issue: 1,
      area: 'app',
      size: 'M',
      group: 'app-M',
      agents: { builder: 2, reviewer: 3 },
      cost: { opus: 3_000_000 },
      agentSeconds: 3600,
      toolSeconds: { check: 600, native: 0, wait: 1200, other: 100 },
      checkRuns: 4,
      reviews: 3,
      firstReviewClean: false,
      reachedClean: true,
      findingsPerReview: 2,
      ciFailures: 1,
      queueRemovals: 0,
      ownerComments: 2,
      followUpFixes: 0,
      reverted: false,
      ...over,
    });
    const snap = (label, tickets, sessions = []) => ({
      version: 1,
      label,
      since: '2026-10-24',
      until: null,
      generatedAt: '2026-10-26T12:00:00Z',
      sessions,
      tickets,
      agents: {
        byRole: {
          builder: {
            count: 2 * tickets.length,
            medianFirstContext: 70_000,
            medianPeakContext: 150_000,
          },
          reviewer: {
            count: 3 * tickets.length,
            medianFirstContext: 72_000,
            medianPeakContext: 120_000,
          },
        },
      },
    });
    const session = (over = {}) => ({
      id: 's',
      avgContext: 450_000,
      peakContext: 965_000,
      compactions: 1,
      cost: { opus: 100_000_000 },
      costPerTicket: { opus: 2_000_000 },
      tickets: ['a'],
      ...over,
    });
    const write = (name, data) => {
      const file = join(base, name);
      writeFileSync(file, JSON.stringify(data));
      return file;
    };
    const compare = (before, after) => {
      const done = run(['compare', write(`b-${++n}.json`, before), write(`a-${n}.json`, after)]);
      assert.equal(done.status, 0, done.stderr);
      return done.stdout;
    };

    it('shows each metric of a group present in both snapshots as before → after with the change in %', () => {
      const before = snap('before', [ticket(), ticket(), ticket()], [session()]);
      const after = snap(
        'after',
        [
          ticket({
            cost: { opus: 1_500_000 },
            reviews: 1,
            firstReviewClean: true,
            agents: { builder: 2, reviewer: 1 },
          }),
          ticket({
            cost: { opus: 1_500_000 },
            reviews: 1,
            firstReviewClean: true,
            agents: { builder: 2, reviewer: 1 },
          }),
          ticket({
            cost: { opus: 1_500_000 },
            reviews: 1,
            firstReviewClean: true,
            agents: { builder: 2, reviewer: 1 },
          }),
        ],
        [session({ peakContext: 300_000, compactions: 0 })],
      );
      const out = compare(before, after);
      assert.match(out, /app-M \(n 3 → 3\)\n/);
      assert.doesNotMatch(out, /app-M .*\(few\)/);
      assert.match(out, /opus cost per ticket\s+3\.0M → 1\.5M\s+-50%/);
      assert.match(out, /reviews per ticket\s+3\.0 → 1\.0\s+-67%/);
      assert.match(out, /agents per ticket\s+5\.0 → 3\.0\s+-40%/);
      assert.match(out, /first review clean rate\s+0% → 100%/);
      assert.match(out, /reached clean rate\s+100% → 100%\s+0%/);
      assert.match(out, /agent minutes per ticket\s+60\.0 → 60\.0/);
      assert.match(out, /^all \(n 3 → 3\)/m);
      assert.match(out, /builder agents per ticket\s+2\.0 → 2\.0/);
      assert.match(out, /reviewer median peak context\s+120k → 120k/);
      assert.match(out, /session peak context\s+965k → 300k\s+-69%/);
      assert.match(out, /compactions per session\s+1\.0 → 0\.0\s+-100%/);
      assert.match(out, /orchestrator opus cost per ticket\s+2\.0M → 2\.0M/);
    });

    it('marks a group with fewer than 3 tickets on either side with (few) and skips groups in only one snapshot', () => {
      const before = snap('before', [
        ticket(),
        ticket(),
        ticket(),
        ticket({ group: 'native-L', area: 'native', size: 'L' }),
      ]);
      const after = snap('after', [
        ticket(),
        ticket(),
        ticket({ group: 'docs-S', area: 'docs', size: 'S' }),
      ]);
      const out = compare(before, after);
      assert.match(out, /app-M \(n 3 → 2\) \(few\)/);
      assert.doesNotMatch(out, /native-L|docs-S/);
    });

    it('prints n/a for a quality field that is null and for a change from zero', () => {
      const nulls = {
        ciFailures: null,
        queueRemovals: null,
        ownerComments: null,
        followUpFixes: null,
        reverted: null,
      };
      const before = snap('before', [ticket(nulls), ticket(nulls), ticket(nulls)]);
      const after = snap('after', [ticket(), ticket(), ticket()]);
      const out = compare(before, after);
      assert.match(out, /CI failures per ticket\s+n\/a → 1\.0\s+n\/a/);
      assert.match(out, /native minutes per ticket\s+0\.0 → 0\.0\s+n\/a/);
    });

    describe('the flow', () => {
      const spread = (median, p90 = median * 2) => ({ n: 10, median, p90 });
      const flow = (over = {}) => ({
        window: { since: '2026-10-21T00:00:00Z', until: '2026-11-18T23:59:59Z', days: 28 },
        settings: {
          ref: 'main',
          start: { sha: 'a', ci: 'full', review: 'per-pr' },
          end: { sha: 'a', ci: 'full', review: 'per-pr' },
          changed: false,
        },
        warnings: [],
        time: {
          mergedPrs: 100,
          tickets: 84,
          ticketsPerDay: 3,
          backlog: spread(30),
          firstCommitToPr: spread(1),
          prToReady: spread(2),
          readyToQueued: spread(1),
          queuedToMerged: spread(0.5),
          prToMerged: spread(10),
          issueToMerged: spread(40),
          spec: {
            n: 4,
            createdToApproved: spread(43),
            approvedToFirstTicket: spread(2),
            firstTicketToClosed: spread(100),
            createdToClosed: spread(150),
          },
        },
        ci: {
          runs: 800,
          runsPerMergedPr: 4,
          runnerHours: { linux: 200, macos: 400, other: 0 },
          queueRemovalsPerPr: 0.5,
          removalsByReason: { failed_checks: 30, merge_conflict: 10 },
          events: {
            pull_request: {
              runs: 400,
              wallMedianMinutes: 25,
              wallP90Minutes: 60,
              failureRate: 0.2,
              nativeWallMedianMinutes: 25,
            },
            schedule: { runs: 0 },
          },
          jobs: { 'iOS tests (nl)': { runs: 100, medianMinutes: 22, failureRate: 0.1 } },
        },
        quality: {
          bugs: { total: 20, perTicket: 0.24, nightly: 0, specReview: 0, deploy: 2, other: 18 },
          reverts: 1,
          revertedTickets: 1,
          followUpFixes: 5,
          prsWithShouldFixLeft: 3,
        },
        prs: [
          {
            number: 10,
            issues: [1],
            prToMerged: 10,
            readyToQueued: 1,
            queuedToMerged: 0.5,
            issueToMerged: [40],
          },
          {
            number: 11,
            issues: [2, 3],
            prToMerged: 20,
            readyToQueued: 2,
            queuedToMerged: 1,
            issueToMerged: [50, 70],
          },
        ],
        ...over,
      });
      const fast = () => {
        const f = flow();
        f.settings.end = { sha: 'b', ci: 'fast', review: 'split' };
        f.time.prToMerged = spread(5);
        f.time.backlog = spread(15, 40);
        f.time.ticketsPerDay = 4.5;
        f.ci.runnerHours = { linux: 150, macos: 100, other: 0 };
        f.ci.removalsByReason = { failed_checks: 5 };
        f.ci.events.pull_request = { ...f.ci.events.pull_request, nativeWallMedianMinutes: 6 };
        f.ci.events.schedule = {
          runs: 28,
          wallMedianMinutes: 70,
          wallP90Minutes: 80,
          failureRate: 0.25,
        };
        f.ci.jobs['iOS tests (nl)'] = { runs: 80, medianMinutes: 4, failureRate: 0.02 };
        f.ci.jobs['iOS tests (nl) (schedule)'] = { runs: 28, medianMinutes: 22, failureRate: 0.2 };
        f.quality.bugs = {
          total: 30,
          perTicket: 0.4,
          nightly: 8,
          specReview: 6,
          deploy: 1,
          other: 15,
        };
        f.warnings = ['.github/pipeline.json changed inside the window (x)'];
        return f;
      };

      it('prints the settings, the times, the CI, the removals by reason and the bugs, before → after', () => {
        const out = compare(
          { ...snap('full', [ticket()]), flow: flow() },
          { ...snap('fast', [ticket()]), flow: fast() },
        );
        assert.match(out, /^Flow$/m);
        assert.match(out, /settings\s+ci full, review per-pr → ci fast, review split/);
        assert.match(out, /PR opened → merged, median\s+10\.0 → 5\.0\s+-50%/);
        assert.match(out, /PR opened → merged, p90\s+20\.0 → 10\.0\s+-50%/);
        assert.match(out, /issue opened → first commit, p90\s+60\.0 → 40\.0\s+-33%/);
        assert.match(out, /tickets merged per day\s+3\.0 → 4\.5\s+\+50%/);
        assert.match(out, /spec created → spec-approved, median\s+43\.0 → 43\.0/);
        assert.match(out, /runner hours macos\s+400\.0 → 100\.0\s+-75%/);
        assert.match(out, /runs per merged PR\s+4\.0 → 4\.0/);
        assert.match(out, /pull_request wall median \(min\)\s+25\.0 → 25\.0/);
        assert.match(out, /pull_request failure rate\s+20% → 20%/);
        assert.match(out, /pull_request native runs wall median \(min\)\s+25\.0 → 6\.0\s+-76%/);
        assert.match(out, /schedule runs\s+0 → 28/);
        assert.match(out, /queue removals: failed_checks\s+30 → 5\s+-83%/);
        assert.match(out, /queue removals: merge_conflict\s+10 → 0\s+-100%/);
        assert.match(out, /job iOS tests \(nl\) median \(min\)\s+22\.0 → 4\.0\s+-82%/);
        assert.match(out, /job iOS tests \(nl\) failure rate\s+10% → 2%/);
        assert.match(out, /job iOS tests \(nl\) \(schedule\) median \(min\)\s+n\/a → 22\.0/);
        assert.match(out, /bugs from nightly\s+0 → 8/);
        assert.match(out, /bugs per merged ticket\s+0\.2 → 0\.4\s+\+67%/);
        assert.match(out, /PRs merged with should-fix follow-ups\s+3 → 3/);
      });

      it('prints the warnings of a snapshot, and says so when one side has no flow', () => {
        const out = compare(
          { ...snap('full', [ticket()]), flow: flow() },
          { ...snap('fast', [ticket()]), flow: fast() },
        );
        assert.match(out, /warning: fast: \.github\/pipeline\.json changed inside the window/);
        const without = compare(snap('old', [ticket()]), {
          ...snap('fast', [ticket()]),
          flow: fast(),
        });
        assert.match(without, /warning: old has no flow section/);
        assert.match(without, /PR opened → merged, median\s+n\/a → 5\.0\s+n\/a/);
      });

      it('prints nothing of the flow when neither snapshot has one', () => {
        const out = compare(snap('a', [ticket()]), snap('b', [ticket()]));
        assert.doesNotMatch(out, /Flow/);
      });

      it('shows the times per ticket group, joined by the PR of each ticket', () => {
        const mine = (n, over = {}) => ticket({ pr: { number: n }, ...over });
        const before = {
          ...snap('full', [mine(10), mine(11), mine(10)]),
          flow: flow(),
        };
        const quick = fast();
        quick.prs = [
          {
            number: 10,
            issues: [1],
            prToMerged: 4,
            readyToQueued: 0.5,
            queuedToMerged: 0.25,
            issueToMerged: [20],
          },
          {
            number: 11,
            issues: [2],
            prToMerged: 8,
            readyToQueued: 1,
            queuedToMerged: 0.5,
            issueToMerged: [30],
          },
        ];
        const after = { ...snap('fast', [mine(10), mine(11), mine(10)]), flow: quick };
        const out = compare(before, after);
        const group = out.slice(out.indexOf('app-M (n 3 → 3)'), out.indexOf('Sessions'));
        assert.match(group, /PR opened → merged, median hours\s+10\.0 → 4\.0\s+-60%/);
        assert.match(group, /ready → first queued, median hours\s+1\.0 → 0\.5\s+-50%/);
        assert.match(group, /first queued → merged, median hours\s+0\.5 → 0\.3/);
        assert.match(group, /issue opened → merged, median hours\s+45\.0 → 20\.0\s+-56%/);
      });
    });
  });

  it('has the snapshot of the baseline run in docs/agents/usage', () => {
    const file = join(import.meta.dirname, '../../docs/agents/usage/2026-10-24-factory.json');
    assert.ok(existsSync(file), `${file} is committed`);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(data.version, 1);
    assert.ok(Array.isArray(data.tickets));
  });

  it('has the snapshot of the full pipeline (ADR-034) with its flow, to compare the fast one with', () => {
    const file = join(import.meta.dirname, '../../docs/agents/usage/2026-11-18-full-pipeline.json');
    assert.ok(existsSync(file), `${file} is committed`);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(data.label, '2026-11-18-full-pipeline');
    assert.deepEqual(
      [data.flow.settings.start.ci, data.flow.settings.start.review],
      ['full', 'per-pr'],
    );
    assert.deepEqual(
      [data.flow.settings.end.ci, data.flow.settings.end.review],
      ['full', 'per-pr'],
    );
    assert.ok(data.flow.time.mergedPrs > 0 && data.flow.ci.runs > 0);
  });
});
