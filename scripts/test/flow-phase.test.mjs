import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const PHASE_JQ = join(import.meta.dirname, '../flow-phase.jq');

const decide = (facts) =>
  JSON.parse(
    execFileSync('jq', ['-c', '-f', PHASE_JQ], { input: JSON.stringify(facts), encoding: 'utf8' }),
  );

const BEFORE_REMOVAL = '2026-10-31T09:00:00Z';
const REMOVED_AT = '2026-10-31T10:00:00Z';
const AFTER_REMOVAL = '2026-10-31T11:00:00Z';

const issue = (overrides = {}) => ({
  number: 57,
  title: '[F031] Hold a spot',
  state: 'OPEN',
  labels: ['ready-for-agent'],
  assignees: [],
  me: 'owner',
  has_criteria: true,
  described: true,
  parent: {
    number: 50,
    title: '[F031] Open Gym booking',
    state: 'OPEN',
    labels: ['spec', 'spec-approved'],
    open: 2,
    total: 3,
  },
  blockers: [],
  children: [],
  branches: [],
  ...overrides,
});

const branch = (pr, overrides = {}) => ({
  name: 'feature/57-hold-a-spot',
  local: true,
  worktree: '.worktrees/feature-57-hold-a-spot',
  dirty: 0,
  pr,
  ...overrides,
});

const pr = (overrides = {}) => ({
  number: 60,
  state: 'OPEN',
  draft: false,
  review: null,
  failing: 0,
  threads: 0,
  age_days: 1,
  ...overrides,
});

const child = (number, overrides = {}) => ({
  number,
  title: `ticket ${number}`,
  state: 'OPEN',
  labels: ['ready-for-agent'],
  assignees: [],
  blocked: false,
  ...overrides,
});

