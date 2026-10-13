import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const PHASE_JQ = join(import.meta.dirname, '../flow-phase.jq');

const decide = (facts) =>
  JSON.parse(
    execFileSync('jq', ['-c', '-f', PHASE_JQ], { input: JSON.stringify(facts), encoding: 'utf8' }),
  );

const issue = (overrides = {}) => ({
  number: 57,
  title: '[F031] Hold a spot',
  state: 'OPEN',
  labels: ['ready-for-agent'],
  assignees: [],
  me: 'owner',
  has_criteria: true,
  described: true,
  parent: { number: 50, title: '[F031] Open Gym booking', state: 'OPEN', open: 2, total: 3 },
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
      hint: '',
    });
  });

  it('needs refinement without acceptance criteria or without the label', () => {
    assert.equal(decide(issue({ has_criteria: false })).phase, 'needs-refinement');
    assert.match(decide(issue({ has_criteria: false })).next, /no ## Acceptance criteria/);
    assert.equal(decide(issue({ labels: [] })).phase, 'needs-refinement');
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
      parent: { number: 50, title: 'spec', state: 'OPEN', open: 3, total: 3 },
    });
    assert.match(decide(first).hint, /IN PROGRESS/);
    const last = issue({ parent: { number: 50, title: 'spec', state: 'OPEN', open: 1, total: 3 } });
    assert.match(decide(last).hint, /IMPLEMENTED/);
    assert.equal(decide(issue()).hint, '');
    assert.equal(decide(issue({ parent: null })).hint, '');
  });

  it('hints IMPLEMENTED for the only ticket of a spec', () => {
    const only = issue({ parent: { number: 50, title: 'spec', state: 'OPEN', open: 1, total: 1 } });
    assert.match(decide(only).hint, /IMPLEMENTED/);
  });
});

describe('flow phase from the code', () => {
  const phaseOf = (prFacts, overrides) =>
    decide(issue({ branches: [branch(prFacts, overrides)] })).phase;

  it('follows the PR through its states', () => {
    assert.equal(phaseOf(null), 'in-progress');
    assert.equal(phaseOf(pr({ draft: true })), 'draft-pr');
    assert.equal(phaseOf(pr()), 'in-review');
    assert.equal(phaseOf(pr({ review: 'APPROVED' })), 'approved');
    assert.equal(phaseOf(pr({ state: 'MERGED' })), 'merged');
    assert.equal(phaseOf(pr({ state: 'CLOSED' })), 'abandoned');
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
      parent: { number: 50, title: 'spec', state: 'OPEN', open: 1, total: 3 },
      branches: [branch(null)],
    });
    assert.match(decide(last).hint, /IMPLEMENTED/);
  });
});

describe('flow phase of a spec', () => {
  const spec = (overrides) =>
    issue({ number: 50, labels: ['spec'], parent: null, has_criteria: false, ...overrides });

  it('needs tickets when described, a spec when empty or untriaged', () => {
    assert.equal(decide(spec()).phase, 'needs-tickets');
    assert.equal(decide(spec({ described: false })).phase, 'needs-spec');
    assert.equal(decide(spec({ labels: ['spec', 'needs-triage'] })).phase, 'needs-spec');
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
    const own = spec({ labels: ['spec', 'ready-for-agent'], has_criteria: true });
    assert.equal(decide(own).phase, 'ready');
    assert.match(decide(own).hint, /its own ticket: .*IMPLEMENTED/);
    assert.equal(decide(spec({ labels: ['spec', 'ready-for-agent'] })).phase, 'needs-refinement');
    assert.equal(decide({ ...own, branches: [branch(null)] }).phase, 'in-progress');
  });

  it('treats an issue with sub-issues as a spec even without the label', () => {
    assert.equal(decide(issue({ labels: [], children: [child(52)] })).phase, 'building');
  });
});
