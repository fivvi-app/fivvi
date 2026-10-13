import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const SCRIPTS = join(import.meta.dirname, '..');
const HEAD = 'c'.repeat(40);
const CI = ['Detect changes', 'Checks (Linux)', 'E2E (Linux)', 'iOS', 'Android'];

const NO_PREVIEW = `**Railway preview smoke check:** on \`${HEAD}\`: no preview for this PR (it touches no Railway watch pattern).`;
const threads = (nodes, hasNextPage = false) => ({
  data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage }, nodes } } } },
});

const github = ({ files = ['apps/web/page.tsx'], body, behind = 0 } = {}) => [
  { match: '^pr list ', out: [{ number: 60 }] },
  { match: '^api repos/[^ ]+/pulls/60/files', out: files.map((filename) => ({ filename })) },
  {
    match: '^pr view 60 .*--json headRefName,closingIssuesReferences',
    out: {
      headRefName: 'feature/57-hold-a-spot',
      closingIssuesReferences: [{ number: 57 }],
      changedFiles: files.length,
    },
  },
  {
    match: '^pr view 60 ',
    out: {
      number: 60,
      state: 'OPEN',
      isDraft: false,
      baseRefName: 'main',
      headRefName: 'feature/57-hold-a-spot',
      headRefOid: HEAD,
      body:
        body ??
        `Closes #57\n\n**Self-review:** standards and spec reviewers clean on \`${HEAD}\` ✅\n\n${NO_PREVIEW}`,
      statusCheckRollup: CI.map((name) => ({
        __typename: 'CheckRun',
        name,
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
      })),
    },
  },
  { match: '^issue view 57 ', out: { number: 57, labels: [], parent: null } },
  { match: '^api repos/[^ ]+/compare/main\\.\\.\\.', out: { behind_by: behind } },
  { match: '^api graphql ', out: threads([]) },
  { match: '^pr edit 60 ', out: '' },
  { match: '^pr merge 60 ', out: '' },
  { match: '^api --method DELETE ', out: '' },
];

describe('pr.sh merge', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const merge = (rules) => {
    const result = spawnSync(join(SCRIPTS, 'pr.sh'), ['merge'], {
      encoding: 'utf8',
      env: gh.env(rules),
    });
    const bodies = gh
      .calls()
      .filter((call) => call.args[1] === 'edit')
      .map((call) => call.args[call.args.indexOf('--body') + 1]);
    return { ...result, bodies, calls: gh.calls().map((call) => call.args.join(' ')) };
  };

  it('squash-merges the head commit and deletes the branch when every condition holds', () => {
    const result = merge(github());
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /✓ low-risk/);
    assert.ok(
      result.calls.some((call) =>
        new RegExp(`^pr merge 60 .*--squash --match-head-commit ${HEAD}`).test(call),
      ),
      result.calls.join('\n'),
    );
    assert.ok(
      result.calls.some((call) =>
        /^api --method DELETE repos\/[^ ]+\/git\/refs\/heads\/feature\/57-hold-a-spot$/.test(call),
      ),
    );
    assert.match(result.stdout, /scripts\/flow\.sh finish 57/);
  });

  it('merges nothing and says why when a condition fails', () => {
    const result = merge(github({ files: ['packages/database/migrations/0004.sql'], body: '' }));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /✗ low-risk: high-risk: packages\/database\/migrations\/0004\.sql/);
    assert.match(result.stdout, /✗ self-review clean: no self-review record/);
    assert.match(result.stderr, /PR #60 stays for the owner: low-risk, self-review clean/);
    assert.ok(!result.calls.some((call) => /^pr merge|--method DELETE/.test(call)));
  });

  it('records the refusal and its reasons for the head commit, so the owner decides', () => {
    const result = merge(github({ body: `Closes #57\n\n${NO_PREVIEW}` }));
    assert.equal(result.status, 1);
    assert.deepEqual(result.bodies, [
      `Closes #57\n\n${NO_PREVIEW}\n\n**Merge gate:** refused on \`${HEAD}\`: self-review clean (no self-review record in the PR body)`,
    ]);
  });

  it('records no refusal when the branch is only behind main: merge main and run it again', () => {
    const result = merge(github({ behind: 2 }));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /behind main: merge origin\/main/);
    assert.deepEqual(result.bodies, []);
    assert.ok(!result.calls.some((call) => /^pr merge|--method DELETE/.test(call)));
  });

  const refuses = (rules, reason) => {
    const result = merge(rules);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, reason);
    assert.match(result.stderr, /nothing merged/);
    assert.ok(!result.calls.some((call) => /^pr merge|--method DELETE|^pr edit/.test(call)));
  };

  it("merges nothing when the PR's risk can't be read", () => {
    for (const match of ['^api repos/[^ ]+/pulls/60/files', '^issue view 57 ']) {
      refuses([{ match, out: '', status: 1 }, ...github()], /could not decide the risk of PR #60/);
    }
  });

  it("merges nothing when the review threads can't all be read", () => {
    refuses(
      [{ match: '^api graphql ', out: '', status: 1 }, ...github()],
      /could not read the review threads/,
    );
    refuses(
      [{ match: '^api graphql ', out: threads([], true) }, ...github()],
      /more than 100 review threads/,
    );
  });

  it('merges nothing when GitHub lists fewer files than the PR changes', () => {
    const rules = github();
    rules[2].out.changedFiles = 3001;
    refuses(rules, /could not decide the risk of PR #60/);
  });

  it("merges nothing when it can't tell whether the branch is behind main", () => {
    refuses(
      [{ match: '^api repos/[^ ]+/compare/', out: '', status: 1 }, ...github()],
      /could not compare/,
    );
  });
});

