import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const GATE_JQ = join(import.meta.dirname, '../merge-gate.jq');

// scripts/pr.sh passes these; the gate has no copy of them.
const MARKS = [
  ['review_mark', 'Self-review'],
  ['smoke_mark', 'Railway preview smoke check'],
  ['no_preview', 'no preview for this PR'],
].flatMap(([name, value]) => ['--arg', name, value]);

const gate = (facts) =>
  JSON.parse(
    execFileSync('jq', ['-c', ...MARKS, '-f', GATE_JQ], {
      input: JSON.stringify(facts),
      encoding: 'utf8',
    }),
  );

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const REQUIRED = ['Detect changes', 'Checks (Linux)', 'E2E (Linux)', 'iOS', 'Android'];

const run = (name, conclusion = 'SUCCESS', status = 'COMPLETED') => ({
  __typename: 'CheckRun',
  name,
  status,
  conclusion: status === 'COMPLETED' ? conclusion : '',
});
const status = (context, state) => ({ __typename: 'StatusContext', context, state });

const reviewed = (sha = HEAD) =>
  `**Self-review:** standards and spec reviewers clean on \`${sha}\` ✅`;
const noPreview = (sha = HEAD) =>
  `**Railway preview smoke check:** on \`${sha}\`: no preview for this PR (it touches no Railway watch pattern).`;
const smoked = (sha = HEAD) =>
  `**Railway preview smoke check:** on \`${sha}\`: \`curl -fsS https://web-fivvi-pr-60.up.railway.app/api/v1/health\` → \`{"status":"ok"}\` ✅`;

const facts = (overrides = {}) => ({
  head: HEAD,
  default_branch: 'main',
  pr: {
    number: 60,
    state: 'OPEN',
    draft: false,
    base: 'main',
    body: `Closes #57\n\n${reviewed()}\n\n${noPreview()}`,
  },
  risk: { risk: 'low', reasons: [] },
  required: REQUIRED,
  checks: [
    run('Detect changes'),
    run('Checks (Linux)'),
    run('E2E (Linux)'),
    run('iOS', 'SKIPPED'),
    run('Android', 'SKIPPED'),
    run('GitGuardian Security Checks'),
  ],
  preview: 'no',
  queue_removed: false,
  threads: 0,
  ...overrides,
});
const withPr = (pr) => facts({ pr: { ...facts().pr, ...pr } });

const failed = (decision) => decision.conditions.filter((c) => !c.ok).map((c) => c.name);

