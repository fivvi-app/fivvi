import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fakeGh } from './fake-gh.mjs';

const SCRIPTS = join(import.meta.dirname, '..');

const classify = (facts) =>
  JSON.parse(
    execFileSync(
      'jq',
      [
        '-c',
        '--rawfile',
        'rules',
        join(SCRIPTS, 'high-risk-paths.txt'),
        '-f',
        join(SCRIPTS, 'risk.jq'),
      ],
      { input: JSON.stringify(facts), encoding: 'utf8' },
    ),
  );

const ticket = (overrides = {}) => ({
  number: 57,
  labels: ['ready-for-agent'],
  parent: { number: 50, labels: ['spec', 'spec-approved'] },
  ...overrides,
});

const pr = (files, issues = [ticket()]) => classify({ files, issues });

describe('risk of a pull request', () => {
  it('is low for app code, tests and engineering docs under an unlabelled ticket', () => {
    assert.deepEqual(
      pr([
        'apps/web/src/app/[locale]/page.tsx',
        'packages/api/src/routes/health.ts',
        'packages/i18n/nl-NL.json',
        'docs/engineering/TESTING.md',
        'README.md',
      ]),
      { risk: 'low', reasons: [] },
    );
  });

  const groups = {
    auth: [
      'packages/api/src/auth/session.ts',
      'apps/web/src/app/api/auth/[...all]/route.ts',
      'apps/ios/TrainerHub/AuthView.swift',
    ],
    'tenant-data': [
      'packages/database/src/schema/organizations.ts',
      'packages/database/migrations/0003_rls.sql',
    ],
    'health-notes': ['packages/domain/src/notes/visibility.ts', 'apps/android/NoteScreen.kt'],
    legal: ['docs/legal/privacy-policy.nl.md'],
    billing: ['packages/domain/src/billing/plan.ts', 'apps/web/src/payments/checkout.tsx'],
    'product-docs': ['docs/product/FEATURES.md', 'docs/decisions/ADR-016-agent-merges.md'],
    guardrails: [
      'AGENTS.md',
      'CLAUDE.md',
      'CODING_STANDARDS.md',
      '.agents/skills/work/SKILL.md',
      '.claude/settings.json',
      '.github/workflows/ci.yml',
      '.githooks/commit-msg',
      'scripts/high-risk-paths.txt',
    ],
    dependencies: [
      'package.json',
      'apps/web/package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
    ],
    infrastructure: ['Dockerfile', 'apps/cron/Dockerfile.cron', '.railway/railway.ts'],
  };

  for (const [group, files] of Object.entries(groups)) {
    it(`is high when it touches ${group}`, () => {
      for (const file of files) {
        const result = pr(['apps/web/src/lib/format.ts', file]);
        assert.equal(result.risk, 'high', file);
        assert.equal(result.reasons.length, 1, file);
        assert.match(
          result.reasons[0],
          new RegExp(`^${file.replace(/[.[\]]/g, '\\$&')}: ${group} \\(`),
        );
      }
    });
  }

  it('anchors root paths: a nested folder with the same name is not a guardrail', () => {
    assert.equal(
      pr([
        'packages/email/scripts/preview.ts',
        'apps/web/docs/product.md',
        'apps/web/.npmrc',
        'examples/pnpm-workspace.yaml',
      ]).risk,
      'low',
    );
  });

  it('lists every high-risk file with the rule it matched', () => {
    assert.deepEqual(pr(['scripts/pr.sh', 'docs/legal/dpa.md', 'apps/web/page.tsx']).reasons, [
      'scripts/pr.sh: guardrails (/scripts)',
      'docs/legal/dpa.md: legal (/docs/legal)',
    ]);
  });

  it('is high when the ticket or its spec is labelled owner-merge', () => {
    const labelled = pr(['apps/web/page.tsx'], [ticket({ labels: ['owner-merge'] })]);
    assert.deepEqual(labelled, { risk: 'high', reasons: ['#57 is labelled owner-merge'] });
    const specLabelled = pr(
      ['apps/web/page.tsx'],
      [ticket({ parent: { number: 50, labels: ['spec', 'owner-merge'] } })],
    );
    assert.deepEqual(specLabelled, {
      risk: 'high',
      reasons: ['spec #50 of #57 is labelled owner-merge'],
    });
  });

  it('is low without a linked issue when no path is high-risk', () => {
    assert.equal(pr(['apps/web/page.tsx'], []).risk, 'low');
  });
});