describe('flow phase of a ticket', () => {
  it('is ready when labelled ready-for-agent with acceptance criteria', () => {
    assert.deepEqual(decide(issue()), {
      phase: 'ready',
      next: 'scripts/flow.sh start 57',
      hint: "Ticket of #50: leave FEATURES.md unchanged. If this PR completes the spec instead, in FEATURES.md, set its row's Status to IMPLEMENTED (NL/EN ✅) and write its final one-line summary in this PR. Change nothing else in the row. Progress lives in the spec's tickets.",
    });
  });

  it('needs refinement without acceptance criteria or without the label', () => {
    assert.equal(decide(issue({ has_criteria: false })).phase, 'needs-refinement');
    assert.match(decide(issue({ has_criteria: false })).next, /no ## Acceptance criteria/);
    assert.equal(decide(issue({ labels: [] })).phase, 'needs-refinement');
  });

  it('waits for the owner while its spec is not approved', () => {
    const unapproved = issue({ parent: { ...issue().parent, labels: ['spec'] } });
    assert.deepEqual(decide(unapproved), {
      phase: 'needs-approval',
      next: 'Its spec #50 waits for the owner to approve it (the spec-approved label). Report and stop.',
      hint: '',
    });
    const underIssue = issue({ parent: { ...issue().parent, labels: [] } });
    assert.equal(
      decide(underIssue).phase,
      'ready',
      'a parent that is not a spec needs no approval',
    );
  });

  it('is blocked while a blocker is open', () => {
    const decision = decide(issue({ blockers: [{ number: 55, title: 'schema' }] }));
    assert.equal(decision.phase, 'blocked');
    assert.match(decision.next, /#55/);
  });

  it('is taken when assigned to someone else, ready when assigned to me', () => {
    assert.equal(decide(issue({ assignees: ['someone'] })).phase, 'taken');
    assert.equal(decide(issue({ assignees: ['owner'] })).phase, 'ready');
  });

  it('needs a human when labelled ready-for-human', () => {
    assert.equal(decide(issue({ labels: ['ready-for-human'] })).phase, 'human');
  });

  it('is done when closed and nothing is left locally', () => {
    assert.equal(decide(issue({ state: 'CLOSED' })).phase, 'done');
    const merged = branch(pr({ state: 'MERGED' }), { local: false, worktree: null });
    assert.equal(decide(issue({ state: 'CLOSED', branches: [merged] })).phase, 'done');
  });

  it('hints the FEATURES.md status for the first and the last ticket of a spec', () => {
    const first = issue({
      parent: { ...issue().parent, open: 3, total: 3 },
    });
    assert.match(decide(first).hint, /IN PROGRESS/);
    const last = issue({ parent: { ...issue().parent, open: 1, total: 3 } });
    assert.match(decide(last).hint, /IMPLEMENTED/);
    assert.equal(decide(issue({ parent: null })).hint, '');
  });

  it('hints IMPLEMENTED for the only ticket of a spec', () => {
    const only = issue({ parent: { ...issue().parent, open: 1, total: 1 } });
    assert.match(decide(only).hint, /IMPLEMENTED/);
  });

  it('lets only the PR that completes the spec touch the FEATURES.md summary', () => {
    const first = decide(issue({ parent: { ...issue().parent, open: 3, total: 3 } })).hint;
    assert.match(first, /change only its row's Status, to IN PROGRESS/);
    assert.match(first, /If this PR completes the spec instead, .*IMPLEMENTED/);
    assert.match(first, /Progress lives in the spec's tickets/);
    assert.doesNotMatch(first, /notes|Open:|Next:/i);
    const middle = decide(issue()).hint;
    assert.match(
      middle,
      /leave FEATURES\.md unchanged\. If this PR completes the spec instead, .*IMPLEMENTED/,
    );
    assert.match(middle, /Progress lives in the spec's tickets/);
    assert.doesNotMatch(middle, /notes|Open:|Next:/i);
    const last = decide(issue({ parent: { ...issue().parent, open: 1, total: 3 } })).hint;
    assert.match(last, /set its row's Status to IMPLEMENTED .* final one-line summary/);
    assert.doesNotMatch(last, /notes|Open:|Next:/i);
  });
});

describe('flow phase of a needs-info question', () => {
  it('waits for the owner until the newest comment is not our triage note', () => {
    const waiting = decide(issue({ labels: ['needs-info'], answered: false }));
    assert.equal(waiting.phase, 'waiting');
    assert.match(waiting.next, /owner/);
    const answered = decide(issue({ labels: ['needs-info'], answered: true }));
    assert.equal(answered.phase, 'answered');
    assert.match(answered.next, /triage/);
  });

  it('holds the issue whatever its code, blockers or other labels say', () => {
    const held = issue({
      labels: ['ready-for-agent', 'needs-info'],
      answered: false,
      blockers: [{ number: 55, title: 'schema' }],
      branches: [branch(pr({ risk: 'low' }))],
    });
    assert.equal(decide(held).phase, 'waiting');
    assert.equal(
      decide(issue({ labels: ['spec', 'needs-info'], answered: true })).phase,
      'answered',
    );
  });

  it('lets merged work be cleaned up', () => {
    const merged = branch(pr({ state: 'MERGED' }));
    assert.equal(
      decide(issue({ labels: ['needs-info'], answered: false, branches: [merged] })).phase,
      'merged',
    );
  });

  it('no longer holds a closed issue', () => {
    assert.equal(decide(issue({ state: 'CLOSED', labels: ['needs-info'] })).phase, 'done');
  });
});

describe('flow phase from the code', () => {
  const phaseOf = (prFacts, overrides) =>
    decide(issue({ branches: [branch(prFacts, overrides)] })).phase;

  it('follows the PR through its states', () => {
    assert.equal(phaseOf(null), 'in-progress');
    assert.equal(phaseOf(pr({ draft: true })), 'draft-pr');
    assert.equal(phaseOf(pr({ risk: 'owner' })), 'in-review');
    assert.equal(phaseOf(pr({ risk: 'owner', review: 'APPROVED' })), 'approved');
    assert.equal(phaseOf(pr({ state: 'MERGED' })), 'merged');
    assert.equal(phaseOf(pr({ state: 'CLOSED' })), 'abandoned');
  });

  it('lets an agent merge a low-risk PR and an agent-queueable high-risk one, and leaves an owner-only PR to the owner', () => {
    const low = decide(issue({ branches: [branch(pr({ risk: 'low' }))] }));
    assert.equal(low.phase, 'ready-to-merge');
    assert.match(
      low.next,
      /^Low-risk: scripts\/pr\.sh merge in the worktree.*merge queue.*scripts\/flow\.sh finish 57/,
    );
    assert.equal(phaseOf(pr({ risk: 'low', review: 'APPROVED' })), 'ready-to-merge');

    const high = decide(
      issue({
        branches: [
          branch(
            pr({
              risk: 'high',
              risk_reasons: ['packages/database/migrations/0004.sql: tenant-data'],
            }),
          ),
        ],
      }),
    );
    assert.equal(high.phase, 'ready-to-merge');
    assert.match(
      high.next,
      /^High-risk \(packages\/database\/migrations\/0004\.sql: tenant-data\): scripts\/pr\.sh merge in the worktree.*records.*merge queue.*scripts\/flow\.sh finish 57/,
    );
    assert.equal(phaseOf(pr({ risk: 'high', review: 'APPROVED' })), 'ready-to-merge');

    const owner = decide(
      issue({
        branches: [
          branch(pr({ risk: 'owner', risk_reasons: ['scripts/pr.sh: guardrails (/scripts)'] })),
        ],
      }),
    );
    assert.equal(owner.phase, 'in-review');
    assert.match(
      owner.next,
      /^Owner-only \(scripts\/pr\.sh: guardrails \(\/scripts\)\): the owner reviews/,
    );
    assert.doesNotMatch(owner.next, /scripts\/pr\.sh merge/);
    assert.equal(phaseOf(pr({ risk: null })), 'in-review', 'unknown risk waits for the owner');
  });

  it('ADR-021: a high-risk PR the merge gate refused on its head commit waits for the owner, like a low-risk one', () => {
    const head = 'c'.repeat(40);
    const refused = pr({
      risk: 'high',
      head,
      refusal: { sha: head, reasons: 'checks passed (failing: Android)' },
    });
    assert.equal(phaseOf(refused), 'merge-refused');
    assert.equal(
      phaseOf({ ...refused, refusal: { sha: 'b'.repeat(40), reasons: 'x' } }),
      'ready-to-merge',
    );
  });

  it('leaves a low-risk PR the merge gate refused on its head commit to the owner', () => {
    const head = 'c'.repeat(40);
    const refused = (sha) =>
      pr({
        risk: 'low',
        head,
        refusal: { sha, reasons: 'self-review clean (no self-review record in the PR body)' },
      });

    const waiting = decide(issue({ branches: [branch(refused(head))] }));
    assert.equal(waiting.phase, 'merge-refused');
    assert.match(
      waiting.next,
      /^The merge gate refused it on ccccccc: self-review clean \(no self-review record in the PR body\)\. The owner decides, or fix it and push/,
    );
    assert.doesNotMatch(waiting.next, /scripts\/pr\.sh merge/);

    assert.equal(phaseOf(refused('b'.repeat(40))), 'ready-to-merge', 'a new push makes it stale');
    assert.equal(phaseOf(pr({ risk: 'low', head, refusal: null })), 'ready-to-merge');
    assert.equal(phaseOf(refused(null)), 'ready-to-merge', 'a record without a commit is stale');
  });

  it('E002 #119: a PR in the merge queue waits for GitHub to merge it: nothing to do, finish after the merge', () => {
    const queued = decide(
      issue({
        branches: [
          branch(pr({ risk: 'low', queue: { state: 'queued', position: 2, reason: null } })),
        ],
      }),
    );
    assert.equal(queued.phase, 'queued');
    assert.match(queued.next, /^In the merge queue \(position 2\)/);
    assert.match(queued.next, /scripts\/flow\.sh finish 57/);
    assert.doesNotMatch(queued.next, /scripts\/pr\.sh merge/);
    // The owner queues an owner-only PR: it is queued for the same reason.
    assert.equal(
      phaseOf(pr({ risk: 'owner', queue: { state: 'queued', position: 1, reason: null } })),
      'queued',
    );
  });

  it('E002 #119: a PR GitHub removed from the queue shows the reason, and never gets queued again as it is', () => {
    const removed = decide(
      issue({
        branches: [
          branch(
            pr({
              risk: 'low',
              queue: { state: 'removed', position: null, reason: 'Merge group failed' },
            }),
          ),
        ],
      }),
    );
    assert.equal(removed.phase, 'queue-removed');
    assert.match(removed.next, /removed it from the merge queue \(Merge group failed\)/);
    assert.match(removed.next, /gh run list --event merge_group/);
    assert.match(removed.next, /Never queue the same commit again yourself/);
    assert.doesNotMatch(removed.next, /^Low-risk: scripts\/pr\.sh merge/);
  });

  it('ADR-025: a removal names how to tell a cause in the PR from one outside it, and the only way to queue the commit again', () => {
    const removed = decide(
      issue({
        branches: [
          branch(
            pr({
              risk: 'low',
              queue: {
                state: 'removed',
                position: null,
                reason: 'Merge group failed',
                removed_at: REMOVED_AT,
                requeued: false,
              },
            }),
          ),
        ],
      }),
    );
    assert.equal(removed.phase, 'queue-removed');
    assert.match(removed.next, /A cause in this PR: fix it and push/);
    assert.match(removed.next, /A cause outside it/);
    assert.match(removed.next, /scripts\/issue\.sh create bug/);
    assert.match(removed.next, /scripts\/issue\.sh block 57 --by <bug>/);
    assert.match(removed.next, /scripts\/pr\.sh merge <pr> --after <bug>/);
    assert.match(removed.next, /Never queue the same commit again yourself/);
  });

  describe('ADR-025: a PR removed for a cause outside it', () => {
    const removedQueue = (overrides = {}) => ({
      state: 'removed',
      position: null,
      reason: 'Merge group failed',
      removed_at: REMOVED_AT,
      requeued: false,
      ...overrides,
    });
    const decideRemoved = (issueOverrides = {}, queueOverrides = {}) =>
      decide(
        issue({
          branches: [branch(pr({ risk: 'owner', queue: removedQueue(queueOverrides) }))],
          ...issueOverrides,
        }),
      );
    const fixed = (number, closed_at) => ({ number, title: `bug ${number}`, closed_at });

    it('waits for the bug while it is open: nothing to do on the PR', () => {
      const waiting = decideRemoved({ blockers: [{ number: 353, title: 'flaky' }] });
      assert.equal(waiting.phase, 'waiting-fix');
      assert.match(waiting.next, /^Wait for #353, which fixes the check that removed it/);
      assert.match(waiting.next, /Nothing to do on this PR/);
      assert.doesNotMatch(waiting.next, /scripts\/pr\.sh merge/);
    });

    it('waits for every open blocker, and an open one beats a fixed one', () => {
      const waiting = decideRemoved({
        blockers: [
          { number: 353, title: 'flaky' },
          { number: 360, title: 'other' },
        ],
        fixed_blockers: [fixed(354, AFTER_REMOVAL)],
      });
      assert.equal(waiting.phase, 'waiting-fix');
      assert.match(waiting.next, /#353, #360/);
    });

    it('is a requeue once a blocker was closed as completed after the removal', () => {
      const requeue = decideRemoved({ fixed_blockers: [fixed(353, AFTER_REMOVAL)] });
      assert.equal(requeue.phase, 'requeue');
      assert.match(requeue.next, /^scripts\/pr\.sh merge 60 --after 353/);
      assert.match(requeue.next, /same commit/);
    });

    it('names the blocker closed last when several were', () => {
      const requeue = decideRemoved({
        fixed_blockers: [fixed(353, AFTER_REMOVAL), fixed(354, '2026-10-31T13:00:00Z')],
      });
      assert.match(requeue.next, /--after 354/);
    });

    it('does not count a blocker closed before the removal', () => {
      const plain = decideRemoved({ fixed_blockers: [fixed(353, BEFORE_REMOVAL)] });
      assert.equal(plain.phase, 'queue-removed');
      assert.doesNotMatch(plain.next, /--after 353/);
    });

    it('does not count a blocker closed at the very moment of the removal', () => {
      assert.equal(
        decideRemoved({ fixed_blockers: [fixed(353, REMOVED_AT)] }).phase,
        'queue-removed',
      );
    });

    it('does not count a blocker that was not closed as completed (facts carry only completed ones)', () => {
      // flow.sh leaves a blocker closed as not planned out of fixed_blockers, so no fix is on record.
      assert.equal(decideRemoved({ fixed_blockers: [] }).phase, 'queue-removed');
    });

    it('is a plain removal without a blocker, and without the removal time', () => {
      assert.equal(decideRemoved().phase, 'queue-removed');
      assert.equal(
        decideRemoved({ fixed_blockers: [fixed(353, AFTER_REMOVAL)] }, { removed_at: null }).phase,
        'queue-removed',
      );
      assert.equal(
        decideRemoved({ fixed_blockers: [fixed(353, AFTER_REMOVAL)] }, { removed_at: undefined })
          .phase,
        'queue-removed',
      );
    });

    it('is a plain removal when the facts have no fixed blockers at all', () => {
      assert.equal(decideRemoved({ fixed_blockers: undefined }).phase, 'queue-removed');
    });

    it('stops at a second removal of a commit already re-queued after a fix: the owner decides', () => {
      const again = decideRemoved(
        {
          blockers: [{ number: 360, title: 'again' }],
          fixed_blockers: [fixed(353, AFTER_REMOVAL)],
        },
        { requeued: true },
      );
      assert.equal(again.phase, 'queue-removed');
      assert.match(again.next, /already re-queued once after a fix/);
      assert.match(again.next, /Report and stop/);
      assert.doesNotMatch(again.next, /--after <bug>/);
    });

    it('leaves a plain removal for failing checks or open threads, as before', () => {
      assert.equal(
        decide(
          issue({
            blockers: [{ number: 353, title: 'flaky' }],
            branches: [branch(pr({ risk: 'low', failing: 1, queue: removedQueue() }))],
          }),
        ).phase,
        'changes-requested',
      );
    });

    it('a new push makes the removal stale: the usual flow again', () => {
      assert.equal(
        decide(
          issue({
            blockers: [{ number: 353, title: 'flaky' }],
            branches: [
              branch(
                pr({
                  risk: 'low',
                  queue: { state: null, position: null, reason: null, removed_at: null },
                }),
              ),
            ],
          }),
        ).phase,
        'ready-to-merge',
      );
    });
  });

  it('E002 #119: no queue state is the usual flow, and failing checks or open threads come before a removal', () => {
    assert.equal(
      phaseOf(pr({ risk: 'low', queue: { state: null, position: null, reason: null } })),
      'ready-to-merge',
    );
    assert.equal(
      phaseOf(pr({ risk: 'low', failing: 1, queue: { state: 'removed', reason: 'x' } })),
      'changes-requested',
    );
    assert.equal(phaseOf(pr({ draft: true, queue: { state: 'queued', position: 1 } })), 'draft-pr');
  });

  it('E002 #119: a merged PR is merged, whatever the queue said', () => {
    assert.equal(
      phaseOf(pr({ state: 'MERGED', queue: { state: 'queued', position: 1, reason: null } })),
      'merged',
    );
  });

  it('asks for changes on failing checks, open threads or a change request', () => {
    assert.equal(phaseOf(pr({ failing: 1 })), 'changes-requested');
    assert.equal(phaseOf(pr({ threads: 2 })), 'changes-requested');
    assert.equal(phaseOf(pr({ review: 'CHANGES_REQUESTED' })), 'changes-requested');
  });

  it('reports merged work that still has a local branch, so it gets cleaned up', () => {
    assert.equal(
      decide(issue({ state: 'CLOSED', branches: [branch(pr({ state: 'MERGED' }))] })).phase,
      'merged',
    );
  });

  it('takes the least advanced branch when there are several', () => {
    const branches = [branch(pr({ state: 'MERGED' })), branch(null, { name: 'fix/57-follow-up' })];
    assert.equal(decide(issue({ branches })).phase, 'in-progress');
  });

  it('keeps the FEATURES.md hint while the ticket is in progress', () => {
    const last = issue({
      parent: { ...issue().parent, open: 1, total: 3 },
      branches: [branch(null)],
    });
    assert.match(decide(last).hint, /IMPLEMENTED/);
  });
});

describe('flow phase of a spec', () => {
  const spec = (overrides) =>
    issue({
      number: 50,
      labels: ['spec', 'spec-approved'],
      parent: null,
      has_criteria: false,
      ...overrides,
    });

  it('needs tickets when described and approved, a spec when empty or untriaged', () => {
    assert.equal(decide(spec()).phase, 'needs-tickets');
    assert.equal(decide(spec({ described: false, labels: ['spec'] })).phase, 'needs-spec');
    assert.equal(decide(spec({ labels: ['spec', 'needs-triage'] })).phase, 'needs-spec');
  });

  // #292 AC10: tickets are cut as soon as a spec is approved; the real dependencies move to the tickets.
  it('#292 AC10: an approved spec with open blockers and no tickets needs tickets, not blocked', () => {
    const decision = decide(spec({ blockers: [{ number: 49, title: '[F001] Sign in' }] }));
    assert.equal(decision.phase, 'needs-tickets');
    assert.match(decision.next, /to-tickets/);
    assert.match(decision.next, /#49/);
    assert.match(decision.next, /--blocked-by/);
  });

  it('#292 AC10: once an approved, blocked spec has tickets, it is building and lists the ready ones', () => {
    const blockers = [{ number: 49, title: '[F001] Sign in' }];
    const decision = decide(spec({ blockers, children: [child(51), child(52)] }));
    assert.equal(decision.phase, 'building');
    assert.match(decision.next, /Ready now: #51 #52/);
    const done = decide(spec({ blockers, children: [child(51, { state: 'CLOSED' })] }));
    assert.equal(done.phase, 'complete');
    const unapproved = decide(spec({ blockers, labels: ['spec'], children: [child(51)] }));
    assert.equal(unapproved.phase, 'blocked', 'a spec whose approval was removed stays blocked');
  });

  it('#292 AC10: a spec that is not approved, not described, or its own ticket stays blocked or waiting', () => {
    const blockers = [{ number: 49, title: '[F001] Sign in' }];
    assert.equal(decide(spec({ blockers, labels: ['spec'] })).phase, 'blocked');
    assert.equal(decide(spec({ blockers, described: false })).phase, 'blocked');
    assert.equal(
      decide(spec({ blockers, labels: ['spec', 'spec-approved', 'ready-for-agent'] })).phase,
      'blocked',
      'a spec built as its own ticket waits for its blockers',
    );
    assert.equal(decide(spec({ blockers, state: 'CLOSED' })).phase, 'done');
  });

  it('waits for the owner to approve a described spec before it gets tickets', () => {
    assert.deepEqual(decide(spec({ labels: ['spec'] })), {
      phase: 'needs-approval',
      next: 'The owner reviews the spec on GitHub and approves it with the spec-approved label. Report and stop.',
      hint: '',
    });
    const own = spec({ labels: ['spec', 'ready-for-agent'], has_criteria: true });
    assert.equal(decide(own).phase, 'needs-approval', 'a spec built as its own ticket');
    const building = spec({ labels: ['spec'], children: [child(51), child(52)] });
    assert.equal(decide(building).phase, 'needs-approval', 'a spec whose approval was removed');
    const complete = spec({ labels: ['spec'], children: [child(51, { state: 'CLOSED' })] });
    assert.equal(decide(complete).phase, 'complete');
  });

  it('lists only unblocked, unassigned ready tickets while building', () => {
    const children = [
      child(51, { state: 'CLOSED' }),
      child(52),
      child(53, { blocked: true }),
      child(54, { assignees: ['owner'] }),
      child(55, { labels: [] }),
    ];
    const decision = decide(spec({ children }));
    assert.equal(decision.phase, 'building');
    assert.match(decision.next, /^4 of 5 tickets open\. Ready now: #52\./);
  });

  it('is complete when every ticket is closed', () => {
    const decision = decide(
      spec({ children: [child(51, { state: 'CLOSED' }), child(52, { state: 'CLOSED' })] }),
    );
    assert.equal(decision.phase, 'complete');
    assert.match(decision.next, /scripts\/issue\.sh close 50/);
  });

  it('builds a spec without tickets as its own ticket once it is ready-for-agent', () => {
    const labels = ['spec', 'spec-approved', 'ready-for-agent'];
    const own = spec({ labels, has_criteria: true });
    assert.equal(decide(own).phase, 'ready');
    assert.match(decide(own).hint, /its own ticket: .*IMPLEMENTED .* final one-line summary/);
    assert.equal(decide(spec({ labels })).phase, 'needs-refinement');
    assert.equal(decide({ ...own, branches: [branch(null)] }).phase, 'in-progress');
  });

  it('ADR-021: sets no fixed limit on the tickets built at once', () => {
    const decision = decide(spec({ children: [child(51), child(52), child(53), child(54)] }));
    assert.equal(decision.phase, 'building');
    assert.match(decision.next, /Ready now: #51 #52 #53 #54\./);
    assert.doesNotMatch(decision.next, /at most three/);
    assert.match(decision.next, /same files/);
  });

  it('treats an issue with sub-issues as a spec even without the label', () => {
    assert.equal(decide(issue({ labels: [], children: [child(52)] })).phase, 'building');
  });
});
