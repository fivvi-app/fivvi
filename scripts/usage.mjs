#!/usr/bin/env node
// Measures a factory run from Claude Code's transcripts on this machine and from GitHub, so a run can be compared with
// an earlier one: tokens and price-weighted cost per model, agent and tool time, and quality, per ticket.
//
//   node scripts/usage.mjs snapshot [--since D] [--until D] [--label L] [--out F] [--projects DIR] [--root DIR]
//       write the aggregates of the sessions that started between D and D (ISO dates or timestamps) as JSON, by default
//       to docs/agents/usage/<label>.json (label defaults to the since date). Needs gh for the GitHub fields; without
//       it they are null and a warning goes to stderr. --projects is the folder of Claude Code's projects (default
//       $CLAUDE_CONFIG_DIR/projects or ~/.claude/projects), --root the repo whose sessions to read (default: this repo)
//   node scripts/usage.mjs compare <before.json> <after.json>
//       print per role, per ticket group (area and size) and per session how the metrics changed, before → after
//
// Only numbers, issue and PR numbers, SHAs, agent roles and models are read out of a transcript and written; never its
// text. Claude Code deletes transcripts after 30 days by default: take a snapshot of a run within that time.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), '..');

// Price-weighted token units, input = 1 (Anthropic's ratios): a cache write costs 1.25, a cache read 0.1, an output
// token 5. Units are per model; never add the units of two models together.
const RATIO = { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 };
export const unitsOf = (t) =>
  t.input * RATIO.input +
  t.cacheWrite * RATIO.cacheWrite +
  t.cacheRead * RATIO.cacheRead +
  t.output * RATIO.output;

const FOLLOW_UP_DAYS = 14;
const SIZE_LIMITS = { S: 150, M: 600 };
const FEW = 3;

// ---------- small helpers

