import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
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

const REPO = join(import.meta.dirname, '../..');
const NAMES = ['builder', 'mechanic', 'reviewer'];

// The tier table the owner decided (issue #99): the model per tool for each tier.
const EXPECTED = {
  builder: {
    claude: 'sonnet',
    copilot: "['claude-sonnet-5.5', 'Claude Sonnet 5.5 (copilot)']",
    codex: ['gpt-5.6-terra', 'medium'],
  },
  reviewer: {
    claude: 'opus',
    copilot: "['claude-opus-5.5', 'Claude Opus 5.5 (copilot)']",
    codex: ['gpt-6.1-sol', 'high'],
  },
  mechanic: {
    claude: 'haiku',
    copilot: "['claude-haiku-5.5', 'Claude Haiku 5.5 (copilot)']",
    codex: ['gpt-6-luna', 'low'],
  },
};

const read = (root, path) => readFileSync(join(root, path), 'utf8');
const write = (root, path, text) => writeFileSync(join(root, path), text);
const replaceIn = (root, path, from, to) => {
  const text = read(root, path);
  assert.ok(text.includes(from), `${path} has no ${from}`);
  write(root, path, text.replace(from, to));
};

describe('agent definitions in the repo', () => {
  it('pins the owner-decided model per tool for each agent', () => {
    for (const name of NAMES) {
      const claude = read(REPO, `.claude/agents/${name}.md`);
      assert.match(claude, new RegExp(`^model: ${EXPECTED[name].claude}$`, 'm'), `claude ${name}`);
      const copilot = read(REPO, `.github/agents/${name}.agent.md`);
      assert.ok(copilot.includes(`\nmodel: ${EXPECTED[name].copilot}\n`), `copilot ${name}`);
      const codex = read(REPO, `.codex/agents/${name}.toml`);
      const [model, effort] = EXPECTED[name].codex;
      assert.match(codex, new RegExp(`^model = "${model}"$`, 'm'), `codex ${name}`);
      assert.match(codex, new RegExp(`^model_reasoning_effort = "${effort}"$`, 'm'), name);
    }
  });

  it('has exactly the three agents in every tool folder', () => {
    assert.deepEqual(readdirSync(join(REPO, '.agents/agents')).sort(), [
      ...NAMES.map((name) => `${name}.md`),
      'tiers.json',
    ]);
    assert.deepEqual(
      readdirSync(join(REPO, '.claude/agents')).sort(),
      NAMES.map((n) => `${n}.md`),
    );
    assert.deepEqual(
      readdirSync(join(REPO, '.github/agents')).sort(),
      NAMES.map((n) => `${n}.agent.md`),
    );
    assert.deepEqual(
      readdirSync(join(REPO, '.codex/agents')).sort(),
      NAMES.map((n) => `${n}.toml`),
    );
  });

  it('runs the main Codex conversation on the high tier', () => {
    const config = read(REPO, '.codex/config.toml');
    assert.match(config, /^model = "gpt-6\.1-sol"$/m);
    assert.match(config, /^review_model = "gpt-6\.1-sol"$/m);
  });

  it('passes agents.sh check', () => {
    const result = spawnSync(join(REPO, 'scripts/agents.sh'), ['check'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

describe('agents.sh', () => {
  let base;
  let repo;

  const agents = (...args) =>
    spawnSync(join(repo, 'scripts/agents.sh'), args, { encoding: 'utf8' });
  const sync = () => assert.equal(agents('sync').status, 0);
  const failsWith = (pattern) => {
    const result = agents('check');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr + result.stdout, pattern);
  };

  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'agents-sh-')));
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  // A fresh copy of the sources, the config and the script in its own git repository per test.
  const fresh = () => {
    repo = join(base, `repo-${readdirSync(base).length}`);
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    mkdirSync(join(repo, '.codex'), { recursive: true });
    cpSync(join(REPO, '.agents/agents'), join(repo, '.agents/agents'), { recursive: true });
    cpSync(join(REPO, '.codex/config.toml'), join(repo, '.codex/config.toml'));
    for (const file of ['agents.sh', '_lib.sh']) {
      cpSync(join(REPO, 'scripts', file), join(repo, 'scripts', file));
    }
    execFileSync('git', ['init', '--quiet', repo]);
    sync();
  };

  it('prints its commands, never its code', () => {
    fresh();
    const result = agents();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /agents\.sh sync/);
    assert.doesNotMatch(result.stderr, /set -euo|source /);
  });

  it('generates the definitions of all three tools and then passes check', () => {
    fresh();
    for (const name of NAMES) {
      assert.ok(existsSync(join(repo, `.claude/agents/${name}.md`)));
      assert.ok(existsSync(join(repo, `.github/agents/${name}.agent.md`)));
      assert.ok(existsSync(join(repo, `.codex/agents/${name}.toml`)));
    }
    assert.equal(agents('check').status, 0);
  });

  it('keeps the source body and description in every tool', () => {
    fresh();
    const body = read(repo, '.agents/agents/mechanic.md').split('---\n')[2].trim();
    for (const path of [
      '.claude/agents/mechanic.md',
      '.github/agents/mechanic.agent.md',
      '.codex/agents/mechanic.toml',
    ]) {
      const text = read(repo, path);
      assert.ok(text.includes(body), path);
      assert.match(text, /Does mechanical work from a precise brief/, path);
    }
  });

  it('fails when an agent has no tier', () => {
    fresh();
    replaceIn(repo, '.agents/agents/builder.md', 'tier: mid\n', '');
    failsWith(/builder\.md: no tier/);
  });

  it('fails when an agent is on a tier it must not be on', () => {
    fresh();
    replaceIn(repo, '.agents/agents/reviewer.md', 'tier: high', 'tier: mid');
    failsWith(/reviewer\.md: tier is mid, it must be high/);
  });

  it('fails when a tier is unknown', () => {
    fresh();
    replaceIn(repo, '.agents/agents/builder.md', 'tier: mid', 'tier: medium');
    failsWith(/builder\.md: unknown tier medium/);
  });

  it('fails when one of the three agents is missing', () => {
    fresh();
    rmSync(join(repo, '.agents/agents/mechanic.md'));
    failsWith(/mechanic\.md: missing/);
  });

  it('fails when a tier lacks the model of a tool', () => {
    fresh();
    for (const [from, to, pattern] of [
      ['"claude": "sonnet",', '', /mid: no claude model/],
      [
        '"copilot": ["claude-sonnet-5.5", "Claude Sonnet 5.5 (copilot)"],',
        '',
        /mid: no copilot model/,
      ],
      ['"model": "gpt-5.6-terra", ', '', /mid: no codex model/],
      [', "effort": "medium"', '', /mid: no codex effort/],
    ]) {
      fresh();
      replaceIn(repo, '.agents/agents/tiers.json', from, to);
      failsWith(pattern);
    }
  });

  it('fails when a tool definition drifts from the tier table', () => {
    for (const [path, from, to, pattern] of [
      [
        '.claude/agents/builder.md',
        'model: sonnet',
        'model: opus',
        /\.claude\/agents\/builder\.md/,
      ],
      [
        '.github/agents/builder.agent.md',
        "'claude-sonnet-5.5'",
        "'claude-opus-5.5'",
        /\.github\/agents\/builder\.agent\.md/,
      ],
      [
        '.codex/agents/builder.toml',
        'gpt-5.6-terra',
        'gpt-6.1-sol',
        /\.codex\/agents\/builder\.toml/,
      ],
      [
        '.codex/agents/reviewer.toml',
        'model_reasoning_effort = "high"',
        'model_reasoning_effort = "low"',
        /\.codex\/agents\/reviewer\.toml/,
      ],
    ]) {
      fresh();
      replaceIn(repo, path, from, to);
      failsWith(pattern);
    }
  });

  it('fails when a tool definition is missing or left over without a source', () => {
    fresh();
    rmSync(join(repo, '.github/agents/reviewer.agent.md'));
    failsWith(/\.github\/agents\/reviewer\.agent\.md: missing/);

    fresh();
    write(repo, '.claude/agents/extra.md', 'x\n');
    failsWith(/\.claude\/agents\/extra\.md: no source/);
  });

  it('fails when the main Codex model is not the high tier', () => {
    fresh();
    replaceIn(repo, '.codex/config.toml', 'model = "gpt-6.1-sol"', 'model = "gpt-6-luna"');
    failsWith(/\.codex\/config\.toml: model is gpt-6-luna, the high tier is gpt-6\.1-sol/);
  });

  it('sync repairs drift and removes leftovers', () => {
    fresh();
    replaceIn(repo, '.claude/agents/builder.md', 'model: sonnet', 'model: opus');
    write(repo, '.codex/agents/extra.toml', 'x\n');
    sync();
    assert.equal(agents('check').status, 0);
    assert.ok(!existsSync(join(repo, '.codex/agents/extra.toml')));
  });
});

describe('codex-agent.sh', () => {
  let base;
  let repo;
  let worktree;
  let bin;
  let log;

  const git = (cwd, ...args) =>
    execFileSync(
      'git',
      ['-C', cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      { encoding: 'utf8' },
    ).trim();

  const run = (tier, dir, prompt = 'build the thing\n') => {
    write(base, 'prompt.md', prompt);
    const result = spawnSync(
      join(repo, 'scripts/codex-agent.sh'),
      [tier, dir, join(base, 'prompt.md')],
      {
        encoding: 'utf8',
        env: { ...process.env, CODEX_BIN: join(bin, 'codex'), FAKE_CODEX_LOG: log },
      },
    );
    const calls = existsSync(log) ? read(base, 'codex.log') : '';
    rmSync(log, { force: true });
    return { ...result, calls };
  };

  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'codex-agent-')));
    repo = join(base, 'repo');
    bin = join(base, 'bin');
    log = join(base, 'codex.log');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'codex'),
      '#!/usr/bin/env bash\n{ printf "ARG %s\\n" "$@"; echo "STDIN $(cat)"; } > "$FAKE_CODEX_LOG"\necho "fake final message"\n',
    );
    chmodSync(join(bin, 'codex'), 0o755);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo]);
    mkdirSync(join(repo, 'scripts'));
    mkdirSync(join(repo, '.agents/agents'), { recursive: true });
    cpSync(join(REPO, '.agents/agents/tiers.json'), join(repo, '.agents/agents/tiers.json'));
    for (const file of ['codex-agent.sh', '_lib.sh']) {
      cpSync(join(REPO, 'scripts', file), join(repo, 'scripts', file));
    }
    write(repo, 'README.md', 'test\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'chore: init');
    worktree = join(repo, '.worktrees/feature-1-x');
    git(repo, 'worktree', 'add', '--quiet', '-b', 'feature/1-x', worktree);
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  const args = (calls) =>
    calls
      .split('\n')
      .filter((line) => line.startsWith('ARG '))
      .map((line) => line.slice(4));
  const value = (list, flag) => list[list.indexOf(flag) + 1];

  it('starts the high tier on Sol, read-only, with the prompt on stdin', () => {
    const result = run('high', worktree);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'fake final message');
    const list = args(result.calls);
    assert.equal(list[0], 'exec');
    assert.equal(value(list, '-m'), 'gpt-6.1-sol');
    assert.ok(list.includes('model_reasoning_effort="high"'));
    assert.equal(value(list, '-C'), worktree);
    assert.equal(value(list, '-s'), 'read-only');
    assert.match(result.calls, /STDIN build the thing/);
  });

  it('starts the mid tier on Terra and the small tier on Luna', () => {
    for (const [tier, model, effort] of [
      ['mid', 'gpt-5.6-terra', 'medium'],
      ['small', 'gpt-6-luna', 'low'],
    ]) {
      const result = run(tier, worktree);
      assert.equal(result.status, 0, result.stderr);
      const list = args(result.calls);
      assert.equal(value(list, '-m'), model, tier);
      assert.ok(list.includes(`model_reasoning_effort="${effort}"`), tier);
    }
  });

  it("gives a committing tier in a worktree only that worktree's git dir and the branch storage", () => {
    const gitDir = join(repo, '.git/worktrees/feature-1-x');
    for (const tier of ['mid', 'small']) {
      const result = run(tier, worktree);
      const list = args(result.calls);
      assert.ok(!list.includes('-s'), `${tier} sets a sandbox mode next to the profile`);
      assert.ok(!list.includes('danger-full-access'), tier);
      assert.ok(!list.includes('--dangerously-bypass-approvals-and-sandbox'), tier);
      assert.ok(list.includes('default_permissions="agent"'), tier);
      const profile = list.find((arg) => arg.startsWith('permissions.agent='));
      assert.ok(profile?.includes('extends=":workspace"'), tier);
      for (const path of [
        gitDir,
        join(repo, '.git/objects'),
        join(repo, '.git/refs/heads'),
        join(repo, '.git/logs/refs/heads'),
      ]) {
        assert.ok(profile.includes(`"${path}"="write"`), `${tier}: ${path}`);
      }
      assert.ok(!profile.includes(`"${join(repo, '.git')}"=`), `${tier} gets the whole .git`);
      assert.ok(!profile.includes(`"${join(repo, '.git/hooks')}`), tier);
      assert.ok(!profile.includes(`"${join(repo, '.git/config')}`), tier);
    }
  });

  it('uses the plain workspace sandbox outside a linked worktree', () => {
    const list = args(run('mid', repo).calls);
    assert.equal(value(list, '-s'), 'workspace-write');
    assert.ok(!list.some((arg) => arg.startsWith('permissions.agent=')));
  });

  it('refuses an unknown tier, a missing folder and a missing prompt file', () => {
    assert.notEqual(run('medium', worktree).status, 0);
    assert.match(run('medium', worktree).stderr, /unknown tier/);
    assert.notEqual(run('mid', join(base, 'nowhere')).status, 0);
    const result = spawnSync(
      join(repo, 'scripts/codex-agent.sh'),
      ['mid', worktree, join(base, 'no.md')],
      {
        encoding: 'utf8',
        env: { ...process.env, CODEX_BIN: join(bin, 'codex'), FAKE_CODEX_LOG: log },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /prompt file/);
  });

  it('passes the failure of codex on', () => {
    writeFileSync(join(bin, 'codex'), '#!/usr/bin/env bash\ncat >/dev/null\nexit 3\n');
    chmodSync(join(bin, 'codex'), 0o755);
    assert.equal(run('mid', worktree).status, 3);
  });
});
