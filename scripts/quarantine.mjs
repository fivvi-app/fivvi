#!/usr/bin/env node
// The rule that keeps the quarantine lists honest (ADR-025, amendment of 12 November 2026, step 4; TESTING.md §8).
//
// A flaky test that removes a PR from the merge queue is quarantined first and fixed within the week. Each test runner
// (Vitest, Playwright, XCTest, Compose, Maestro) has one list in quarantine/<runner>.txt; a quarantined test still runs
// (in the Quarantine job), it only leaves the required jobs. The lists live outside every guardrail path
// (scripts/high-risk-paths.txt, group `quarantine`), so this rule is what limits what they may hold.
//
// One entry per line: `test | bug | added | end`
//   test   the full name of the test as its runner reports it (it can't contain a `|`)
//   bug    the issue number of the bug for the real fix, `#1400`
//   added  the date the entry was added, YYYY-MM-DD
//   end    the last day the test may stay on the list, YYYY-MM-DD, at most 7 days after `added`
// A line that starts with `#` is a comment; blank lines are ignored.
//
// The rule fails on an entry without a bug, an added date or an end date, an end date more than 7 days after the added
// date, an end date that has passed (an expired entry stops every PR until its fix takes the test off the list), and on
// a test whose name carries a marker of a kind that is never quarantined: tenant isolation (`@isolation`), concurrency
// (`@concurrency`) or permission (`@permission`) tests. Vitest and Playwright put the marker in the test title; a Compose
// test has the annotation @Isolation, @Concurrency or @Permission and a Maestro flow the tag `isolation`, `concurrency` or
// `permission` in its header, which scripts/quarantine-android.mjs reads from the source; XCTest's form comes with its reader.
//
//   node scripts/quarantine.mjs [dir]   check the lists in dir (default: quarantine/ of this checkout); prints one
//                                       line per problem and exits 1 on any.
//
// scripts/check.sh runs it whatever changed, and `Checks (Linux)` runs it as the turbo task //#check:quarantine, which
// turbo.json keeps out of its cache: a cached result would not run again when only the date passes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markerProblems } from './quarantine-android.mjs';

/** The runners that have a list: quarantine/<runner>.txt. */
export const LISTS = ['vitest', 'playwright', 'xctest', 'compose', 'maestro'];
/** The markers of the tests that are never quarantined. */
export const MARKERS = ['@isolation', '@concurrency', '@permission'];
/** The longest a test stays on the list, in days from the day it was added. */
export const MAX_DAYS = 7;

const FIELDS = ['test', 'bug', 'added date', 'end date'];
const DAY = 24 * 60 * 60 * 1000;
const MARKER = new RegExp(`(?<![\\w@])(${MARKERS.join('|')})(?![\\w-])`);

/** The date `YYYY-MM-DD` as a UTC time, or null when it is not a real date. */
const parseDate = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== text ? null : time;
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** The problems of one entry line, without the position. */
const checkEntry = (line, today) => {
  const parts = line.split('|').map((part) => part.trim());
  if (parts.length > FIELDS.length)
    return [
      'too many fields: an entry has 4 fields (test | bug | added | end), and a test name has no `|`',
    ];
  const missing = FIELDS.slice(1).filter((_, i) => (parts[i + 1] ?? '') === '');
  const problems = [];
  if (parts[0] === '') problems.push('no test name');
  if (missing.length > 0) {
    const names = missing.map((field) => `no ${field}`);
    problems.push(
      names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0],
    );
  }
  const [test, bug = '', addedText = '', endText = ''] = parts;
  const marker = MARKER.exec(test);
  if (marker)
    problems.push(
      `the test is marked ${marker[1]}: tenant isolation, concurrency and permission tests are never quarantined; fix the test or revert the change that broke it`,
    );
  if (bug !== '' && !/^#\d+$/.test(bug))
    problems.push(`the bug must be an issue number like #1400, not "${bug}"`);
  const added = addedText === '' ? null : parseDate(addedText);
  const end = endText === '' ? null : parseDate(endText);
  if (addedText !== '' && added === null)
    problems.push(`the added date must be a date as YYYY-MM-DD, not "${addedText}"`);
  if (endText !== '' && end === null)
    problems.push(`the end date must be a date as YYYY-MM-DD, not "${endText}"`);
  if (added !== null && addedText > today)
    problems.push(`the added date ${addedText} is in the future`);
  if (added !== null && end !== null) {
    if (end < added) problems.push(`the end date ${endText} is before the added date ${addedText}`);
    else if ((end - added) / DAY > MAX_DAYS)
      problems.push(
        `the end date ${endText} is more than ${MAX_DAYS} days after the added date ${addedText}`,
      );
  }
  if (end !== null && endText < today)
    problems.push(
      `expired on ${endText}: fix the test (bug ${bug || 'missing'}) and take it off the list`,
    );
  return problems;
};

/**
 * One line per problem with the lists in `dir`. `today` is the UTC day as YYYY-MM-DD. A folder that doesn't exist, and
 * a list that doesn't exist, have no entries and no problems.
 */
export const checkQuarantine = ({
  dir = join(import.meta.dirname, '..', 'quarantine'),
  today = todayUtc(),
  root = join(import.meta.dirname, '..'),
} = {}) => {
  if (!existsSync(dir)) return [];
  const problems = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.txt')) continue;
    const runner = file.slice(0, -'.txt'.length);
    if (!LISTS.includes(runner)) {
      problems.push(`${file}: not a list of a runner (${LISTS.join(', ')})`);
      continue;
    }
    const seen = new Set();
    readFileSync(join(dir, file), 'utf8')
      .split('\n')
      .forEach((raw, i) => {
        const line = raw.trim();
        if (line === '' || line.startsWith('#')) return;
        const where = `${file}:${i + 1}`;
        for (const problem of checkEntry(line, today)) problems.push(`${where}: ${problem}`);
        const test = line.split('|')[0].trim();
        // Compose and Maestro tests carry their marker in the source (scripts/quarantine-android.mjs), not in the name.
        for (const problem of markerProblems(runner, test, { root, markers: MARKERS }))
          problems.push(`${where}: ${problem}`);
        if (seen.has(test)) problems.push(`${where}: "${test}" is listed twice`);
        seen.add(test);
      });
  }
  return problems;
};

function main() {
  const dir = process.argv[2];
  const problems = checkQuarantine(dir ? { dir } : {});
  if (problems.length === 0) {
    console.log('quarantine lists: ok');
    return;
  }
  for (const problem of problems) console.log(problem);
  console.log(
    `quarantine lists: ${problems.length} problem${problems.length === 1 ? '' : 's'} (TESTING.md §8, ADR-025)`,
  );
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
