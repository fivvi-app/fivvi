#!/usr/bin/env node
// The lists of docs/engineering/OBSERVABILITY.md that every feature appends to are one entry per line, in a fixed
// order, so two PRs that add different entries edit different lines and don't conflict (E001 #1271). This check holds
// them to it:
//
//   - §4.3 Event catalog: the list of live events (a bullet per event, `- `event_name` (feature, spec)`) and the
//     event tables are sorted by event name; no event is listed twice, in the list or across the tables; and the
//     live events in the list are exactly the events with a Live row in the tables.
//   - §4.4 Testing: the test references (a bullet that starts with the test file's path in backticks) are sorted by
//     that path. Two references to one file are fine.
//
// Sorting is by code unit (`<`), so `sign_in_requested` comes before `signed_in`, as `LC_ALL=C sort` has it.
//
//   node scripts/doc-lists.mjs [dir]   check the document in dir (default: this checkout); scripts/check.sh runs it.
//                                      Prints one line per problem, exits 1 on any.
//
// A document that doesn't exist is not an error. A section this check reads that is gone from it is.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOC = 'docs/engineering/OBSERVABILITY.md';

/** The lines of the section whose heading starts with `heading`, up to the next heading of the same or a higher level. */
const section = (lines, heading) => {
  const start = lines.findIndex((line) => line.startsWith(`${heading} `) || line === heading);
  if (start === -1) return null;
  const level = /^#+/.exec(heading)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const hashes = /^(#+) /.exec(line)?.[1];
    return hashes !== undefined && hashes.length <= level;
  });
  return end === -1 ? rest : rest.slice(0, end);
};

/** Problems of a run of entries that must be in order: `names` as they appear, in `label`. */
const order = (names, label, { unique = true } = {}) => {
  const problems = [];
  const seen = new Set();
  names.forEach((name, i) => {
    if (i > 0 && name < names[i - 1])
      problems.push(`${label}: \`${name}\` must come before \`${names[i - 1]}\``);
    if (unique && seen.has(name)) problems.push(`${label}: \`${name}\` is listed twice`);
    seen.add(name);
  });
  return problems;
};

/** One line per problem with the lists of OBSERVABILITY.md in `dir`. */
export const checkDocLists = (dir = join(import.meta.dirname, '..')) => {
  const path = join(dir, DOC);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n');
  const problems = [];

  const catalog = section(lines, '### 4.3 Event catalog');
  if (catalog === null) problems.push('no "### 4.3 Event catalog" section');
  else {
    const live = [];
    for (const line of catalog.filter((l) => l.startsWith('- '))) {
      const event = /^- `([a-z0-9_]+)` \(/.exec(line)?.[1];
      if (event === undefined)
        problems.push(
          `live events list: "${line}" is not a line of the form "- \`event_name\` (feature, spec)"`,
        );
      else live.push(event);
    }
    problems.push(...order(live, 'live events list'));

    // The tables: a run of consecutive `| `event` | Status | ...` rows is one table.
    const liveRows = new Set();
    const rowEvents = new Set();
    let table = [];
    const endTable = () => {
      problems.push(...order(table, 'event table', { unique: false }));
      table = [];
    };
    for (const line of catalog) {
      const row = /^\| `([a-z0-9_]+)` \| ([^|]*?) \|/.exec(line);
      if (!row) {
        endTable();
        continue;
      }
      const [, event, status] = row;
      if (rowEvents.has(event)) problems.push(`event table: \`${event}\` is listed twice`);
      rowEvents.add(event);
      if (status === 'Live') liveRows.add(event);
      table.push(event);
    }
    endTable();

    for (const event of live)
      if (!liveRows.has(event))
        problems.push(`\`${event}\` is in the live events list but has no Live row`);
    for (const event of liveRows)
      if (!live.includes(event))
        problems.push(`\`${event}\` has a Live row but is not in the live events list`);
  }

  const testing = section(lines, '### 4.4 Testing');
  if (testing === null) problems.push('no "### 4.4 Testing" section');
  else {
    const paths = [];
    for (const line of testing.filter((l) => l.startsWith('- '))) {
      const match = /^- `([^`\s]+)`(.*)$/.exec(line);
      if (!match) {
        problems.push(
          `event testing: "${line}" is not a line of the form "- \`path/to/file.test.ts\` → …"`,
        );
        continue;
      }
      const [, path, rest] = match;
      paths.push(path);
      const other = /`([^`\s]+\.test\.[a-z]+)`/.exec(rest)?.[1];
      if (other !== undefined)
        problems.push(
          `event testing: \`${path}\` also names \`${other}\`; give each test its own bullet, under its full path`,
        );
    }
    problems.push(...order(paths, 'event testing', { unique: false }));
  }
  return problems;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkDocLists(process.argv[2]);
  for (const problem of problems) console.log(`${DOC}: ${problem}`);
  process.exit(problems.length === 0 ? 0 : 1);
}