const sum = (list) => list.reduce((a, b) => a + b, 0);
const mean = (list) => (list.length === 0 ? null : sum(list) / list.length);
const median = (list) => {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const modelOf = (id) =>
  /opus/i.test(id) ? 'opus' : /sonnet/i.test(id) ? 'sonnet' : /haiku/i.test(id) ? 'haiku' : 'other';
const tokensOf = (usage) => ({
  input: usage.input_tokens ?? 0,
  cacheRead: usage.cache_read_input_tokens ?? 0,
  cacheWrite: usage.cache_creation_input_tokens ?? 0,
  output: usage.output_tokens ?? 0,
});
const contextOf = (t) => t.input + t.cacheRead + t.cacheWrite;
const emptyTokens = () => ({ calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
const tokensFor = (byModel, model) => {
  byModel[model] ??= emptyTokens();
  return byModel[model];
};
const addTokens = (into, t) => {
  into.calls += 1;
  for (const key of ['input', 'cacheRead', 'cacheWrite', 'output']) into[key] += t[key];
};
const mergeTokens = (into, from) => {
  for (const key of ['calls', 'input', 'cacheRead', 'cacheWrite', 'output']) into[key] += from[key];
};
const costOf = (tokens) =>
  Object.fromEntries(Object.entries(tokens).map(([model, t]) => [model, Math.round(unitsOf(t))]));

// ---------- pure rules

// `feature-135-get-me` is the worktree folder of branch `feature/135-get-me` (scripts/_lib.sh new_worktree_path).
export const branchOfDir = (dir) => {
  const m = /^(feature|fix|chore|docs)-(.+)$/.exec(dir);
  if (!m) return { branch: dir, issue: null };
  const issue = /^(\d+)-/.exec(m[2]);
  return { branch: `${m[1]}/${m[2]}`, issue: issue ? Number(issue[1]) : null };
};

const issueOfBranch = (branch) => {
  const m = /^(?:feature|fix|chore|docs)\/(\d+)-/.exec(branch);
  return m ? Number(m[1]) : null;
};

// A command runs a script when the script is the first word of a command of the line (after `;`, `&&`, `|`, `do`, ...),
// maybe behind `bash`, `time` or variable assignments; `cat scripts/check.sh` or `git log --until=x` only name one.
const START = String.raw`(?:^|[;&|(\n]|\bdo\b|\bthen\b)\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:(?:time|rtk)\s+)?`;
const CHECK = new RegExp(
  String.raw`${START}(?:(?:bash|sh|zsh)\s+)?[^\s;&|()]*scripts/check\.sh(?![\w.-])`,
);
const NATIVE =
  /pnpm test:(ios|android)|scripts\/(test-ios|android|maestro)\.sh|\bmaestro\b|xcodebuild|gradlew/;
const WAIT = new RegExp(
  String.raw`gh run watch|gh pr checks|pr\.sh (wait|ship)|${START}(until|sleep)\s`,
);
export const classifyCommand = (command) => {
  if (typeof command !== 'string') return 'other';
  if (CHECK.test(command)) return 'check';
  if (NATIVE.test(command)) return 'native';
  if (WAIT.test(command)) return 'wait';
  return 'other';
};

// A line states a finding when it opens with the label (behind a list marker, bold, backticks or brackets):
// `- should-fix: a.ts:3 ...`, `**must-fix** ...`. "No must-fix or should-fix", "- must-fix: none" state none.
const FINDING =
  /^\s*(?:(?:[-*+]|\d+[.)])\s+)?[*_`[(]*\s*(?:must-fix|should-fix)\b(?!\W*(?:none|nothing|0)\b)/i;

// The verdict a reviewer ends with, `not clean on <sha>` or `clean on <sha>`, and how many of the other lines of the
// text state a must-fix or should-fix finding.
export const parseVerdict = (text) => {
  const matches = [...text.matchAll(/\b(not clean|clean) on ([0-9a-f]{7,40})\b/gi)];
  const last = matches.at(-1);
  const lines = text.split('\n');
  const verdictLine = last ? lines.findLastIndex((line) => line.includes(last[0])) : -1;
  const findings = lines.filter((line, i) => i !== verdictLine && FINDING.test(line)).length;
  if (!last) return { verdict: null, sha: null, findings };
  return {
    verdict: last[1].toLowerCase() === 'clean' ? 'clean' : 'not-clean',
    sha: last[2].toLowerCase(),
    findings,
  };
};

export const sizeClass = (files) => {
  const lines = sum(
    files
      .filter((f) => f.path !== 'pnpm-lock.yaml' && !f.path.includes('/generated/'))
      .map((f) => (f.additions ?? 0) + (f.deletions ?? 0)),
  );
  return lines <= SIZE_LIMITS.S ? 'S' : lines <= SIZE_LIMITS.M ? 'M' : 'L';
};

export const areaOf = (paths) => {
  const under = (...prefixes) => paths.some((p) => prefixes.some((prefix) => p.startsWith(prefix)));
  if (under('apps/ios/', 'apps/android/')) return 'native';
  if (under('apps/', 'packages/')) return 'app';
  if (under('scripts/', '.agents/', '.claude/', '.github/', '.codex/')) return 'tooling';
  return 'docs';
};

// The time covered by a set of [start, end] intervals (seconds), overlaps counted once.
export const unionSeconds = (intervals) => {
  let total = 0;
  let end = -Infinity;
  for (const [from, to] of [...intervals].sort((a, b) => a[0] - b[0])) {
    if (to <= end) continue;
    total += to - Math.max(from, end);
    end = to;
  }
  return total;
};

// ---------- transcripts

const readJsonl = (file) => {
  const records = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // a half-written last line
    }
  }
  return records;
};

// What a transcript says in numbers: one entry per message id (a message has a record per content block, all carrying
// the same usage), the time between a tool call and its result, and the worktrees its commands name.
const analyze = (records) => {
  const messages = new Map();
  const uses = new Map();
  const results = new Map();
  const worktrees = new Map();
  let handback = null;
  let start = null;
  let end = null;
  let compactions = 0;
  for (const record of records) {
    const time = Date.parse(record.timestamp);
    if (!Number.isNaN(time)) {
      start ??= time;
      end = time;
    }
    if (record.type === 'system' && record.subtype === 'compact_boundary') compactions += 1;
    const message = record.message;
    if (!message || !Array.isArray(message.content ?? [])) continue;
    if (
      record.type === 'assistant' &&
      message.id &&
      message.usage &&
      message.model !== '<synthetic>'
    ) {
      const entry = messages.get(message.id) ?? { model: message.model, texts: [] };
      entry.usage = message.usage;
      messages.set(message.id, entry);
      for (const block of message.content ?? []) {
        if (block.type === 'text' && typeof block.text === 'string') entry.texts.push(block.text);
        if (block.type === 'tool_use') {
          if (block.name === 'SubagentHandback' && typeof block.input?.message === 'string')
            handback = block.input.message;
          const command = block.input?.command;
          uses.set(block.id, { time, command });
          if (typeof command === 'string') {
            for (const m of command.matchAll(/\.worktrees\/([A-Za-z0-9._-]+)/g)) {
              worktrees.set(m[1], (worktrees.get(m[1]) ?? 0) + 1);
            }
          }
        }
      }
    } else if (record.type === 'user') {
      for (const block of Array.isArray(message.content) ? message.content : []) {
        if (block.type === 'tool_result' && !results.has(block.tool_use_id))
          results.set(block.tool_use_id, time);
      }
    }
  }

  const byModel = {};
  const contexts = [];
  const callsByModel = {};
  for (const { model: id, usage } of messages.values()) {
    const model = modelOf(id);
    const t = tokensOf(usage);
    addTokens(tokensFor(byModel, model), t);
    contexts.push(contextOf(t));
    callsByModel[model] = (callsByModel[model] ?? 0) + 1;
  }
  const toolSeconds = { check: 0, native: 0, wait: 0, other: 0 };
  let checkRuns = 0;
  for (const [id, use] of uses) {
    const kind = classifyCommand(use.command);
    if (kind === 'check') checkRuns += 1;
    const done = results.get(id);
    if (done !== undefined && !Number.isNaN(done) && !Number.isNaN(use.time) && done >= use.time) {
      toolSeconds[kind] += (done - use.time) / 1000;
    }
  }
  const withText = [...messages.values()].filter((m) => m.texts.length > 0);
  const worktree = [...worktrees].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const model = Object.entries(callsByModel).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    start,
    end,
    compactions,
    calls: contexts.length,
    byModel,
    model,
    firstContext: contexts[0] ?? null,
    peakContext: contexts.length ? Math.max(...contexts) : null,
    avgContext: mean(contexts),
    toolSeconds,
    checkRuns,
    worktree,
    // A subagent reports through the SubagentHandback tool; an older one ends with plain text.
    report: handback ?? withText.at(-1)?.texts.join('\n') ?? null,
  };
};

const projectFolders = (projects, rootPath) => {
  const prefix = rootPath.replace(/[/.]/g, '-');
  if (!existsSync(projects)) return [];
  return readdirSync(projects)
    .filter((name) => name === prefix || name.startsWith(`${prefix}--worktrees-`))
    .map((name) => join(projects, name));
};

const readSessions = (folders, since, until) => {
  const sessions = [];
  for (const folder of folders) {
    for (const name of readdirSync(folder).filter((n) => n.endsWith('.jsonl'))) {
      const id = name.slice(0, -'.jsonl'.length);
      const records = readJsonl(join(folder, name));
      const first = records.map((r) => Date.parse(r.timestamp)).find((t) => !Number.isNaN(t));
      if (
        first === undefined ||
        (since !== null && first < since) ||
        (until !== null && first > until)
      )
        continue;
      const main = analyze(records);
      const agents = [];
      const dir = join(folder, id, 'subagents');
      if (existsSync(dir)) {
        for (const file of readdirSync(dir).filter(
          (n) => n.startsWith('agent-') && n.endsWith('.jsonl'),
        )) {
          let meta = {};
          try {
            meta = JSON.parse(
              readFileSync(join(dir, file.replace(/\.jsonl$/, '.meta.json')), 'utf8'),
            );
          } catch {
            // no meta: the role is unknown
          }
          const description = typeof meta.description === 'string' ? meta.description : '';
          let role = meta.agentType ?? 'unknown';
          if (role === 'general-purpose' && /axis/i.test(description)) role = 'review-axis';
          agents.push({ role, description, ...analyze(readJsonl(join(dir, file))) });
        }
      }
      sessions.push({ id, main, agents });
    }
  }
  return sessions.sort((a, b) => a.main.start - b.main.start);
};

// ---------- tickets

// An agent without a worktree is put on a ticket by the first `#n` of its description. A number can be an issue or a PR
// (the PR of issue 138 may be #208), so GitHub says which: a PR is the ticket of its head branch, an issue the ticket
// of the worktree branch with that issue, or its own. Without GitHub the agent is left out rather than guessed.
const groupAgents = (sessions, github) => {
  const known = new Map();
  for (const { agents } of sessions) {
    for (const agent of agents) {
      if (agent.worktree) {
        const { branch, issue } = branchOfDir(agent.worktree);
        agent.branch = branch;
        agent.issue = issue;
        if (issue !== null && !known.has(issue)) known.set(issue, branch);
      }
    }
  }
  const tickets = new Map();
  for (const { agents } of sessions) {
    for (const agent of agents) {
      let branch = agent.branch ?? null;
      let issue = agent.issue ?? null;
      if (!agent.worktree) {
        const n = /#(\d+)/.exec(agent.description);
        const context = n ? github() : null;
        if (n && context) {
          const number = Number(n[1]);
          const pr = context.all.find((p) => p.number === number);
          if (pr) {
            branch = pr.headRefName;
            issue = issueOfBranch(branch);
          } else {
            issue = number;
            branch = known.get(issue) ?? null;
          }
        }
      }
      if (!branch && issue === null) {
        agent.ticket = null;
        continue;
      }
      agent.ticket = branch ?? `#${issue}`;
      if (!tickets.has(agent.ticket)) tickets.set(agent.ticket, { branch, issue, agents: [] });
      tickets.get(agent.ticket).agents.push(agent);
    }
  }
  return tickets;
};

const buildTicket = (t) => {
  const roles = {};
  const tokens = {};
  const toolSeconds = { check: 0, native: 0, wait: 0, other: 0 };
  let checkRuns = 0;
  for (const agent of t.agents) {
    roles[agent.role] = (roles[agent.role] ?? 0) + 1;
    for (const [model, tk] of Object.entries(agent.byModel))
      mergeTokens(tokensFor(tokens, model), tk);
    for (const kind of Object.keys(toolSeconds)) toolSeconds[kind] += agent.toolSeconds[kind];
    checkRuns += agent.checkRuns;
  }
  const reviewers = t.agents.filter((a) => a.role === 'reviewer').sort((a, b) => a.start - b.start);
  const verdicts = reviewers.map((a) => parseVerdict(a.report ?? ''));
  const intervals = t.agents
    .filter((a) => a.start !== null)
    .map((a) => [a.start / 1000, a.end / 1000]);
  return {
    branch: t.branch,
    issue: t.issue,
    area: null,
    size: null,
    group: 'unknown',
    agents: roles,
    calls: sum(t.agents.map((a) => a.calls)),
    tokens,
    cost: costOf(tokens),
    agentSeconds: Math.round(unionSeconds(intervals)),
    toolSeconds: Object.fromEntries(
      Object.entries(toolSeconds).map(([k, v]) => [k, Math.round(v)]),
    ),
    checkRuns,
    reviews: reviewers.length,
    firstReviewClean: verdicts.length ? verdicts[0].verdict === 'clean' : null,
    reachedClean: verdicts.length ? verdicts.at(-1).verdict === 'clean' : null,
    findingsPerReview: verdicts.length ? mean(verdicts.map((v) => v.findings)) : null,
    pr: null,
    ciFailures: null,
    queueRemovals: null,
    ownerComments: null,
    followUpFixes: null,
    reverted: null,
  };
};

// ---------- GitHub

const makeGh = () => {
  let warned = false;
  const gh = (args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1 << 28,
    });
  const json = (args) => JSON.parse(gh(args));
  const warn = (error) => {
    if (warned) return;
    warned = true;
    const why = String(error?.stderr || error?.message || error).split('\n')[0];
    console.error(`warning: gh failed (${why}); the GitHub fields are null`);
  };
  let context;
  const init = () => {
    if (context !== undefined) return context;
    try {
      // The owner is the login of the repository's owner and, when that is an organisation, of the person using gh.
      const owners = [json(['repo', 'view', '--json', 'owner']).owner.login];
      try {
        owners.push(json(['api', 'user']).login);
      } catch {
        // only the login of the repository's owner then
      }
      context = {
        owners,
        all: json([
          'pr',
          'list',
          '--state',
          'all',
          '--limit',
          '500',
          '--json',
          'number,title,body,createdAt,headRefName',
        ]),
      };
    } catch (error) {
      warn(error);
      context = null;
    }
    return context;
  };
  return { gh, json, warn, init };
};

const names = (text, n) => new RegExp(`#${n}(?!\\d)`).test(text ?? '');
const lines = (text) => text.split('\n').filter(Boolean);

const enrich = (ticket, tool) => {
  if (!ticket.branch) return;
  const context = tool.init();
  if (!context) return;
  try {
    const prs = tool.json([
      'pr',
      'list',
      '--state',
      'all',
      '--head',
      ticket.branch,
      '--json',
      'number,state,createdAt,mergedAt,additions,deletions',
    ]);
    const pr =
      prs.find((p) => p.state === 'MERGED') ??
      [...prs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!pr) return;
    const number = pr.number;
    const files = tool.json(['pr', 'view', String(number), '--json', 'files']).files;
    const talk = tool.json(['pr', 'view', String(number), '--json', 'comments,reviews']);
    const reviewComments = lines(
      tool.gh([
        'api',
        `repos/{owner}/{repo}/pulls/${number}/comments`,
        '--paginate',
        '--jq',
        '.[].user.login',
      ]),
    );
    const removals = lines(
      tool.gh([
        'api',
        `repos/{owner}/{repo}/issues/${number}/timeline`,
        '--paginate',
        '--jq',
        '.[] | select(.event == "removed_from_merge_queue" or .event == "merged") | .event',
      ]),
    );
    const runs = tool.json([
      'run',
      'list',
      '--branch',
      ticket.branch,
      '--limit',
      '1000',
      '--json',
      'conclusion,event',
    ]);
    const byOwner = (login) => context.owners.includes(login);
    ticket.pr = {
      number,
      state: pr.state,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt ?? null,
      additions: pr.additions,
      deletions: pr.deletions,
    };
    ticket.size = sizeClass(files);
    ticket.area = areaOf(files.map((f) => f.path));
    ticket.group = `${ticket.area}-${ticket.size}`;
    ticket.ciFailures = runs.filter(
      (r) => r.event === 'pull_request' && r.conclusion === 'failure',
    ).length;
    // GitHub also records a removal from the queue when it merges the PR: that one is not a removal.
    ticket.queueRemovals = Math.max(
      0,
      removals.filter((e) => e === 'removed_from_merge_queue').length -
        (removals.includes('merged') ? 1 : 0),
    );
    ticket.ownerComments =
      [...(talk.comments ?? []), ...(talk.reviews ?? [])].filter((c) => byOwner(c.author?.login))
        .length + reviewComments.filter(byOwner).length;
    if (pr.mergedAt) {
      const from = Date.parse(pr.mergedAt);
      const to = from + FOLLOW_UP_DAYS * 86_400_000;
      const others = context.all.filter((p) => p.number !== number);
      ticket.followUpFixes = others.filter((p) => {
        const created = Date.parse(p.createdAt);
        return (
          p.headRefName.startsWith('fix/') &&
          created > from &&
          created <= to &&
          (names(`${p.title}\n${p.body}`, number) ||
            (ticket.issue !== null && names(`${p.title}\n${p.body}`, ticket.issue)))
        );
      }).length;
      ticket.reverted = others.some(
        (p) => p.title.startsWith('Revert "') && names(`${p.title}\n${p.body}`, number),
      );
    }
  } catch (error) {
    tool.warn(error);
  }
};

// ---------- snapshot

export const buildSnapshot = ({ since, until, label, projects, rootPath }) => {
  const from = since ? Date.parse(since) : null;
  const to = until ? Date.parse(until) : null;
  const sessions = readSessions(projectFolders(projects, rootPath), from, to);
  const tool = makeGh();
  const grouped = groupAgents(sessions, tool.init);
  const tickets = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, t]) => {
      const ticket = buildTicket(t);
      enrich(ticket, tool);
      return ticket;
    });

  const allAgents = sessions.flatMap((s) => s.agents);
  const byRole = {};
  for (const role of [...new Set(allAgents.map((a) => a.role))].sort()) {
    const list = allAgents.filter((a) => a.role === role);
    byRole[role] = {
      count: list.length,
      medianFirstContext: median(list.map((a) => a.firstContext).filter((v) => v !== null)),
      medianPeakContext: median(list.map((a) => a.peakContext).filter((v) => v !== null)),
    };
  }
  return {
    version: 1,
    label,
    since: since ?? null,
    until: until ?? null,
    generatedAt: new Date().toISOString(),
    sessions: sessions.map(({ id, main, agents }) => {
      const touched = [...new Set(agents.map((a) => a.ticket).filter(Boolean))].sort();
      const cost = costOf(main.byModel);
      return {
        id,
        start: new Date(main.start).toISOString(),
        end: new Date(main.end).toISOString(),
        calls: main.calls,
        avgContext: main.avgContext,
        peakContext: main.peakContext,
        compactions: main.compactions,
        tokens: main.byModel,
        cost,
        subagents: agents.length,
        tickets: touched,
        costPerTicket: touched.length
          ? Object.fromEntries(
              Object.entries(cost).map(([model, units]) => [
                model,
                Math.round(units / touched.length),
              ]),
            )
          : {},
      };
    }),
    tickets,
    agents: { byRole },
  };
};

