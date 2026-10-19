// E002 #120: no personal or work email address in commits or files. The guard is an allowlist, so these tests use
// only example.com, *.test and GitHub noreply addresses.
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
import { dirname, join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const SCRIPTS = join(import.meta.dirname, '..');
const ROOT = join(SCRIPTS, '..');

const NOREPLY = '42+octocat@users.noreply.github.com';
const COPILOT = 'Copilot <223556219+Copilot@users.noreply.github.com>';
// Addresses outside the allowlist are built from parts, so this file itself passes `emails.sh files`.
const addr = (local, domain) => `${local}@${domain}`;
const OTHER = addr('dev', 'work.example.com');
const STRANGER = addr('pat', 'work.example.org');

// A temporary repo with this repo's scripts and hook, a base commit on main (origin/main) and a feature branch.
const makeRepo = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'emails-')));
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Octo',
        GIT_AUTHOR_EMAIL: NOREPLY,
        GIT_COMMITTER_NAME: 'Octo',
        GIT_COMMITTER_EMAIL: NOREPLY,
      },
    }).trim();
  const run = (args, options = {}) =>
    spawnSync(join(dir, 'scripts/emails.sh'), args, { cwd: dir, encoding: 'utf8', ...options });
  const write = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', dir]);
  cpSync(SCRIPTS, join(dir, 'scripts'), { recursive: true });
  cpSync(join(ROOT, '.githooks'), join(dir, '.githooks'), { recursive: true });
  git('add', '.');
  git('commit', '--quiet', '-m', 'chore(E002): base');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '--quiet', '-b', 'chore/120-emails');
  return { dir, git, run, write };
};

// Commits (or amends, with `amend`) as the given author and committer; returns git's result, hooks included.
const tryCommitAs = (
  repo,
  { author = NOREPLY, committer = NOREPLY, message = 'chore(E002): change', amend = false },
) =>
  spawnSync(
    'git',
    [
      '-C',
      repo.dir,
      'commit',
      '--quiet',
      '--allow-empty',
      ...(amend ? ['--no-edit'] : ['-m', message]),
      ...(amend ? ['--amend'] : []),
      `--author=A <${author}>`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GIT_COMMITTER_NAME: 'C', GIT_COMMITTER_EMAIL: committer },
    },
  );
const commitAs = (repo, options) => {
  const result = tryCommitAs(repo, options);
  assert.equal(result.status, 0, result.stderr);
};

