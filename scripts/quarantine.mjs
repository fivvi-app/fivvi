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
// (`@concurrency`) or permission (`@permission`) tests. Vitest and Playwright put the marker in the test title; the form
// for the other runners is chosen with their list readers.
//
//   node scripts/quarantine.mjs [dir]   check the lists in dir (default: quarantine/ of this checkout); prints one
//                                       line per problem and exits 1 on any.
//   node scripts/quarantine.mjs --count <runner>
//                                       prints the number of entries in the list of the runner: the Quarantine job of
//                                       ci.yml reads it to run a runner's tests only when it has some.
//
// The readers (E002 #1361): `quarantineSelection(runner)` is what Vitest (the shared preset, packages/testing) and Playwright
// (apps/web/playwright.config.ts) call. It reads the list of its runner, with the parser the rule uses, and returns the
// pattern of the listed tests: `exclude` in the required jobs (`Checks (Linux)`, `E2E (Linux)`), which leave them out, and
// `only` in the `Quarantine` job (FIVVI_QUARANTINE=only), which runs exactly them. A test is named by its full name, as
// each runner prints it, without file or project: the titles of its describe blocks and its own, joined by ` > ` for Vitest
// (`checkout > pays an invoice`) and by ` › ` for Playwright (`checkout › pays an invoice`).
//
// scripts/check.sh runs it whatever changed, and `Checks (Linux)` runs it as the turbo task //#check:quarantine, which
// turbo.json keeps out of its cache: a cached result would not run again when only the date passes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The runners that have a list: quarantine/<runner>.txt. */
export const LISTS = ['vitest', 'playwright', 'xctest', 'compose', 'maestro'];
/** The markers of the tests that are never quarantined. */
export const MARKERS = ['@isolation', '@concurrency', '@permission'];
/** The longest a test stays on the list, in days from the day it was added. */
export const MAX_DAYS = 7;

/** Where the lists are: this checkout's quarantine/, or FIVVI_QUARANTINE_DIR (the tests of the readers). */
const defaultDir = () =>
  process.env.FIVVI_QUARANTINE_DIR || join(import.meta.dirname, '..', 'quarantine');

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

/** The entry lines of a list with their line numbers: comments and blank lines are left out. */
const entryLines = (text) =>
  text
    .split('\n')
    .map((raw, i) => ({ number: i + 1, line: raw.trim() }))
    .filter(({ line }) => line !== '' && !line.startsWith('#'));

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
    for (const { number, line } of entryLines(readFileSync(join(dir, file), 'utf8'))) {
      const where = `${file}:${number}`;
      for (const problem of checkEntry(line, today)) problems.push(`${where}: ${problem}`);
      const test = line.split('|')[0].trim();
      if (seen.has(test)) problems.push(`${where}: "${test}" is listed twice`);
      seen.add(test);
    }
  }
  return problems;
};

/**
 * The entries of the list of `runner` in `dir`: [{test, bug, added, end}], without checking them (checkQuarantine does).
 * A folder or a list that does not exist has none.
 */
export const readList = (runner, { dir = defaultDir() } = {}) => {
  const file = join(dir, `${runner}.txt`);
  if (!existsSync(file)) return [];
  return entryLines(readFileSync(file, 'utf8')).map(({ line }) => {
    const [test = '', bug = '', added = '', end = ''] = line.split('|').map((part) => part.trim());
    return { test, bug, added, end };
  });
};

/**
 * 'only' in the Quarantine job (FIVVI_QUARANTINE=only): run exactly the listed tests. 'exclude' otherwise: the required
 * jobs, and every local run, leave them out.
 */
export const quarantineMode = (env = process.env) => {
  const value = env.FIVVI_QUARANTINE ?? '';
  if (value === '') return 'exclude';
  if (value === 'only') return 'only';
  throw new Error(`FIVVI_QUARANTINE must be "only" or not set, not "${value}"`);
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// What a runner's own pattern needs of an entry. Vitest matches the titles joined by ` > `. Playwright greps a title of its
// own: the project, the file and then the titles of the describe blocks and the test, joined by a space (a leading space
// when the root's empty title is part of it, which depends on where Playwright greps) and followed by the tags it finds
// in them (`@smoke`, also the ones the title already has).
const FORM = {
  vitest: { head: '^', name: (test) => test, tail: '' },
  playwright: {
    head: '^ ?\\S+ \\S+ ',
    name: (test) => test.replaceAll(' › ', ' '),
    tail: '(?: @\\S+)*',
  },
};

/**
 * What a runner's selection is, from the list of `runner`: `only` is the pattern of exactly the listed tests, set in mode
 * 'only' (a pattern that matches nothing when the list is empty); `exclude` is the same pattern in mode 'exclude', set
 * when the list has an entry. Playwright takes them as `grep` and `grepInvert`.
 */
export const quarantineSelection = (
  runner,
  { dir = defaultDir(), mode = quarantineMode() } = {},
) => {
  const form = FORM[runner];
  if (!form) throw new Error(`${runner} has no list reader (${Object.keys(FORM).join(', ')})`);
  const names = readList(runner, { dir }).map(({ test }) => escapeRegExp(form.name(test)));
  const listed =
    names.length > 0 ? new RegExp(`${form.head}(?:${names.join('|')})${form.tail}$`) : undefined;
  if (mode === 'only') return { only: listed ?? /(?!)/, exclude: undefined };
  return { only: undefined, exclude: listed };
};

/**
 * Vitest's `testNamePattern` (it has no inverse): the listed tests in mode 'only', everything but them in mode 'exclude',
 * and undefined (no filter) when the required jobs have nothing to leave out.
 */
export const vitestTestNamePattern = (options) => {
  const { only, exclude } = quarantineSelection('vitest', options);
  if (only) return only;
  return exclude ? new RegExp(`^(?!${exclude.source})`) : undefined;
};

function main() {
  if (process.argv[2] === '--count') {
    const runner = process.argv[3];
    if (!LISTS.includes(runner)) {
      console.error(`--count needs a runner: ${LISTS.join(', ')}`);
      process.exit(2);
    }
    console.log(readList(runner).length);
    return;
  }
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