// ---------- compare

const KINDS = {
  count: (v) => v.toFixed(1),
  tokens: (v) => `${Math.round(v / 1000)}k`,
  units: (v) =>
    v >= 1e6
      ? `${(v / 1e6).toFixed(1)}M`
      : v >= 1e3
        ? `${(v / 1e3).toFixed(1)}k`
        : String(Math.round(v)),
  rate: (v) => `${Math.round(v * 100)}%`,
};
const format = (v, kind) => (v === null || v === undefined ? 'n/a' : KINDS[kind](v));
const change = (before, after) => {
  if (
    before === null ||
    before === undefined ||
    after === null ||
    after === undefined ||
    before === 0
  )
    return 'n/a';
  const pct = Math.round(((after - before) / before) * 100) || 0;
  return `${pct > 0 ? '+' : ''}${pct}%`;
};
const row = (label, before, after, kind) =>
  `  ${label.padEnd(38)}${format(before, kind).padStart(8)} → ${format(after, kind).padEnd(8)} ${change(before, after)}`.trimEnd();

const present = (list, f) => list.map(f).filter((v) => v !== null && v !== undefined);
const share = (list, f) => {
  const values = present(list, f);
  return values.length ? values.filter(Boolean).length / values.length : null;
};
const average = (list, f) => mean(present(list, f));
const medianOf = (list, f) => median(list.map(f));