describe('risk.sh', () => {
  const gh = fakeGh();
  after(() => gh.cleanup());

  const run = (rules, ...args) =>
    spawnSync(join(SCRIPTS, 'risk.sh'), args, { encoding: 'utf8', env: gh.env(rules) });

  const github = ({
    files,
    changedFiles = files.length,
    ticketLabels = [],
    specLabels = ['spec'],
  }) => [
    { match: '^api repos/[^ ]+/pulls/60/files', out: files },
    {
      match: '^pr view 60 ',
      out: {
        headRefName: 'feature/57-hold-a-spot',
        closingIssuesReferences: [{ number: 57 }],
        changedFiles,
      },
    },
    {
      match: '^issue view 57 ',
      out: { number: 57, labels: ticketLabels.map((name) => ({ name })), parent: { number: 50 } },
    },
    {
      match: '^issue view 50 ',
      out: { number: 50, labels: specLabels.map((name) => ({ name })), parent: null },
    },
  ];

  it('counts the old path of a renamed file, so moving a guardrail out is high-risk', () => {
    const result = run(
      github({
        files: [{ filename: 'tools/pr.sh', previous_filename: 'scripts/pr.sh', status: 'renamed' }],
      }),
      '60',
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'high\n  scripts/pr.sh: guardrails (/scripts)\n');
  });

  it("reads the owner-merge label from the PR's ticket and its spec", () => {
    const result = run(
      github({ files: [{ filename: 'apps/web/page.tsx' }], specLabels: ['spec', 'owner-merge'] }),
      '60',
      '--json',
    );
    assert.deepEqual(JSON.parse(result.stdout), {
      risk: 'high',
      reasons: ['spec #50 of #57 is labelled owner-merge'],
    });
  });

  it('prints low for a PR without high-risk paths or labels', () => {
    const result = run(github({ files: [{ filename: 'apps/web/page.tsx' }] }), '60');
    assert.equal(result.stdout, 'low\n');
  });

  it('fails without a verdict when GitHub lists fewer files than the PR changes', () => {
    // The files API stops at 3000 files; a file it leaves out could be high-risk.
    const rules = github({ files: [{ filename: 'apps/web/page.tsx' }], changedFiles: 3001 });
    const result = run(rules, '60');
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /PR #60 changes 3001 files, but only 1 could be read/);
  });

  const failing = {
    'the changed files': '^api repos/[^ ]+/pulls/60/files',
    'the linked issues': '^pr view 60 ',
    "the ticket's labels": '^issue view 57 ',
    "the spec's labels": '^issue view 50 ',
  };
  for (const [what, match] of Object.entries(failing)) {
    it(`fails without a verdict when it can't read ${what}`, () => {
      const rules = [
        { match, out: '', status: 1 },
        ...github({ files: [{ filename: 'apps/web/page.tsx' }] }),
      ];
      for (const args of [['60'], ['60', '--json']]) {
        const result = run(rules, ...args);
        assert.notEqual(result.status, 0, what);
        assert.equal(result.stdout, '', what);
        assert.match(result.stderr, /^error: /m, what);
      }
    });
  }
});

describe('high-risk paths', () => {
  it('is an error when a rule line does not have exactly a group and a pattern', () => {
    for (const line of ['dependencies', 'dependencies package.json extra']) {
      const result = spawnSync(
        'jq',
        ['-c', '--arg', 'rules', `${line}\n`, '-f', join(SCRIPTS, 'risk.jq')],
        { input: JSON.stringify({ files: ['apps/web/page.tsx'], issues: [] }), encoding: 'utf8' },
      );
      assert.notEqual(result.status, 0, line);
      assert.match(result.stderr, /malformed rule/, line);
    }
  });
});