describe('merge gate', () => {
  it('merges a low-risk, green, self-reviewed PR without a preview', () => {
    const decision = gate(facts());
    assert.equal(decision.merge, true);
    assert.deepEqual(failed(decision), []);
    assert.deepEqual(
      decision.conditions.map((c) => c.name),
      [
        'not owner-only',
        'checks passed',
        'self-review clean',
        'preview smoke-checked',
        'no open threads',
        'ready for review',
        'not removed from the queue',
      ],
    );
  });

  it('keeps an owner-only PR for the owner, with the reasons', () => {
    const decision = gate(
      facts({ risk: { risk: 'owner', reasons: ['scripts/pr.sh: guardrails (/scripts)'] } }),
    );
    assert.equal(decision.merge, false);
    assert.deepEqual(failed(decision), ['not owner-only']);
    assert.match(decision.conditions[0].detail, /owner-only: scripts\/pr\.sh: guardrails/);
  });

  it('ADR-021: merges an agent-queueable high-risk PR when every other condition holds', () => {
    const decision = gate(
      facts({
        risk: { risk: 'high', reasons: ['packages/database/migrations/0004.sql: tenant-data'] },
      }),
    );
    assert.equal(decision.merge, true);
    assert.deepEqual(failed(decision), []);
    assert.match(decision.conditions[0].detail, /high-risk.*migrations\/0004\.sql/);
  });

  it('spec #292: merges a high-risk tooling or billing PR when every other condition holds', () => {
    for (const reasons of [
      ['apps/web/vitest.config.ts: tooling (vitest*.config.*)'],
      [
        'scripts/release-ios.sh: tooling (/scripts/release*.sh)',
        'docs/engineering/TESTING.md: tooling (/docs/engineering/TESTING.md)',
      ],
      ['packages/domain/src/billing/plan.ts: billing (*billing*)'],
      [
        'apps/web/src/payments/checkout.tsx: billing (*payment*)',
        'apps/web/vitest.config.ts: tooling (vitest*.config.*)',
      ],
    ]) {
      const decision = gate(facts({ risk: { risk: 'high', reasons } }));
      assert.equal(decision.merge, true, reasons.join('; '));
      assert.deepEqual(failed(decision), []);
      assert.equal(decision.conditions[0].name, 'not owner-only');
      assert.match(decision.conditions[0].detail, /^high-risk, agent-queueable: /);
    }
  });

  it('spec #292: still keeps a PR for the owner when a core reason sits next to tooling or billing ones', () => {
    const decision = gate(
      facts({
        risk: {
          risk: 'owner',
          reasons: [
            'apps/web/vitest.config.ts: tooling (vitest*.config.*)',
            'scripts/pr.sh: guardrails (/scripts)',
          ],
        },
      }),
    );
    assert.equal(decision.merge, false);
    assert.deepEqual(failed(decision), ['not owner-only']);
  });

  it('ADR-021: a high-risk PR still fails every other condition', () => {
    const high = { risk: 'high', reasons: ['package.json: dependencies (package.json)'] };
    assert.deepEqual(failed(gate(facts({ risk: high, threads: 2 }))), ['no open threads']);
    assert.deepEqual(failed(gate(facts({ risk: high, queue_removed: true }))), [
      'not removed from the queue',
    ]);
    assert.deepEqual(failed(gate(facts({ risk: high, checks: [] }))), ['checks passed']);
    assert.deepEqual(failed(gate({ ...facts({ risk: high }), pr: { ...facts().pr, body: 'x' } })), [
      'self-review clean',
      'preview smoke-checked',
    ]);
  });

  it('ADR-021: fails closed when the risk is unknown', () => {
    for (const risk of [undefined, null, {}, { risk: 'maybe', reasons: [] }]) {
      const decision = gate(facts({ risk }));
      assert.equal(decision.merge, false, JSON.stringify(risk));
      assert.deepEqual(failed(decision), ['not owner-only'], JSON.stringify(risk));
    }
  });

  it('refuses failing, pending or missing checks on the head commit', () => {
    const failing = facts({
      checks: [...facts().checks.slice(0, 5), run('GitGuardian Security Checks', 'FAILURE')],
    });
    assert.deepEqual(failed(gate(failing)), ['checks passed']);
    assert.match(gate(failing).conditions[1].detail, /failing: GitGuardian Security Checks/);

    const pending = facts({
      checks: [...facts().checks.slice(0, 4), run('Android', '', 'IN_PROGRESS')],
    });
    assert.match(gate(pending).conditions[1].detail, /pending: Android/);

    const missing = facts({ checks: facts().checks.filter((c) => c.name !== 'E2E (Linux)') });
    assert.deepEqual(failed(gate(missing)), ['checks passed']);
    assert.match(gate(missing).conditions[1].detail, /missing: E2E \(Linux\)/);

    const railway = facts({ checks: [...facts().checks, status('fivvi - cron', 'ERROR')] });
    assert.match(gate(railway).conditions[1].detail, /failing: fivvi - cron/);
  });

  it('requires a self-review record for the head commit, and rejects a stale one', () => {
    const none = withPr({ body: `Closes #57\n\n${noPreview()}` });
    assert.deepEqual(failed(gate(none)), ['self-review clean']);
    assert.match(gate(none).conditions[2].detail, /no self-review record/);

    const stale = withPr({ body: `Closes #57\r\n\r\n${reviewed(OLD)}\r\n\r\n${noPreview()}` });
    assert.deepEqual(failed(gate(stale)), ['self-review clean']);
    assert.match(gate(stale).conditions[2].detail, /bbbbbbb.*not the head aaaaaaa/);
  });

  it('requires a smoke record for the head commit, also when there is no preview', () => {
    const body = `Closes #57\n\n${reviewed()}`;
    const none = withPr({ body });
    assert.deepEqual(failed(gate(none)), ['preview smoke-checked']);
    assert.match(gate(none).conditions[3].detail, /no smoke check record/);

    const stale = withPr({ body: `${body}\n\n${noPreview(OLD)}` });
    assert.deepEqual(failed(gate(stale)), ['preview smoke-checked']);
    assert.match(gate(stale).conditions[3].detail, /bbbbbbb.*not the head aaaaaaa/);
  });

  it('requires a passed smoke check for the head commit when the PR has a preview', () => {
    const body = `Closes #57\n\n${reviewed()}`;
    const recorded = (record) =>
      facts({ preview: 'yes', pr: { ...facts().pr, body: `${body}\n\n${record}` } });

    const unchecked = facts({ preview: 'yes', pr: { ...facts().pr, body } });
    assert.deepEqual(failed(gate(unchecked)), ['preview smoke-checked']);

    assert.deepEqual(failed(gate(recorded(smoked(OLD)))), ['preview smoke-checked']);

    const noPreviewRecorded = gate(recorded(noPreview()));
    assert.deepEqual(failed(noPreviewRecorded), ['preview smoke-checked']);
    assert.match(noPreviewRecorded.conditions[3].detail, /has a preview/);

    assert.equal(gate(recorded(smoked())).merge, true);
  });

  it('takes whether the PR has a preview from pr.sh, not from the checks', () => {
    // Railway posts a green `fivvi - web` status also when it skips the deploy (no preview).
    const skipped = facts({
      checks: [...facts().checks, status('fivvi - web', 'SUCCESS')],
      preview: 'no',
    });
    assert.equal(gate(skipped).merge, true);
  });

  it('refuses while the preview is deploying, or when nobody knows whether there is one', () => {
    const deploying = gate(facts({ preview: 'pending' }));
    assert.deepEqual(failed(deploying), ['preview smoke-checked']);
    assert.match(deploying.conditions[3].detail, /still deploying/);

    for (const preview of [undefined, null, '', 'maybe']) {
      const unknown = gate(facts({ preview }));
      assert.deepEqual(failed(unknown), ['preview smoke-checked'], String(preview));
      assert.match(unknown.conditions[3].detail, /unknown/, String(preview));
    }
  });

  it('fails closed without a head commit, required checks or a commit in a record', () => {
    const noSha = withPr({
      body: 'Closes #57\n\n**Self-review:** clean ✅\n\n**Railway preview smoke check:** no preview for this PR.',
    });
    assert.deepEqual(failed(gate(noSha)), ['self-review clean', 'preview smoke-checked']);
    assert.match(gate(noSha).conditions[2].detail, /names no commit/);

    for (const head of [null, '', 'abc1234', 'A'.repeat(40)]) {
      const unknown = gate({ ...facts({ head }), pr: noSha.pr });
      assert.equal(unknown.merge, false, String(head));
      assert.deepEqual(
        failed(unknown),
        ['checks passed', 'self-review clean', 'preview smoke-checked'],
        String(head),
      );
      assert.match(unknown.conditions[1].detail, /head commit is unknown/, String(head));
    }

    const noRequired = gate(facts({ required: [] }));
    assert.deepEqual(failed(noRequired), ['checks passed']);
    assert.match(noRequired.conditions[1].detail, /no required checks/);

    const nothing = gate(facts({ head: null, required: [], checks: [], pr: noSha.pr }));
    assert.equal(nothing.merge, false);
  });

  it('E002 #119: does not ask whether the branch is up to date; the merge queue tests it on the latest main (ADR-018)', () => {
    const decision = gate(facts({ behind: 7 }));
    assert.equal(decision.merge, true);
    assert.ok(decision.conditions.every((c) => c.name !== 'up to date'));
  });

  it('E002 #119: refuses a head commit the merge queue already removed, and fails closed when that is unknown', () => {
    const removed = gate(facts({ queue_removed: true }));
    assert.deepEqual(failed(removed), ['not removed from the queue']);
    assert.equal(removed.merge, false);
    const { queue_removed: _, ...unknown } = facts();
    assert.deepEqual(failed(gate(unknown)), ['not removed from the queue']);
  });

  it('refuses open threads, a draft, a closed PR or another base', () => {
    assert.deepEqual(failed(gate(facts({ threads: 1 }))), ['no open threads']);
    assert.deepEqual(failed(gate(withPr({ draft: true }))), ['ready for review']);
    assert.deepEqual(failed(gate(withPr({ state: 'MERGED' }))), ['ready for review']);
    assert.deepEqual(failed(gate(withPr({ base: 'release' }))), ['ready for review']);
  });
});