const groupMetrics = (tickets, models) => [
  ...models.map((model) => [
    `${model} cost per ticket`,
    medianOf(tickets, (t) => t.cost?.[model] ?? 0),
    'units',
  ]),
  ['agents per ticket', medianOf(tickets, (t) => sum(Object.values(t.agents ?? {}))), 'count'],
  ['reviews per ticket', medianOf(tickets, (t) => t.reviews ?? 0), 'count'],
  ['agent minutes per ticket', medianOf(tickets, (t) => (t.agentSeconds ?? 0) / 60), 'count'],
  ['check minutes per ticket', medianOf(tickets, (t) => (t.toolSeconds?.check ?? 0) / 60), 'count'],
  [
    'native minutes per ticket',
    medianOf(tickets, (t) => (t.toolSeconds?.native ?? 0) / 60),
    'count',
  ],
  ['wait minutes per ticket', medianOf(tickets, (t) => (t.toolSeconds?.wait ?? 0) / 60), 'count'],
  ['check runs per ticket', medianOf(tickets, (t) => t.checkRuns ?? 0), 'count'],
  ['first review clean rate', share(tickets, (t) => t.firstReviewClean), 'rate'],
  ['reached clean rate', share(tickets, (t) => t.reachedClean), 'rate'],
  ['findings per review', average(tickets, (t) => t.findingsPerReview), 'count'],
  ['CI failures per ticket', average(tickets, (t) => t.ciFailures), 'count'],
  ['queue removals per ticket', average(tickets, (t) => t.queueRemovals), 'count'],
  ['owner comments per ticket', average(tickets, (t) => t.ownerComments), 'count'],
  ['follow-up fixes per ticket', average(tickets, (t) => t.followUpFixes), 'count'],
  ['revert rate', share(tickets, (t) => t.reverted), 'rate'],
];