describe('pr.sh reviewed', () => {
  const gh = fakeGh();
  let repo;
  const git = (...args) =>
    execFileSync(
      'git',
      ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      {
        encoding: 'utf8',
      },
    ).trim();

  before(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'pr-reviewed-')));
    execFileSync('git', ['init', '--quiet', '--initial-branch=feature/57-hold-a-spot', repo]);
    cpSync(SCRIPTS, join(repo, 'scripts'), { recursive: true });
    git('add', '.');
    git('commit', '--quiet', '-m', 'feat(F031): hold a spot');
    git('remote', 'add', 'origin', 'https://github.com/example/trainer-hub.git');
  });
  after(() => {
    gh.cleanup();
    rmSync(repo, { recursive: true, force: true });
  });

  const OLD_RECORD = `**Self-review:** standards and spec reviewers clean on \`${'b'.repeat(40)}\` ✅`;
  const reviewed = (prHead, body = { out: { body: `Closes #57\n\n${OLD_RECORD}` } }) => {
    const result = spawnSync(join(repo, 'scripts/pr.sh'), ['reviewed'], {
      cwd: repo,
      encoding: 'utf8',
      env: gh.env([
        { match: '^pr list ', out: [{ number: 60 }] },
        { match: '^pr view 60 .*--json headRefOid', out: { headRefOid: prHead } },
        { match: '^pr view 60 .*--json body', ...body },
        { match: '^pr edit 60 ', out: '' },
      ]),
    });
    const edits = gh.calls().filter((call) => call.args[1] === 'edit');
    const bodies = edits.map((call) => call.args[call.args.indexOf('--body') + 1]);
    return { ...result, edits, bodies };
  };

  it('replaces the record with one for the head commit', () => {
    const head = git('rev-parse', 'HEAD');
    const result = reviewed(head);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.bodies, [
      `Closes #57\n\n**Self-review:** standards and spec reviewers clean on \`${head}\` ✅`,
    ]);
  });

  it('writes only the record when the body held nothing else', () => {
    const head = git('rev-parse', 'HEAD');
    const result = reviewed(head, { out: { body: OLD_RECORD } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.bodies, [
      `**Self-review:** standards and spec reviewers clean on \`${head}\` ✅`,
    ]);
  });

  it("leaves the body alone when it can't read it", () => {
    const result = reviewed(git('rev-parse', 'HEAD'), { out: '', status: 1 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not read the body of PR #60/);
    assert.deepEqual(result.edits, []);
  });

  it('refuses when the local commit is not the PR head', () => {
    const result = reviewed('d'.repeat(40));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is not the PR head ddddddd/);
    assert.deepEqual(result.edits, []);
  });
});

describe('pr.sh smoke', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const smoke = (checks) => {
    const result = spawnSync(join(SCRIPTS, 'pr.sh'), ['smoke'], {
      encoding: 'utf8',
      env: gh.env([
        { match: '^pr list ', out: [{ number: 60 }] },
        { match: '^pr view 60 .*--json headRefOid', out: { headRefOid: HEAD } },
        { match: '^pr checks 60 ', ...checks },
        { match: '^pr view 60 .*--json body', out: { body: 'Closes #57' } },
        { match: '^pr edit 60 ', out: '' },
      ]),
    });
    const bodies = gh
      .calls()
      .filter((call) => call.args[1] === 'edit')
      .map((call) => call.args[call.args.indexOf('--body') + 1]);
    return { ...result, bodies };
  };

  it('records that the PR has no preview when no check is the preview', () => {
    const result = smoke({ out: [{ name: 'Detect changes' }, { name: 'Checks (Linux)' }] });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.bodies, [`Closes #57\n\n${NO_PREVIEW}`]);
  });

  it("records nothing when it can't read the checks", () => {
    const result = smoke({ out: '', status: 1 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not read the checks of PR #60/);
    assert.deepEqual(result.bodies, []);
  });
});

describe('pr.sh refusal', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const refusal = (rule) =>
    spawnSync(join(SCRIPTS, 'pr.sh'), ['refusal', '60'], {
      encoding: 'utf8',
      env: gh.env([{ match: '^pr view 60 .*--json body', ...rule }]),
    });

  it('prints the last refusal of the merge gate with its commit and reasons', () => {
    const old = `**Merge gate:** refused on \`${'b'.repeat(40)}\`: up to date (2 commits behind main)`;
    const last = `**Merge gate:** refused on \`${HEAD}\`: self-review clean (no self-review record in the PR body)`;
    const result = refusal({ out: { body: `Closes #57\r\n\r\n${old}\n\n${last}` } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      sha: HEAD,
      reasons: 'self-review clean (no self-review record in the PR body)',
    });
  });

  it('prints null without a refusal, and fails when it cannot read the PR', () => {
    assert.equal(refusal({ out: { body: 'Closes #57' } }).stdout, 'null\n');
    const failed = refusal({ out: '', status: 1 });
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '');
    assert.match(failed.stderr, /could not read the body of PR #60/);
  });
});
