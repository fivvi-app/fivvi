import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const SCRIPTS = join(import.meta.dirname, '..');
const lib = (expression) =>
  execFileSync('bash', ['-c', `source "${SCRIPTS}/_lib.sh"; ${expression}`], {
    encoding: 'utf8',
  }).trim();
const succeeds = (expression) =>
  spawnSync('bash', ['-c', `source "${SCRIPTS}/_lib.sh"; ${expression}`]).status === 0;

describe('naming rules', () => {
  it('accepts ticket and plain branches, rejects others', () => {
    for (const name of [
      'feature/57-hold-a-spot',
      'fix/12-hold-expiry',
      'chore/ci-cache',
      'docs/roadmap',
    ]) {
      assert.ok(succeeds(`is_branch_name ${name}`), name);
    }
    for (const name of ['feature/F031-open-gym', 'feat/57-x', 'feature/57_Hold', 'main']) {
      assert.ok(!succeeds(`is_branch_name ${name}`), name);
    }
  });

  it('reads the issue number from a ticket branch', () => {
    assert.equal(lib('branch_issue feature/57-hold-a-spot'), '57');
    assert.equal(lib('branch_issue docs/roadmap'), '');
  });

  it('accepts Conventional Commits with an ID scope', () => {
    for (const subject of [
      'feat(F031): hold a spot',
      'fix: keep the hold',
      'docs(E006): record the check',
      'feat!: drop v0',
    ]) {
      assert.ok(succeeds(`is_conventional "${subject}"`), subject);
    }
    for (const subject of [
      'Add a thing',
      'feat:missing space',
      'feature(F031): wrong type',
      `feat: ${'x'.repeat(100)}`,
    ]) {
      assert.ok(!succeeds(`is_conventional "${subject}"`), subject);
    }
  });

  it('turns issue titles into branch slugs', () => {
    assert.equal(
      lib('slugify "[F031] Hold a spot while verifying!"'),
      'hold-a-spot-while-verifying',
    );
  });

  it('gives each worktree a stable e2e port, and the main checkout 3100', () => {
    const port = Number(lib('e2e_port /tmp/a'));
    assert.equal(Number(lib('e2e_port /tmp/a')), port);
    assert.ok(port >= 3200 && port < 3900);
    assert.equal(lib('e2e_port "$MAIN_ROOT"'), '3100');
  });
});

describe('iOS toolchain (_ios.sh)', () => {
  it('fails loudly when DEVELOPER_DIR is set but not a usable Xcode, instead of using another Xcode', () => {
    const result = spawnSync(
      'bash',
      [
        '-c',
        `source "${SCRIPTS}/_lib.sh"; source "${SCRIPTS}/_ios.sh"; use_xcode; echo "status=$? dir=$DEVELOPER_DIR"`,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, DEVELOPER_DIR: '/nonexistent/Xcode_0.0.app/Contents/Developer' },
      },
    );
    assert.match(
      result.stdout,
      /status=1 dir=\/nonexistent\/Xcode_0\.0\.app\/Contents\/Developer$/m,
    );
    assert.match(
      result.stderr,
      /DEVELOPER_DIR=\/nonexistent\/Xcode_0\.0\.app\/Contents\/Developer is not a usable Xcode/,
    );
  });
});

describe('CI path filters (ci.yml)', () => {
  // The `decide ios` filter of the "Detect changes" job, as the ERE that grep -E runs.
  const iosFilter = () => {
    const ci = readFileSync(join(SCRIPTS, '../.github/workflows/ci.yml'), 'utf8');
    const filter = ci.match(/^ +decide ios apps\/ios '([^']+)'$/m)?.[1];
    assert.ok(filter, 'ci.yml has no `decide ios` filter');
    return new RegExp(filter);
  };

  it('E008 AC9: the iOS job runs for the app and its generated inputs, including the Swift design tokens', () => {
    const ios = iosFilter();
    for (const path of [
      'apps/ios/TrainerHub/Hello/HelloView.swift',
      'packages/contract/swift/Sources/TrainerHubAPI/Generated/Client.swift',
      'packages/i18n/generated/ios/Localizable.xcstrings',
      'packages/design-tokens/TrainerHubDesignTokens/Package.swift',
      'packages/design-tokens/TrainerHubDesignTokens/Sources/TrainerHubDesignTokens/Generated/Colors.swift',
      'scripts/test-ios.sh',
      '.github/workflows/ci.yml',
    ]) {
      assert.match(path, ios, path);
    }
    for (const path of [
      'docs/product/FEATURES.md',
      'packages/design-tokens/generated/web/tokens.css',
      'packages/design-tokens/kotlin/generated/nl/trainerhub/designtokens/Colors.kt',
      'packages/i18n/generated/android/values/strings.xml',
    ]) {
      assert.doesNotMatch(path, ios, path);
    }
  });
});