export const compareSnapshots = (before, after) => {
  const out = [`usage compare: ${before.label} → ${after.label}`, ''];

  out.push('Agents by role');
  const roles = [
    ...new Set([
      ...Object.keys(before.agents?.byRole ?? {}),
      ...Object.keys(after.agents?.byRole ?? {}),
    ]),
  ].sort();
  const perTicket = (snap, role) =>
    snap.tickets.length
      ? sum(snap.tickets.map((t) => t.agents?.[role] ?? 0)) / snap.tickets.length
      : null;
  for (const role of roles) {
    const b = before.agents?.byRole?.[role];
    const a = after.agents?.byRole?.[role];
    out.push(
      row(`${role} agents per ticket`, perTicket(before, role), perTicket(after, role), 'count'),
    );
    out.push(
      row(
        `${role} median first context`,
        b?.medianFirstContext ?? null,
        a?.medianFirstContext ?? null,
        'tokens',
      ),
    );
    out.push(
      row(
        `${role} median peak context`,
        b?.medianPeakContext ?? null,
        a?.medianPeakContext ?? null,
        'tokens',
      ),
    );
  }

  const groupsOf = (snap) => [...new Set(snap.tickets.map((t) => t.group ?? 'unknown'))];
  const common = groupsOf(before)
    .filter((g) => groupsOf(after).includes(g))
    .sort();
  for (const group of ['all', ...common]) {
    const pick = (snap) =>
      group === 'all' ? snap.tickets : snap.tickets.filter((t) => (t.group ?? 'unknown') === group);
    const b = pick(before);
    const a = pick(after);
    const few = b.length < FEW || a.length < FEW ? ' (few)' : '';
    out.push('', `${group} (n ${b.length} → ${a.length})${few}`);
    const models = [...new Set([...b, ...a].flatMap((t) => Object.keys(t.cost ?? {})))].sort();
    const left = groupMetrics(b, models);
    const right = groupMetrics(a, models);
    for (const [i, [label, value, kind]] of left.entries())
      out.push(row(label, value, right[i][1], kind));
  }

  out.push('', 'Sessions');
  const sessionMetrics = (snap) => {
    const list = snap.sessions ?? [];
    const withContext = list.filter((s) => s.avgContext !== null && s.avgContext !== undefined);
    return {
      avg: median(present(withContext, (s) => s.avgContext)),
      peak: median(present(withContext, (s) => s.peakContext)),
      compactions: mean(present(list, (s) => s.compactions)),
      cost: (model) => median(present(list, (s) => s.costPerTicket?.[model])),
    };
  };
  const sb = sessionMetrics(before);
  const sa = sessionMetrics(after);
  out.push(row('session avg context', sb.avg, sa.avg, 'tokens'));
  out.push(row('session peak context', sb.peak, sa.peak, 'tokens'));
  out.push(row('compactions per session', sb.compactions, sa.compactions, 'count'));
  const models = [
    ...new Set(
      [...before.sessions, ...after.sessions].flatMap((s) => Object.keys(s.costPerTicket ?? {})),
    ),
  ].sort();
  for (const model of models)
    out.push(row(`orchestrator ${model} cost per ticket`, sb.cost(model), sa.cost(model), 'units'));
  return `${out.join('\n')}\n`;
};

