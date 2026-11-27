#!/usr/bin/env node
// The files that PRs collide on, and the two rules that read them (E001 #1485, spec #1481). Pure functions over the
// open PRs as scripts/_lib.sh `open_prs_json` reads them (`number`, `headRefName`, `closingIssuesReferences`, `files` as
// a list of paths), so the same list serves both scripts and nothing here reads GitHub or git itself.
//
//   node scripts/hot-files.mjs tagged                 stdin: [{number, title}] of tickets; prints the ones whose title
//                                                     tags say they change the API (`API`) or change a migration (`DB`), as
//                                                     a JSON list: the only tickets that can be held
//   node scripts/hot-files.mjs holds                  stdin: {prs, tickets: [{number, title}]}; prints [{number, waits:
//                                                     [{pr, reason}]}] for each ticket that must wait: reason is `API
//                                                     contract` (the ticket is tagged API and another open PR changes
//                                                     packages/contract/openapi.json) or `migration` (tagged DB and
//                                                     another open PR changes a file under packages/database/migrations/);
//                                                     one entry per reason, the lowest PR number. A ticket's own PR (the
//                                                     branch named after it, or a PR that closes it) never holds it. []
//                                                     when none waits
//   node scripts/hot-files.mjs hot                    stdin: [path]; prints the hot ones as a JSON list ([] when none): a
//                                                     branch without one needs no read of the open PRs
//   node scripts/hot-files.mjs overlap                stdin: {prs, changed: [path], branch, issues: [n]}; prints [{pr,
//                                                     title, files}]: each other open PR that changes a hot file this
//                                                     branch changes, with those files (sorted). Not the PR of `branch`
//                                                     itself and not a PR that closes one of `issues` (the same ticket or
//                                                     slice)
//
// The hot files are the contract and the generated files (the generated paths of scripts/regenerate.mjs, the one list
// of them), the migrations, and the sorted lists and catalogs that spec #1481 keeps in order because most PRs append
// to them. The product and decision docs stay out: they are owner-only and out of the spec's scope.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOC } from './doc-lists.mjs';
import { GROUPS } from './regenerate.mjs';

export const CONTRACT_SPEC = 'packages/contract/openapi.json';
export const MIGRATIONS = 'packages/database/migrations';

/** The lists and catalogs every PR appends to, kept sorted by #1272 and #1483. */
export const SORTED_LISTS = [
  DOC,
  'packages/api/lint/repository-only-imports.test.ts',
  'packages/api/test/isolation/isolation-cases.ts',
  'packages/database/README.md',
  'packages/database/src/index.ts',
  'packages/domain/src/index.ts',
  'packages/i18n/comments.json',
  'packages/i18n/en.json',
  'packages/i18n/nl-NL.json',
];

/** Files and directories (a directory covers everything under it). */
export const HOT_FILES = [
  ...new Set([
    CONTRACT_SPEC,
    MIGRATIONS,
    ...SORTED_LISTS,
    ...GROUPS.flatMap((group) => group.generated),
  ]),
].sort();

const under = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);
const underAny = (path, prefixes) => prefixes.some((prefix) => under(path, prefix));

export const isHot = (path) => underAny(path, HOT_FILES);

/** The tags in the parentheses of a ticket title: `(DB, domain, API)` gives DB, domain, API. */
export const tagsOf = (title) =>
  new Set(
    [...String(title ?? '').matchAll(/\(([^()]*)\)/g)].flatMap((match) =>
      match[1].split(',').map((tag) => tag.trim()),
    ),
  );

/** What a ticket's tags say it changes: the API contract (`API`), the database migrations (`DB`). */
export const kindsOf = (title) => {
  const tags = tagsOf(title);
  return { contract: tags.has('API'), migration: tags.has('DB') };
};

const BRANCH_ISSUE = /^[a-z]+\/(\d+)-/;

/** Whether PR `pr` is the PR of one of `issues` (its branch is named after it or it closes it), or of `branch`. */
const isOwn = (pr, { branch = '', issues = [] }) => {
  if (branch !== '' && pr.headRefName === branch) return true;
  const wanted = new Set(issues.map(String));
  const named = BRANCH_ISSUE.exec(pr.headRefName ?? '')?.[1];
  if (named !== undefined && wanted.has(named)) return true;
  return (pr.closingIssuesReferences ?? []).some((issue) => wanted.has(String(issue.number)));
};

const filesOf = (pr) =>
  (pr.files ?? []).map((file) => (typeof file === 'string' ? file : file.path));

/** The tickets of `tickets` that can be held by their tags. */
export const tagged = (tickets) =>
  tickets.filter((ticket) => {
    const kinds = kindsOf(ticket.title);
    return kinds.contract || kinds.migration;
  });

/**
 * For each ticket that has to wait, the open PR it waits for per reason (the lowest number). A ticket without an `API`
 * or `DB` tag is never held, and a PR never holds its own ticket.
 */
export const holds = (prs, tickets) => {
  const out = [];
  for (const ticket of tickets) {
    const kinds = kindsOf(ticket.title);
    const others = prs
      .filter((pr) => !isOwn(pr, { issues: [ticket.number] }))
      .sort((a, b) => a.number - b.number);
    const waits = [];
    if (kinds.contract) {
      const holder = others.find((pr) => filesOf(pr).includes(CONTRACT_SPEC));
      if (holder) waits.push({ pr: holder.number, reason: 'API contract' });
    }
    if (kinds.migration) {
      const holder = others.find((pr) => filesOf(pr).some((file) => under(file, MIGRATIONS)));
      if (holder) waits.push({ pr: holder.number, reason: 'migration' });
    }
    if (waits.length > 0) out.push({ number: ticket.number, waits });
  }
  return out;
};

/** Each other open PR that changes a hot file the branch changes, with those files. */
export const overlap = (prs, changed, own) => {
  const mine = new Set(changed.filter(isHot));
  if (mine.size === 0) return [];
  const out = [];
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    if (isOwn(pr, own)) continue;
    const shared = [...new Set(filesOf(pr))].filter((file) => mine.has(file)).sort();
    if (shared.length > 0) out.push({ pr: pr.number, title: pr.title ?? '', files: shared });
  }
  return out;
};

const usage = () => {
  console.error('Usage: hot-files.mjs tagged | holds | overlap  (JSON on stdin, see the header)');
  process.exit(2);
};

const input = () => {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    console.error('error: stdin is not JSON');
    process.exit(1);
  }
};

const run = () => {
  const [command, ...rest] = process.argv.slice(2);
  if (rest.length > 0) usage();
  if (command === 'hot') {
    console.log(JSON.stringify(input().filter(isHot)));
  } else if (command === 'tagged') {
    console.log(JSON.stringify(tagged(input())));
  } else if (command === 'holds') {
    const { prs, tickets } = input();
    console.log(JSON.stringify(holds(prs, tickets)));
  } else if (command === 'overlap') {
    const { prs, changed, branch, issues } = input();
    console.log(JSON.stringify(overlap(prs, changed, { branch, issues })));
  } else {
    usage();
  }
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) run();
