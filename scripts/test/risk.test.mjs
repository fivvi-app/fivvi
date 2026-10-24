import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
      'apps/ios/FivviPro/AuthView.swift',
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
      '.codex/config.toml',
      '.codex/agents/builder.toml',
      '.agents/agents/builder.md',
      '.claude/agents/builder.md',
      '.github/agents/builder.agent.md',
      'scripts/agents.sh',
      'scripts/codex-agent.sh',
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

  // ADR-021: these groups are agent-queueable ("high"); every other group is owner-only ("owner").
  const AGENT_QUEUE = ['auth', 'tenant-data', 'health-notes', 'dependencies', 'infrastructure'];

  for (const [group, files] of Object.entries(groups)) {
    const level = AGENT_QUEUE.includes(group) ? 'high' : 'owner';
    it(`is ${level} when it touches ${group}`, () => {
      for (const file of files) {
        const result = pr(['apps/web/src/lib/format.ts', file]);
        assert.equal(result.risk, level, file);
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

  it('ADR-021: is owner when one owner-only path is among agent-queueable ones, and lists all reasons', () => {
    assert.deepEqual(pr(['packages/api/src/auth/session.ts', 'AGENTS.md']), {
      risk: 'owner',
      reasons: [
        'packages/api/src/auth/session.ts: auth (*auth*)',
        'AGENTS.md: guardrails (/AGENTS.md)',
      ],
    });
  });

  // A path can match rules of several groups; the file is owner-only when any matching group is, so an agent-queueable
  // rule (a name with "auth" or "note") never hides an owner-only one.
  it('ADR-021: is owner when an owner-only path also matches an agent-queueable rule', () => {
    const overlaps = {
      'docs/decisions/ADR-007-authentication.md': ['auth', 'product-docs'],
      '.github/instructions/auth.instructions.md': ['auth', 'guardrails'],
      'scripts/auth-check.sh': ['auth', 'guardrails'],
      'docs/legal/release-notes.md': ['health-notes', 'legal'],
      '.agents/skills/notes/SKILL.md': ['health-notes', 'guardrails'],
      'packages/database/src/billing.ts': ['tenant-data', 'billing'],
    };
    for (const [file, groups] of Object.entries(overlaps)) {
      const result = pr([file]);
      assert.equal(result.risk, 'owner', file);
      assert.equal(result.reasons.length, groups.length, file);
      for (const group of groups) {
        assert.ok(
          result.reasons.some((r) => r.startsWith(`${file}: ${group} (`)),
          `${file}: ${group}`,
        );
      }
    }
  });

  it('ADR-021: a path matching two rules of one group gives one reason', () => {
    assert.deepEqual(pr(['packages/billing-payments/x.ts']).reasons, [
      'packages/billing-payments/x.ts: billing (*billing*)',
    ]);
  });

  it('ADR-021: is high with only agent-queueable reasons, whatever their number', () => {
    const result = pr(['packages/database/migrations/0003.sql', 'package.json', 'Dockerfile']);
    assert.equal(result.risk, 'high');
    assert.equal(result.reasons.length, 3);
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

  it('ADR-021: is owner when the ticket or its spec is labelled owner-only', () => {
    const labelled = pr(['apps/web/page.tsx'], [ticket({ labels: ['owner-only'] })]);
    assert.deepEqual(labelled, { risk: 'owner', reasons: ['#57 is labelled owner-only'] });
    const specLabelled = pr(
      ['apps/web/page.tsx'],
      [ticket({ parent: { number: 50, labels: ['spec', 'owner-only'] } })],
    );
    assert.deepEqual(specLabelled, {
      risk: 'owner',
      reasons: ['spec #50 of #57 is labelled owner-only'],
    });
  });

  it('ADR-021: owner-only wins over owner-merge, and both reasons are listed', () => {
    const result = pr(['apps/web/page.tsx'], [ticket({ labels: ['owner-merge', 'owner-only'] })]);
    assert.equal(result.risk, 'owner');
    assert.deepEqual(result.reasons, ['#57 is labelled owner-merge', '#57 is labelled owner-only']);
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
    assert.equal(result.stdout, 'owner\n  scripts/pr.sh: guardrails (/scripts)\n');
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

  it('ADR-021: prints high for a PR with only agent-queueable reasons', () => {
    const result = run(
      github({ files: [{ filename: 'packages/database/migrations/0004.sql' }] }),
      '60',
    );
    assert.equal(
      result.stdout,
      'high\n  packages/database/migrations/0004.sql: tenant-data (/packages/database)\n',
    );
  });

  it("ADR-021: reads the owner-only label from the PR's ticket and its spec", () => {
    const result = run(
      github({ files: [{ filename: 'apps/web/page.tsx' }], ticketLabels: ['owner-only'] }),
      '60',
      '--json',
    );
    assert.deepEqual(JSON.parse(result.stdout), {
      risk: 'owner',
      reasons: ['#57 is labelled owner-only'],
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
  const decide = (rules, files = ['apps/web/page.tsx']) =>
    spawnSync('jq', ['-c', '--arg', 'rules', rules, '-f', join(SCRIPTS, 'risk.jq')], {
      input: JSON.stringify({ files, issues: [] }),
      encoding: 'utf8',
    });

  it('ADR-021: the file declares exactly the agent-queueable groups, and every one has a path rule', () => {
    const text = readFileSync(join(SCRIPTS, 'high-risk-paths.txt'), 'utf8');
    const declared = [...text.matchAll(/^@agent-queue\s+(\S+)\s*(#.*)?$/gm)].map((m) => m[1]);
    assert.deepEqual(declared.sort(), [
      'auth',
      'dependencies',
      'health-notes',
      'infrastructure',
      'tenant-data',
    ]);
    const ruled = new Set([...text.matchAll(/^([a-z][a-z-]*)\s+\S+\s*(#.*)?$/gm)].map((m) => m[1]));
    for (const group of declared) assert.ok(ruled.has(group), `${group} has a path rule`);
  });

  it('ADR-021: a group is owner-only unless it is declared @agent-queue', () => {
    const rules = '@agent-queue docs\ndocs *.md\nsecret *.key\n';
    assert.equal(JSON.parse(decide(rules, ['a.md']).stdout).risk, 'high');
    assert.equal(JSON.parse(decide(rules, ['a.key']).stdout).risk, 'owner');
    assert.equal(JSON.parse(decide(rules, ['a.md', 'a.key']).stdout).risk, 'owner');
  });

  it('ADR-021: an @agent-queue group with no path rule is an error (fail closed)', () => {
    const result = decide('@agent-queue ghost\ndocs *.md\n');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /agent-queue group 'ghost' has no path rule/);
  });

  it('ADR-021: an @agent-queue line that is not exactly the directive and a group is an error', () => {
    for (const line of ['@agent-queue', '@agent-queue a b', '@agent-que auth', '@auth *auth*']) {
      const result = decide(`${line}\nauth *auth*\n`);
      assert.notEqual(result.status, 0, line);
      assert.match(result.stderr, /malformed rule/, line);
    }
  });

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