// ---------- command line

class UsageError extends Error {}

const usageText = () => {
  const lines = readFileSync(SELF, 'utf8').split('\n').slice(1);
  const header = lines.slice(
    0,
    lines.findIndex((line) => !line.startsWith('//')),
  );
  return header.map((line) => line.replace(/^\/\/ ?/, '')).join('\n');
};

const OPTIONS = ['--since', '--until', '--label', '--out', '--projects', '--root'];

const parse = (argv) => {
  const [command, ...rest] = argv;
  if (command === 'compare') {
    if (rest.length !== 2 || rest.some((a) => a.startsWith('--'))) throw new UsageError();
    return { command, files: rest };
  }
  if (command !== 'snapshot') throw new UsageError();
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!OPTIONS.includes(rest[i]) || rest[i + 1] === undefined) throw new UsageError();
    options[rest[i].slice(2)] = rest[i + 1];
  }
  return { command, options };
};

const mainRoot = () => {
  try {
    const common = execFileSync(
      'git',
      ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
    return dirname(common);
  } catch {
    return ROOT;
  }
};

const main = (argv) => {
  let parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(usageText());
    return 2;
  }
  if (parsed.command === 'compare') {
    const [before, after] = parsed.files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
    process.stdout.write(compareSnapshots(before, after));
    return 0;
  }
  const o = parsed.options;
  const label = o.label ?? (o.since ? o.since.slice(0, 10) : 'snapshot');
  const projects =
    o.projects ?? join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
  const snapshot = buildSnapshot({
    since: o.since,
    until: o.until,
    label,
    projects,
    rootPath: o.root ?? mainRoot(),
  });
  const out = resolve(o.out ?? join(ROOT, 'docs/agents/usage', `${label}.json`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `wrote ${out}: ${snapshot.sessions.length} sessions, ${snapshot.tickets.length} tickets, ` +
      `${sum(Object.values(snapshot.agents.byRole).map((r) => r.count))} agents`,
  );
  return 0;
};

if (process.argv[1] === SELF) process.exitCode = main(process.argv.slice(2));
