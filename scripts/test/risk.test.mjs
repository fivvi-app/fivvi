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
        'docs/engineering/ENVIRONMENTS.md',
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
      // E011 (spec #145, AC19): the access middleware and helper, the startup check of the app role, the
      // isolation suite and the test database's role setup.
      'packages/api/src/access.ts',
      'packages/api/src/startup.ts',
      'apps/web/server/database.ts',
      'apps/web/server/startup.ts',
      'packages/api/test/isolation/suite.ts',
      'packages/api/test/isolation/routes.integration.test.ts',
      'packages/testing/src/database-server.ts',
      'packages/testing/src/database-setup.ts',
    ],
    'health-notes': ['packages/domain/src/notes/visibility.ts', 'apps/android/NoteScreen.kt'],
    legal: ['docs/legal/privacy-policy.nl.md'],
    billing: ['packages/domain/src/billing/plan.ts', 'apps/web/src/payments/checkout.tsx'],
    'product-docs': ['docs/product/FEATURES.md', 'docs/decisions/ADR-016-agent-merges.md'],
    // Core, owner-only (spec #292): the rules agents work by, the agent definitions, hooks, CI and the files that
    // decide risk, the merge gate, phases and labels (ADR-021: agents never loosen their own rules).
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
      'docs/agents/build.md',
      'docs/agents/issue-tracker.md',
      'docs/agents/triage-labels.md',
      'docs/engineering/WORKFLOW.md',
      'apps/AGENTS.md',
      'packages/api/CLAUDE.md',
      // The scripts that decide risk, gates, phases, labels, issues, PRs, checks, agent definitions, GitHub settings
      // and allowlists, with their tests: everything in scripts/ that is not a tooling script below.
      'scripts/agents.sh',
      'scripts/codex-agent.sh',
      'scripts/high-risk-paths.txt',
      'scripts/risk.jq',
      'scripts/risk.sh',
      'scripts/status-only.jq',
      'scripts/merge-gate.jq',
      'scripts/flow-phase.jq',
      'scripts/records.jq',
      'scripts/pr.sh',
      'scripts/flow.sh',
      'scripts/issue.sh',
      'scripts/check.sh',
      'scripts/github-settings.sh',
      'scripts/email-allowlist.txt',
      'scripts/secrets-allowlist.txt',
      'scripts/secret-files-allowlist.txt',
      'scripts/native-jobs.sh',
      'scripts/_lib.sh',
      'scripts/new-script-nobody-listed.sh',
      'scripts/test/risk.test.mjs',
      'scripts/test/pr.test.mjs',
      'scripts/test/fake-gh.mjs',
      // What chooses which checks run: the root package.json (also a dependency), turbo.json at every depth.
      'turbo.json',
      'packages/contract/turbo.json',
      // The files that skip tests: Xcode test plans and schemes, and the iOS skip list.
      'apps/ios/FivviPro.xctestplan',
      'apps/ios/Other/Deep.xctestplan',
      'FivviPro.xctestplan',
      'apps/ios/FivviProUITests/Support/TestPlanSkips.swift',
      'apps/ios/FivviPro.xcodeproj/xcshareddata/xcschemes/FivviPro.xcscheme',
      'apps/ios/Other.xcscheme',
    ],
    // Tooling, agent-queueable (spec #292): configs and checks that agents change with their feature work.
    tooling: [
      // The rules agents work by and the files that define the checks (ADR-021: agents never loosen their own rules).
      'biome.json',
      '.shellcheckrc',
      // Check-defining files at any depth or in their own folder: a nested biome.json loads the i18n lint rule.
      'apps/web/biome.json',
      'packages/i18n/lint/no-hard-coded-jsx-text.grit',
      'docs/engineering/TESTING.md',
      'vitest.config.ts',
      'apps/web/vitest.config.ts',
      'packages/api/vitest.config.mts',
      'tsconfig.base.json',
      // The rest of what defines a check: a nested turbo.json overrides inputs, the shared vitest preset, the
      // integration configs, the Playwright config, the CLIs that pick the checks, the native lint rules, every
      // tsconfig.
      'apps/web/vitest.integration.config.ts',
      'packages/testing/vitest.integration.config.ts',
      'packages/testing/src/vitest.ts',
      'playwright.config.ts',
      'apps/web/playwright.config.ts',
      'packages/i18n/src/cli.ts',
      'apps/android/lint/build.gradle.kts',
      'apps/android/lint/src/main/kotlin/Rule.kt',
      'apps/ios/lint/fixtures/LiteralText.swift',
      '.swiftlint.yml',
      'apps/ios/.swiftlint.yml',
      'tsconfig.json',
      'apps/web/tsconfig.json',
      'tsconfig.build.json',
      'apps/web/tsconfig.base.json',
      'biome.jsonc',
      'packages/ui/biome.jsonc',
      // What can switch a check off or hide drift: the parity check itself, test-skip files, drift checks, lint
      // rules, the Android lint wiring and the global setup of a test folder.
      'packages/i18n/src/tools/checks.ts',
      'packages/i18n/src/tools/icu.ts',
      'packages/contract/scripts/check.ts',
      'packages/design-tokens/src/check.ts',
      'packages/design-tokens/src/cli.ts',
      'packages/design-tokens/src/contrast.ts',
      'packages/contract/scripts/pipeline.ts',
      'packages/ui/lint/no-raw-colours.ts',
      'packages/ui/lint/cli.ts',
      // The import rule that keeps packages/api away from tables and database handles (E011, AC17).
      'packages/api/lint/repository-only-imports.grit',
      'apps/android/build.gradle.kts',
      'apps/android/app/build.gradle.kts',
      'apps/android/settings.gradle.kts',
      'e2e/maestro/config.yaml',
      '.editorconfig',
      'apps/android/.editorconfig',
      'apps/web/test/global-setup.ts',
      'packages/api/test/global-setup.ts',
      'packages/testing/test/global-setup.ts',
      // The native, release and asset helper scripts in scripts/ and their tests (carved out of the core /scripts
      // rule by @except lines in the risk list).
      'scripts/release.sh',
      'scripts/release-ios.sh',
      'scripts/release-android.sh',
      'scripts/release-secrets.sh',
      'scripts/play-publish.mjs',
      'scripts/app-icon.mjs',
      'scripts/_ios.sh',
      'scripts/_android.sh',
      'scripts/android.sh',
      'scripts/ios-device.sh',
      'scripts/maestro.sh',
      'scripts/test-ios.sh',
      'scripts/test/release.test.mjs',
      'scripts/test/release-android.test.mjs',
      'scripts/test/release-secrets.test.mjs',
      'scripts/test/app-icon.test.mjs',
      'scripts/test/app-ids.test.mjs',
    ],
    dependencies: [
      'apps/web/package.json',
      'packages/api/package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      // Native dependency manifests, at any depth (ADR-021): Gradle's version catalog and wrapper, Swift's lock file.
      'apps/android/gradle/libs.versions.toml',
      'libs.versions.toml',
      'apps/android/gradle/wrapper/gradle-wrapper.properties',
      'gradle-wrapper.properties',
      'apps/ios/FivviPro.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
      'packages/contract/tools/swift-generator/Package.resolved',
      'Package.resolved',
    ],
    infrastructure: ['Dockerfile', 'apps/cron/Dockerfile.cron', '.railway/railway.ts'],
  };

  // ADR-021, spec #292: these groups are agent-queueable ("high"); every other group is owner-only ("owner").
  const AGENT_QUEUE = [
    'auth',
    'tenant-data',
    'health-notes',
    'dependencies',
    'infrastructure',
    'billing',
    'tooling',
  ];

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

  it('ADR-021: the root package.json defines the checks, so it is owner-only; other package.json files stay dependencies', () => {
    const root = pr(['package.json']);
    assert.equal(root.risk, 'owner');
    assert.deepEqual(root.reasons, [
      'package.json: guardrails (/package.json)',
      'package.json: dependencies (package.json)',
    ]);
    assert.deepEqual(pr(['apps/web/package.json']), {
      risk: 'high',
      reasons: ['apps/web/package.json: dependencies (package.json)'],
    });
  });

  it('anchors root paths: a nested folder with the same name is not a guardrail', () => {
    assert.equal(
      pr([
        'packages/email/scripts/preview.ts',
        'apps/web/docs/product.md',
        'apps/web/.npmrc',
        'examples/pnpm-workspace.yaml',
        'docs/engineering/ENVIRONMENTS.md',
        'packages/i18n/src/lint.ts',
        'packages/i18n/linting/x.ts',
        'apps/web/src/vitest-setup.ts',
        'apps/web/vitest.configuration.ts',
        'apps/web/src/vitest.ts',
        'packages/testing/src/database.ts',
        // E011's paths are the named files and folder only (AC19): a neighbour of them stays low.
        'packages/api/src/accessibility.ts',
        'apps/web/server/startup.test.ts',
        'apps/web/server/databases.ts',
        'packages/api/server/database.ts',
        'packages/api/src/routes/me.ts',
        'packages/api/test/isolations/x.ts',
        'packages/api/test/access.test.ts',
        'apps/web/packages/api/src/access.ts',
        'packages/testing/src/database-server.test.ts',
        'packages/testing/src/vitest.test.ts',
        'packages/i18n/src/locale.ts',
        'apps/web/src/cli.ts',
        'apps/web/playwright-report/index.html',
        'apps/web/src/playwright.ts',
        'apps/android/app/lint-baseline.xml',
        'apps/android/linting/Rule.kt',
        'apps/ios/linting/Rule.swift',
        'apps/web/src/swiftlint.yml.ts',
        'apps/web/src/tsconfig-paths.ts',
        'apps/web/src/biome.ts',
        'docs/agents-overview.md',
        'apps/web/docs/agents/x.md',
        // Other source inside packages, test helpers included, stays low (ADR-021 decision 1): only the named check
        // scripts, the configs and the files that skip a check are guarded.
        'packages/i18n/src/tools.ts',
        'packages/i18n/src/toolsets/x.ts',
        'apps/web/packages/i18n/src/tools/x.ts',
        'apps/ios/FivviProUITests/Support/Fixtures.swift',
        'apps/ios/FivviProUITests/TestPlanSkipsTests.swift',
        'apps/ios/FivviPro.xctestplan.md',
        'apps/ios/xctestplan.swift',
        'packages/contract/scripts/generate.ts',
        'packages/contract/src/check.ts',
        'packages/design-tokens/src/build.ts',
        'packages/design-tokens/scripts/check.ts',
        'packages/design-tokens/src/cli.test.ts',
        'packages/design-tokens/src/native.ts',
        'packages/design-tokens/src/source.ts',
        'packages/design-tokens/src/contrast.test.ts',
        'packages/design-tokens/tokens/contrast-pairs.json',
        'packages/contract/scripts/pipeline.test.ts',
        'packages/contract/src/pipeline.ts',
        'apps/android/gradle/libs.versions.toml.md',
        'apps/android/gradle/libs.toml',
        'apps/android/gradle/wrapper/gradle-wrapper.jar',
        'apps/android/gradle.properties',
        'apps/ios/Package.swift',
        'apps/ios/Package.resolved.md',
        'apps/ios/Package.resolvedx',
        'packages/ui/src/lint.ts',
        'packages/ui/linting/x.ts',
        'apps/android/build.gradle',
        'apps/android/app/settings.gradle.kts',
        'e2e/maestro/flows/sign-in.yaml',
        'e2e/maestro/config.yml',
        'e2e/config.yaml',
        'apps/web/e2e/maestro/config.yaml',
        'apps/ios/FivviPro.xcodeproj/project.pbxproj',
        'apps/ios/FivviPro.xcscheme.md',
        'apps/android/editorconfig.md',
        'apps/web/.editorconfig-checker.json',
        'apps/web/src/global-setup.ts',
        'apps/web/latest/global-setup.ts',
        'apps/web/test/global-setup.test.ts',
        'apps/web/test/setup.ts',
        'packages/testing/test/database.ts',
        'packages/testing/src/global-setup.ts',
      ]).risk,
      'low',
    );
  });

  it('ADR-021: GLOSSARY.md, packages/i18n/GLOSSARY.md and DESIGN.md are low with no reasons', () => {
    assert.deepEqual(pr(['GLOSSARY.md', 'packages/i18n/GLOSSARY.md', 'DESIGN.md']), {
      risk: 'low',
      reasons: [],
    });
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
        'AGENTS.md: guardrails (AGENTS.md)',
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
      'docs/legal/billing-terms.md': ['legal', 'billing'],
      'docs/product/payments-plan.md': ['product-docs', 'billing'],
      '.github/workflows/billing.yml': ['guardrails', 'billing'],
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

  it('spec #292: the Dockerfile check is tooling, and infrastructure too by its name: high', () => {
    const result = pr(['scripts/test/dockerfile.test.mjs']);
    assert.equal(result.risk, 'high');
    assert.equal(result.reasons.length, 2);
  });

  it('spec #292: a new script in scripts/ is core until the list moves it: owner-only', () => {
    for (const file of [
      'scripts/new-helper.sh',
      'scripts/release.mjs',
      'scripts/test/new-helper.test.mjs',
    ]) {
      assert.deepEqual(
        pr([file]),
        { risk: 'owner', reasons: [`${file}: guardrails (/scripts)`] },
        file,
      );
    }
    assert.deepEqual(pr(['scripts/release-ios.sh']), {
      risk: 'high',
      reasons: ['scripts/release-ios.sh: tooling (/scripts/release*.sh)'],
    });
  });

  it('spec #292: billing and tooling are agent-queueable together with the other agent-queueable groups', () => {
    const result = pr([
      'packages/domain/src/billing/plan.ts',
      'apps/web/vitest.config.ts',
      'Dockerfile',
    ]);
    assert.equal(result.risk, 'high');
    assert.equal(result.reasons.length, 3);
  });

  it('spec #292: a core path next to tooling or billing paths makes the PR owner-only', () => {
    for (const core of ['scripts/pr.sh', 'docs/legal/dpa.md', 'AGENTS.md']) {
      const result = pr(['apps/web/vitest.config.ts', 'apps/web/src/payments/checkout.tsx', core]);
      assert.equal(result.risk, 'owner', core);
      assert.equal(result.reasons.length, 3, core);
    }
  });

  it('ADR-021: a path matching two rules of one group gives one reason', () => {
    assert.deepEqual(pr(['packages/billing-payments/x.ts']).reasons, [
      'packages/billing-payments/x.ts: billing (*billing*)',
    ]);
  });

  it('ADR-021: is high with only agent-queueable reasons, whatever their number', () => {
    const result = pr([
      'packages/database/migrations/0003.sql',
      'apps/web/package.json',
      'Dockerfile',
    ]);
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

  it('matches the owner-merge and owner-only labels whatever their case', () => {
    assert.equal(pr(['apps/web/page.tsx'], [ticket({ labels: ['Owner-Only'] })]).risk, 'owner');
    assert.equal(pr(['apps/web/page.tsx'], [ticket({ labels: ['OWNER-MERGE'] })]).risk, 'high');
    const spec = ticket({ parent: { number: 50, labels: ['spec', 'Owner-Only'] } });
    assert.equal(pr(['apps/web/page.tsx'], [spec]).risk, 'owner');
  });

  it('is an error, never a verdict, when the labels of an issue or its spec are not a list', () => {
    for (const labels of [null, 'owner-only', { name: 'owner-only' }, 7]) {
      for (const issue of [
        ticket({ labels }),
        ticket({ parent: { number: 50, labels } }),
        { number: 57, parent: null },
      ]) {
        assert.throws(() => pr(['apps/web/page.tsx'], [issue]), /labels/, JSON.stringify(issue));
      }
    }
  });

  it('is low without a linked issue when no path is high-risk', () => {
    assert.equal(pr(['apps/web/page.tsx'], []).risk, 'low');
  });
});

describe('spec #292: status-only changes to ROADMAP.md and FEATURES.md', () => {
  const ROADMAP = 'docs/product/ROADMAP.md';
  const FEATURES = 'docs/product/FEATURES.md';
  const tick = '@@ -5,4 +5,4 @@\n \n - **Owner setup:**\n-  - [ ] Set it\n+  - [x] Set it\n ';
  const forward = [
    '@@ -3,3 +3,3 @@',
    ' | ID | Feature | Status | Priority | Milestone | Depends on | NL | EN | Spec |',
    ' |---|---|---|---|---|---|---|---|---|',
    '-| F002 | Workspaces | PLANNED | Must | M2 | F001 | ⬜ | ⬜ | §5 |',
    '+| F002 | Workspaces | IN PROGRESS | Must | M2 | F001 | ⬜ | ⬜ | §5 |',
  ].join('\n');
  const wording = '@@ -5,3 +5,3 @@\n \n-Goal: a.\n+Goal: b.\n ';
  const withPatches = (files, patches) => classify({ files, issues: [ticket()], patches });

  it('AC1: drops the product-docs reason of a ROADMAP.md that only ticks boxes', () => {
    assert.deepEqual(withPatches([ROADMAP], { [ROADMAP]: tick }), { risk: 'low', reasons: [] });
  });

  it('AC3: drops the product-docs reason of a FEATURES.md that only moves a status forward', () => {
    assert.deepEqual(withPatches([FEATURES], { [FEATURES]: forward }), {
      risk: 'low',
      reasons: [],
    });
  });

  it('AC2, AC4: keeps it owner-only for any other change to either file', () => {
    for (const [file, patch] of [
      [ROADMAP, wording],
      [
        ROADMAP,
        tick.replace('-  - [ ] Set it\n+  - [x] Set it', '-  - [x] Set it\n+  - [ ] Set it'),
      ],
      [FEATURES, forward.replace('IN PROGRESS | Must', 'IN PROGRESS | Should')],
      [FEATURES, wording],
      // A tick in the wrong file is not status-only there.
      [FEATURES, tick],
    ]) {
      const result = withPatches([file], { [file]: patch });
      assert.equal(result.risk, 'owner', file);
      assert.deepEqual(result.reasons, [`${file}: product-docs (/docs/product)`], file);
    }
  });

  it('AC5: fails closed when the patch is missing, empty, null or truncated', () => {
    for (const patches of [
      undefined,
      {},
      { [ROADMAP]: null },
      { [ROADMAP]: '' },
      { [ROADMAP]: tick.split('\n').slice(0, -2).join('\n') },
      { 'docs/product/OTHER.md': tick },
    ]) {
      const result = withPatches([ROADMAP], patches);
      assert.equal(result.risk, 'owner', JSON.stringify(patches));
    }
  });

  it('only the two files qualify: PRODUCT.md and decisions stay owner-only whatever the patches say', () => {
    for (const file of [
      'docs/product/PRODUCT.md',
      'docs/decisions/ADR-021-agents-queue-high-risk.md',
    ]) {
      assert.equal(withPatches([file], { [file]: tick }).risk, 'owner', file);
    }
  });

  it('every other path of the PR still decides its own risk', () => {
    const ticked = { [ROADMAP]: tick, [FEATURES]: forward };
    assert.deepEqual(withPatches([ROADMAP, FEATURES, 'scripts/pr.sh'], ticked), {
      risk: 'owner',
      reasons: ['scripts/pr.sh: guardrails (/scripts)'],
    });
    assert.deepEqual(withPatches([ROADMAP, 'apps/web/vitest.config.ts'], ticked), {
      risk: 'high',
      reasons: ['apps/web/vitest.config.ts: tooling (vitest*.config.*)'],
    });
    // One status-only file and one that is not: only the second keeps its reason.
    assert.deepEqual(withPatches([ROADMAP, FEATURES], { [ROADMAP]: tick, [FEATURES]: wording }), {
      risk: 'owner',
      reasons: [`${FEATURES}: product-docs (/docs/product)`],
    });
  });

  it('the labels of the ticket and its spec still count', () => {
    const labelled = classify({
      files: [ROADMAP],
      issues: [ticket({ labels: ['owner-only'] })],
      patches: { [ROADMAP]: tick },
    });
    assert.deepEqual(labelled, { risk: 'owner', reasons: ['#57 is labelled owner-only'] });
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

  describe('spec #292: reads the patch of ROADMAP.md and FEATURES.md from the files API', () => {
    const tick = '@@ -5,4 +5,4 @@\n \n - **Owner setup:**\n-  - [ ] Set it\n+  - [x] Set it\n ';
    const changed = (filename, patch, extra = {}) => ({
      filename,
      status: 'modified',
      patch,
      ...extra,
    });
    const verdict = (files) => JSON.parse(run(github({ files }), '60', '--json').stdout);

    it('AC1: a PR that only ticks a roadmap box is low', () => {
      assert.deepEqual(verdict([changed('docs/product/ROADMAP.md', tick)]), {
        risk: 'low',
        reasons: [],
      });
    });

    it('AC2: a roadmap change that is more than a tick stays owner-only', () => {
      const wording = '@@ -5,3 +5,3 @@\n \n-Goal: a.\n+Goal: b.\n ';
      assert.deepEqual(verdict([changed('docs/product/ROADMAP.md', wording)]), {
        risk: 'owner',
        reasons: ['docs/product/ROADMAP.md: product-docs (/docs/product)'],
      });
    });

    it('AC5: the files API leaves the patch out of a large diff: owner-only', () => {
      for (const file of [
        { filename: 'docs/product/ROADMAP.md', status: 'modified' },
        changed('docs/product/ROADMAP.md', tick.split('\n').slice(0, -2).join('\n')),
        changed('docs/product/FEATURES.md', ''),
      ]) {
        assert.equal(verdict([file]).risk, 'owner', JSON.stringify(file));
      }
    });

    it('a renamed, added or removed file is not a status change, whatever its patch', () => {
      for (const status of ['added', 'removed', 'renamed']) {
        const file = changed('docs/product/ROADMAP.md', tick, { status });
        assert.equal(verdict([file]).risk, 'owner', status);
      }
      // The old path of a rename counts too: it carries no patch of its own.
      const moved = verdict([
        changed('docs/ROADMAP.md', tick, {
          status: 'renamed',
          previous_filename: 'docs/product/ROADMAP.md',
        }),
      ]);
      assert.equal(moved.risk, 'owner');
      assert.deepEqual(moved.reasons, ['docs/product/ROADMAP.md: product-docs (/docs/product)']);
    });

    it('keeps the other paths of the PR deciding their own risk', () => {
      assert.deepEqual(
        verdict([changed('docs/product/ROADMAP.md', tick), { filename: 'scripts/pr.sh' }]),
        {
          risk: 'owner',
          reasons: ['scripts/pr.sh: guardrails (/scripts)'],
        },
      );
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
      'billing',
      'dependencies',
      'health-notes',
      'infrastructure',
      'tenant-data',
      'tooling',
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

  it('spec #292: the core groups are not declared @agent-queue', () => {
    const text = readFileSync(join(SCRIPTS, 'high-risk-paths.txt'), 'utf8');
    for (const group of ['guardrails', 'legal', 'product-docs']) {
      assert.doesNotMatch(text, new RegExp(`^@agent-queue\\s+${group}\\b`, 'm'), group);
    }
  });

  it('spec #292: the header says the @agent-queue lines end at pilot setup, and the billing line earlier with a live key', () => {
    const text = readFileSync(join(SCRIPTS, 'high-risk-paths.txt'), 'utf8');
    const header = text.slice(0, text.indexOf('@agent-queue auth'));
    assert.match(header, /end at pilot setup/);
    assert.match(header, /billing/);
    assert.match(header, /live payment-provider key/);
    assert.doesNotMatch(header, /end at Gate G2/);
  });

  it('spec #292: @except removes the files it matches from the rules of one group only', () => {
    const rules = [
      '@agent-queue tooling',
      'core /scripts',
      '@except core /scripts/release*.sh',
      'tooling /scripts/release*.sh',
      'core *.sh',
    ].join('\n');
    const result = JSON.parse(decide(rules, ['scripts/release-ios.sh']).stdout);
    // Carved out of /scripts, but still matched by the other core rule `*.sh`: the carve-out applies to no rule
    // after it either, so the whole group is skipped for the file.
    assert.deepEqual(result, {
      risk: 'high',
      reasons: ['scripts/release-ios.sh: tooling (/scripts/release*.sh)'],
    });
    assert.equal(JSON.parse(decide(rules, ['scripts/pr.sh']).stdout).risk, 'owner');
    assert.equal(JSON.parse(decide(rules, ['scripts/release-ios.md']).stdout).risk, 'owner');
  });

  it('spec #292: a path carved out of a group and matched by no other rule is low', () => {
    const rules = 'core /scripts\n@except core /scripts/free.sh\n';
    assert.equal(JSON.parse(decide(rules, ['scripts/free.sh']).stdout).risk, 'low');
  });

  it('spec #292: an @except line that is not exactly the directive, a group and a pattern is an error', () => {
    for (const line of ['@except', '@except core', '@except core a b', '@except @core a']) {
      const result = decide(`${line}\ncore /scripts\n`);
      assert.notEqual(result.status, 0, line);
      assert.match(result.stderr, /malformed rule/, line);
    }
  });

  it('spec #292: an @except for a group with no path rule is an error (fail closed)', () => {
    const result = decide('@except ghost /x\ncore /scripts\n');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /@except group 'ghost' has no path rule/);
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
