import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// ADR-035: the rules that name the pipeline switch say `lean` and `builders` where they say `fast` and "up to 4 builders".
// Rules for the agents live in prose, so these tests pin the sentences a factory run and a builder act on.

const ROOT = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

describe('ADR-035 the docs and rules of the lean pipeline', () => {
  it('has the ADR, in the index, and ADR-034 points to it as an extension, not a reversal', () => {
    const adr = read('docs/decisions/ADR-035-lean-pipeline.md');
    assert.match(adr, /^# ADR-035: Lean pipeline/);
    assert.match(adr, /pilot setup/);
    assert.match(adr, /T12/);
    assert.match(adr, /`pre-fast`/);
    assert.match(adr, /#1494/);
    assert.match(read('docs/decisions/README.md'), /\| \[035\]\(ADR-035-lean-pipeline\.md\) \|/);
    assert.match(
      read('docs/decisions/ADR-034-fast-pipeline.md'),
      /Extended by.*ADR-035-lean-pipeline\.md/,
    );
  });

  it('the factory and the skill read the number of builders from the switch, not a fixed 4', () => {
    for (const path of [
      '.agents/skills/work/SKILL.md',
      'docs/agents/build.md',
      'docs/engineering/WORKFLOW.md',
    ]) {
      const text = read(path);
      assert.match(text, /pipeline\.sh get builders|`builders`/, path);
      assert.doesNotMatch(text, /Run at most 4 builders at once/, path);
      assert.doesNotMatch(text, /the factory runs up to 4 builders at once while/, path);
    }
    const skill = read('.agents/skills/work/SKILL.md');
    assert.match(skill, /scripts\/pipeline\.sh get builders/);
    assert.match(skill, /`builders: 1`/);
  });

  it('with builders 1 the next ticket waits for the merge, unless the PR waits on the owner', () => {
    const build = read('docs/agents/build.md');
    const rule = build.slice(build.indexOf('**Parallel builders**'), build.indexOf('**Checks**'));
    assert.match(rule, /With `builders: 1`/);
    assert.match(rule, /until its PR is merged/);
    assert.match(
      rule,
      /waits on the owner: owner-only, `pr\.sh merge` refused it, or its issue is `ready-for-human`/,
    );
    assert.match(rule, /Spec reviews, the `reviewer` and the `mechanic` are not builders/);
    const skill = read('.agents/skills/work/SKILL.md');
    assert.match(skill, /\*\*With `builders: 1`\*\* take one ticket or slice at a time/);
  });

  it('every rule for the local check that says fast also says lean', () => {
    for (const path of [
      'AGENTS.md',
      '.agents/agents/builder.md',
      '.agents/agents/mechanic.md',
      '.claude/agents/builder.md',
      '.claude/agents/mechanic.md',
      '.github/agents/builder.agent.md',
      '.github/agents/mechanic.agent.md',
      '.codex/agents/builder.toml',
      '.codex/agents/mechanic.toml',
      'docs/agents/build.md',
    ]) {
      assert.match(read(path), /`fast` or `lean`/, path);
    }
    assert.match(read('docs/engineering/TESTING.md'), /`ci: fast` or `lean`/);
  });

  it('WORKFLOW.md §8 has lean and builders in the table, the way back to pre-fast and the pilot setup rule', () => {
    const workflow = read('docs/engineering/WORKFLOW.md');
    const section = workflow.slice(workflow.indexOf('## 8. Switching the pipeline back'));
    assert.match(section, /^\| `ci` \| `lean` \| `fast` \| `full` \|/m);
    assert.match(section, /^\| `builders` \| `1` \| `4` \| `4` \|/m);
    assert.match(section, /`pre-fast`/);
    assert.match(section, /\{"ci": "fast", "review": "split", "builders": 4, "merge": "queue"\}/);
    assert.match(section, /^\| `merge` \| `direct` \| `queue` \| `queue` \|/m);
    assert.match(section, /scripts\/github-settings\.sh apply/);
    assert.match(section, /Pilot setup requires leaving `ci: lean`/);
  });

  it('AGENTS.md mentions lean and builders in the pipeline switch rule', () => {
    const agents = read('AGENTS.md');
    const rule = agents.slice(agents.indexOf('- **The pipeline switch**'));
    assert.match(rule.split('\n')[0], /`lean`/);
    assert.match(rule.split('\n')[0], /`builders`/);
  });

  it('ADR-035 merge direct: the rules say who merges, how to apply the ruleset and what the queue-only steps are', () => {
    const adr = read('docs/decisions/ADR-035-lean-pipeline.md');
    assert.match(adr, /`merge: direct`/);
    assert.match(adr, /git switch main && git pull && scripts\/github-settings\.sh apply/);
    assert.match(adr, /strict_required_status_checks_policy: true/);
    assert.match(adr, /`pre-fast`/);
    const workflow = read('docs/engineering/WORKFLOW.md');
    assert.match(workflow, /^1\. `git switch main && git pull`/m);
    assert.match(workflow, /^3\. `scripts\/github-settings\.sh apply`/m);
    assert.match(workflow, /off with `merge: direct`/);
    const agents = read('AGENTS.md');
    assert.match(agents, /with `merge: direct` in `\.github\/pipeline\.json`/);
    assert.match(agents, /never `gh pr merge` by hand, `--admin` or `--auto`/);
    const skill = read('.agents/skills/work/SKILL.md');
    assert.match(skill, /with `merge: direct` \(ADR-035\) `pr\.sh merge` merges the PR itself/);
    assert.match(skill, /\(Only with `merge: queue`\.\) Nothing to do/);
    assert.match(read('docs/agents/build.md'), /With `merge: direct` \(no queue\)/);
  });
});