describe('usage', () => {
  it('prints the commands of every script, never its code', () => {
    for (const script of ['flow', 'issue', 'wt', 'pr', 'skills', 'risk', 'github-settings']) {
      const result = spawnSync(join(SCRIPTS, `${script}.sh`), [], { encoding: 'utf8' });
      assert.equal(result.status, 1, script);
      assert.match(result.stderr, new RegExp(`${script}\\.sh [\\w<]`), script);
      assert.doesNotMatch(result.stderr, /set -euo|source /, script);
    }
  });
});

describe('commit-msg hook', () => {
  const hook = join(SCRIPTS, '../.githooks/commit-msg');
  const run = (message) => {
    const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
    const file = join(dir, 'MSG');
    writeFileSync(file, `${message}\n\n# comment\n`);
    const result = spawnSync(hook, [file], { cwd: SCRIPTS, encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
    return result;
  };

  it('accepts Conventional Commits and merges, rejects the rest', () => {
    assert.equal(run('feat(F031): hold a spot').status, 0);
    assert.equal(run('Merge branch main').status, 0);
    const bad = run('Hold a spot');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Conventional Commit/);
  });
});

describe('wt.sh done', () => {
  let base;
  let repo;
  let bin;

  const git = (cwd, ...args) =>
    execFileSync(
      'git',
      ['-C', cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      {
        encoding: 'utf8',
      },
    ).trim();

  const fakeGh = (state, headRefOid) => {
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env bash\necho '${JSON.stringify([{ number: 60, state, headRefOid }])}' | jq -r "\${@: -1}"\n`,
    );
    chmodSync(join(bin, 'gh'), 0o755);
  };
  const done = (...args) =>
    spawnSync(join(repo, 'scripts/wt.sh'), ['done', 'feature/57-hold', ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });

  before(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'wt-done-')));
    const origin = join(base, 'origin.git');
    repo = join(base, 'repo');
    bin = join(base, 'bin');
    mkdirSync(bin);
    execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', origin]);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo]);
    cpSync(SCRIPTS, join(repo, 'scripts'), { recursive: true });
    writeFileSync(join(repo, 'README.md'), 'test\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '--quiet', '-m', 'chore: init');
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '--quiet', '-u', 'origin', 'main');
    git(
      repo,
      'worktree',
      'add',
      '--quiet',
      '-b',
      'feature/57-hold',
      join(repo, '.worktrees/feature-57-hold'),
    );
    writeFileSync(join(repo, '.worktrees/feature-57-hold/hold.txt'), 'hold\n');
    git(join(repo, '.worktrees/feature-57-hold'), 'add', '.');
    git(join(repo, '.worktrees/feature-57-hold'), 'commit', '--quiet', '-m', 'feat(F031): hold');
    git(
      join(repo, '.worktrees/feature-57-hold'),
      'push',
      '--quiet',
      '-u',
      'origin',
      'feature/57-hold',
    );
  });

  after(() => rmSync(base, { recursive: true, force: true }));

  it('refuses while the PR is not merged', () => {
    fakeGh('OPEN', git(repo, 'rev-parse', 'feature/57-hold'));
    const result = done();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /PR #60 is OPEN, not merged/);
  });

  it('refuses when the local branch has commits that are not in the PR', () => {
    fakeGh('MERGED', git(repo, 'rev-parse', 'main'));
    const result = done();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /commits that are not in PR #60/);
  });

  it('accepts a local branch that is behind the PR head (GitHub updated the branch)', () => {
    const worktree = join(repo, '.worktrees/feature-57-hold');
    writeFileSync(join(worktree, 'update.txt'), 'merged main in on GitHub\n');
    git(worktree, 'add', '.');
    git(worktree, 'commit', '--quiet', '-m', 'chore: update branch');
    git(worktree, 'push', '--quiet', 'origin', 'feature/57-hold');
    const prHead = git(worktree, 'rev-parse', 'HEAD');
    git(worktree, 'reset', '--quiet', '--hard', 'HEAD~1');
    fakeGh('MERGED', prHead);
    const result = done('--check');
    assert.equal(result.status, 0, result.stderr);
    git(worktree, 'reset', '--quiet', '--hard', prHead);
  });

  it('removes the worktree and both branches once merged', () => {
    fakeGh('MERGED', git(repo, 'rev-parse', 'feature/57-hold'));
    assert.equal(done('--check').status, 0);
    assert.ok(existsSync(join(repo, '.worktrees/feature-57-hold')), '--check changes nothing');

    const result = done();
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(repo, '.worktrees/feature-57-hold')));
    assert.equal(git(repo, 'branch', '--list', 'feature/57-hold'), '');
    assert.equal(git(repo, 'ls-remote', '--heads', 'origin', 'feature/57-hold'), '');
  });
});