describe('E002 #120 emails.sh commits (the commits of origin/main..HEAD)', () => {
  let repo;
  beforeEach(() => {
    repo = makeRepo();
  });
  afterEach(() => rmSync(repo.dir, { recursive: true, force: true }));

  it('passes when author, committer and Co-authored-by are GitHub noreply addresses', () => {
    commitAs(repo, { message: `chore(E002): change\n\nCo-authored-by: ${COPILOT}` });
    commitAs(repo, { author: 'noreply@github.com', committer: 'noreply@github.com' });
    const result = repo.run(['commits']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('passes on a branch with no commits of its own', () => {
    assert.equal(repo.run(['commits']).status, 0);
  });

  for (const [role, options] of [
    ['author', { author: OTHER }],
    ['committer', { committer: OTHER }],
    ['Co-authored-by', { message: `chore(E002): change\n\nCo-authored-by: Pat <${OTHER}>` }],
    ['Co-authored-by', { message: `chore(E002): change\n\nco-authored-by: Pat <${OTHER}>` }],
  ]) {
    it(`fails on a ${role} that is not a noreply address, naming the commit and the fix but not the address`, () => {
      commitAs(repo, options);
      const sha = repo.git('rev-parse', '--short', 'HEAD');
      const result = repo.run(['commits']);
      const output = result.stdout + result.stderr;
      assert.equal(result.status, 1, output);
      assert.match(output, new RegExp(`${sha}.*${role}`));
      assert.match(
        output,
        /git config --local user\.email <id>\+<login>@users\.noreply\.github\.com/,
      );
      assert.doesNotMatch(output, /work\.example\.com/);
    });
  }

  it('looks only at origin/main..HEAD: a commit already on main is out of scope', () => {
    commitAs(repo, { author: OTHER });
    repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    commitAs(repo, {});
    assert.equal(repo.run(['commits']).status, 0);
  });

  it('checks a merge commit of origin/main made locally, not the main commits it brings in', () => {
    repo.git('checkout', '--quiet', 'main');
    commitAs(repo, { author: OTHER, committer: OTHER });
    repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    repo.git('checkout', '--quiet', 'chore/120-emails');
    commitAs(repo, {});
    repo.git('merge', '--no-ff', '--no-edit', 'origin/main');
    assert.equal(repo.run(['commits']).status, 0);

    commitAs(repo, { author: OTHER, amend: true });
    const result = repo.run(['commits']);
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /author/);
  });

  it('fails with a hint, instead of passing, when origin/main does not exist', () => {
    repo.git('update-ref', '-d', 'refs/remotes/origin/main');
    const result = repo.run(['commits']);
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 1, output);
    assert.match(output, /origin\/main not found.*git fetch origin/);
    assert.doesNotMatch(output, /fatal/);
  });

  it('is checked by scripts/check.sh next to the commit messages', () => {
    const check = readFileSync(join(SCRIPTS, 'check.sh'), 'utf8');
    assert.match(check, /^check "commit messages" commit_messages$/m);
    assert.match(check, /^check "commit emails" /m);
    assert.match(check, /^check "file emails" /m);
  });
});

describe('E002 #120 emails.sh files (tracked and new files)', () => {
  let repo;
  beforeEach(() => {
    repo = makeRepo();
  });
  afterEach(() => rmSync(repo.dir, { recursive: true, force: true }));

  it('passes for example and test domains, service endpoints and noreply addresses', () => {
    repo.write(
      'docs/ok.md',
      [
        'anna@example.com, naam@voorbeeld.nl, a@mail.test, b@x.invalid',
        `${NOREPLY} noreply@github.com`,
        'https://key@o1.ingest.de.sentry.io/1 postgres://u:p@db.railway.internal:5432/x',
        'smtp-relay.mailin.fr user@smtp-relay.mailin.fr',
        'npm package@1.2.3 and @types/node',
      ].join('\n'),
    );
    repo.git('add', '.');
    const result = repo.run(['files']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it('fails on an address outside the allowlist, in a tracked file, naming file and line but not the address', () => {
    repo.write('docs/notes.md', `one\ntwo: reach me at ${STRANGER}\n`);
    repo.git('add', '.');
    repo.git('commit', '--quiet', '-m', 'docs(E002): notes');
    const result = repo.run(['files']);
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 1, output);
    assert.match(output, /docs\/notes\.md:2/);
    assert.match(output, /scripts\/email-allowlist\.txt/);
    assert.doesNotMatch(output, /pat@|work\.example\.org/);
    assert.ok(!output.includes(STRANGER));
  });

  it('also fails on a new file that is not tracked yet, but not on an ignored one', () => {
    repo.write('.gitignore', 'ignored/\n');
    repo.write('ignored/x.txt', STRANGER);
    repo.write('new.txt', STRANGER);
    const result = repo.run(['files']);
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /new\.txt:1/);
    assert.doesNotMatch(result.stdout + result.stderr, /ignored/);
  });

  it('matches the domain exactly: a subdomain of example.com or a look-alike is not allowed', () => {
    repo.write('a.txt', addr('x', 'mail.example.com'));
    repo.write('b.txt', addr('x', 'example.com.evil.org'));
    repo.write('c.txt', addr('x', 'notexample.com'));
    const output = repo.run(['files']);
    assert.equal(output.status, 1);
    for (const file of ['a.txt:1', 'b.txt:1', 'c.txt:1']) {
      assert.match(output.stdout + output.stderr, new RegExp(file));
    }
  });

  it('does not take retina asset names such as icon@2x.png for addresses', () => {
    repo.write('a.txt', 'icon@2x.png logo@3x.webp');
    assert.equal(repo.run(['files']).status, 0);
    repo.write('b.txt', addr('icon', '2x.png.evil.org'));
    assert.equal(repo.run(['files']).status, 1);
  });

  it('still checks an address on a domain that looks like a retina name', () => {
    repo.write('a.txt', addr('x', '2x.com'));
    const result = repo.run(['files']);
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /a\.txt:1/);
  });

  it('matches the paths of the allowlist as written, not lower-cased', () => {
    repo.write('Docs/Notes.TXT', STRANGER);
    assert.equal(repo.run(['files']).status, 1);
    writeFileSync(join(repo.dir, 'scripts/email-allowlist.txt'), '\npath: Docs/Notes.TXT\n', {
      flag: 'a',
    });
    assert.equal(repo.run(['files']).status, 0);
  });

  it('is case-insensitive', () => {
    repo.write('a.txt', 'X@EXAMPLE.COM and Y@Users.Noreply.GitHub.com');
    assert.equal(repo.run(['files']).status, 0);
  });

  it('skips the paths the allowlist excludes', () => {
    repo.write('pnpm-lock.yaml', `contact ${STRANGER}`);
    assert.equal(repo.run(['files']).status, 0);
  });

  it('takes the allowlist from the one versioned file', () => {
    repo.write('a.txt', addr('x', 'corp.example.net'));
    assert.equal(repo.run(['files']).status, 1);
    writeFileSync(
      join(repo.dir, 'scripts/email-allowlist.txt'),
      '# test list\ncorp.example.net\n',
      { flag: 'a' },
    );
    assert.equal(repo.run(['files']).status, 0);
  });

  it('finds no address outside the allowlist in the tracked files of this repo', () => {
    // A copy of the tracked files only, so a developer's scratch files cannot fail the test.
    const copy = realpathSync(mkdtempSync(join(tmpdir(), 'emails-tracked-')));
    try {
      const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' })
        .split('\0')
        .filter((path) => path && existsSync(join(ROOT, path)));
      for (const path of tracked) {
        cpSync(join(ROOT, path), join(copy, path), { recursive: true, verbatimSymlinks: true });
      }
      execFileSync('git', ['init', '--quiet', copy]);
      const result = spawnSync(join(copy, 'scripts/emails.sh'), ['files'], {
        cwd: copy,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe('E002 #120 .githooks/commit-msg email check', () => {
  let repo;
  beforeEach(() => {
    repo = makeRepo();
    repo.git('config', 'core.hooksPath', '.githooks');
  });
  afterEach(() => rmSync(repo.dir, { recursive: true, force: true }));

  const commit = (message, options = {}) => tryCommitAs(repo, { message, ...options });

  it('accepts a commit with noreply addresses', () => {
    const result = commit(`feat(E002): guard\n\nCo-authored-by: ${COPILOT}`);
    assert.equal(result.status, 0, result.stderr);
  });

  for (const [what, message, options] of [
    ['author', 'feat(E002): guard', { author: OTHER }],
    ['committer', 'feat(E002): guard', { committer: OTHER }],
    ['Co-authored-by', `feat(E002): guard\n\nCo-authored-by: Pat <${OTHER}>`, {}],
  ]) {
    it(`rejects a commit whose ${what} is not a noreply address, without naming it`, () => {
      const before = repo.git('rev-parse', 'HEAD');
      const result = commit(message, options);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /git config --local user\.email/);
      assert.match(result.stderr, new RegExp(what));
      assert.doesNotMatch(result.stderr, /work\.example\.com/);
      assert.equal(repo.git('rev-parse', 'HEAD'), before);
    });
  }

  it('also checks a merge commit, whose subject the message check skips', () => {
    const result = commit('Merge branch main', { author: OTHER });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /author/);
  });

  it('still rejects a message that is not a Conventional Commit', () => {
    const result = commit('add a thing');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Conventional Commit/);
  });
});

describe('E002 #120 emails.sh identity (scripts/bootstrap.sh sets the noreply user.email)', () => {
  const gh = fakeGh();
  let repo;
  beforeEach(() => {
    repo = makeRepo();
  });
  afterEach(() => rmSync(repo.dir, { recursive: true, force: true }));
  after(() => gh.cleanup());

  const identity = (rules = [{ match: '^api user', out: { id: 42, login: 'octocat' } }]) =>
    repo.run(['identity'], { env: gh.env(rules) });
  const localEmail = () =>
    spawnSync('git', ['-C', repo.dir, 'config', '--local', 'user.email'], {
      encoding: 'utf8',
    }).stdout.trim();

  it('sets the noreply address of the gh user when user.email is unset', () => {
    const result = identity();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(localEmail(), NOREPLY);
  });

  it('replaces a local address that is not a noreply address, without printing it', () => {
    repo.git('config', '--local', 'user.email', OTHER);
    const result = identity();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(localEmail(), NOREPLY);
    assert.doesNotMatch(result.stdout + result.stderr, /work\.example\.com/);
  });

  it('leaves a noreply address alone and does not call gh', () => {
    repo.git('config', '--local', 'user.email', '7+someone@users.noreply.github.com');
    const result = identity();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(localEmail(), '7+someone@users.noreply.github.com');
    assert.deepEqual(gh.calls(), []);
  });

  it('fails with a hint when gh cannot tell the user, and leaves user.email as it was', () => {
    repo.git('config', '--local', 'user.email', OTHER);
    const result = identity([{ match: '^api user', status: 1 }]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /gh auth login/);
    assert.match(result.stderr, /git config --local user\.email/);
    assert.equal(localEmail(), OTHER);
  });

  it('is run by bootstrap.sh', () => {
    assert.match(readFileSync(join(SCRIPTS, 'bootstrap.sh'), 'utf8'), /emails\.sh" identity/);
  });
});
