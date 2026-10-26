#!/usr/bin/env node
// Keep realistic secrets out of tests (E002 #228). A token or key in a test file is a secret scanner's false positive at
// best (GitGuardian's Generic High Entropy Secret, #187, #194, #208, where only the owner can clear the incident) and a
// real credential at worst. A fixture is obviously fake instead: low-entropy and self-describing, such as
// `fake-link-token-for-tests`, never random-looking and never assembled from parts. Only a test whose fixture has to match
// a scanner's pattern (a scanner's own tests, or a key header the script under test checks) may split the prefix that
// pattern matches; the rest stays obviously fake. Its sibling, `scripts/secrets.sh files`, refuses real key material in any file.
//
//   node scripts/secrets-in-tests.mjs [dir]   scan the test files git knows of, new ones too, in dir (default: this
//                                             checkout); scripts/check.sh runs it
//
// Scanned: the tracked code files (TypeScript, JavaScript, Swift, Kotlin, JSON, YAML) of a test path: `*.test.*`,
// `*.spec.*`, `test/`, `tests/`, `e2e/`, `packages/testing`, `apps/ios/*Tests*`, and `apps/android/app/src/{test,
// androidTest,testShared}`. Lockfiles and their integrity hashes are not test files.
//
// A finding is a string literal of 20 or more characters that holds a token that looks random, or several literals that
// together make one: `['aB3dE6gH', 'jK9mN2pQ'].join('')`, `'aB3dE6gH' + 'jK9mN2pQ'`. Findings name file:line and never
// print the value.
//
// The token test. A literal is cut into tokens at whitespace, punctuation and `/` (so a sentence, a URL or a path is a
// row of short words); a token is the longest run of `A-Z a-z 0-9 + = _ -`. A token of 20 or more characters is random-
// looking when its Shannon entropy, in bits per character, reaches
//
//   HEX_ENTROPY   3.0   the token is only hex digits (a hash, a 32-character key): random hex scores 3.4 to 3.8, and
//                       hex cannot score above 4.0
//   TEXT_ENTROPY  3.7   any other token: random base64 of 20 characters scores 3.7 to 4.3 and of 43 characters 4.5 to 5.2
//
// and it is not readable: fewer than READABLE_SHARE (75%) of its characters sit in words of three or more letters (a
// `camelCase` identifier, a test name, `fake-link-token-for-tests`; parts of up to four characters between `-` and `_`
// are tags and not counted). Left alone because they are identifiers, not secrets: a slug or constant name of four or
// more short parts, each all lowercase or all capitals (`NEXT_PUBLIC_POSTHOG_KEY`, `feature-57-hold-a-spot`), a UUID, a
// token that repeats one short unit (`0123456789abcdef` twice), and a token of digits only. Entropy of a short token is
// capped by its length (log2 of it), so the threshold sits near the middle of what random 20-character strings score: a
// 20-23 character random token can slip through.
//
// What slips through, measured on 200,000 seeded random strings each (a guard is a net, not a proof):
//   base64url (`-` and `_`, as link tokens use)   32 characters 0.8%, 43 characters 0.2%: by chance the token reads as
//                                                 words (runs of three letters of one case)
//   hex                                           32 characters 0.01%, 64 characters 0%
//   standard base64 (`+` and `/`)                 32 characters 14%, 43 characters 3.8% (`openssl rand -base64 32`):
//                                                 `/` cuts a token, so one with a `/` in a bad place falls into pieces
//                                                 under 20 characters; counting `/` as part of a token would flag about
//                                                 40 paths and URLs of this repository
//
// Known gaps of the lexer, taken on purpose to keep it small:
//   - a quote that never closes on its line (in a regex such as /["']/) opens no literal: the scan resumes just after
//     it, so the rest of the line is read again and a later quote of the same line may pair up (`/"/; k = '<token>'`
//     is found); the price is that a backtick in such a regex can pair with the next line's template and hide it
//   - a lone backtick in a regex pairs with the next template literal and hides what is in it
//   - a literal inside `${...}` or `\(...)` of another literal is skipped (8 literals in this repository)
//
// A known-safe realistic shape that has to stay goes in scripts/secrets-allowlist.txt with a reason; its header says
// how.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = join(ROOT, 'scripts/secrets-allowlist.txt');

const MIN_LITERAL_LENGTH = 20;
const HEX_ENTROPY = 3.0;
const TEXT_ENTROPY = 3.7;
const READABLE_SHARE = 0.75;
const SHORT_PART = 4;
const SLUG_PART = 10;
const SLUG_MEAN = 7;

const TEST_PATH = [
  /(^|\/)[^/]*\.(test|spec)\.[^/]+$/,
  /(^|\/)(test|tests|e2e)\//,
  /^packages\/testing\//,
  /^apps\/ios\/[^/]*Tests[^/]*\//,
  /^apps\/android\/app\/src\/(test|androidTest|testShared)\//,
];
const CODE_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|swift|kt|kts|json|ya?ml)$/;
const LOCKFILE =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Package\.resolved|gradle\.lockfile)$/;

export const isTestFile = (path) =>
  CODE_EXTENSION.test(path) &&
  !LOCKFILE.test(path) &&
  TEST_PATH.some((pattern) => pattern.test(path));

/** Shannon entropy of a string in bits per character. */
export const entropy = (text) => {
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  const length = [...text].length;
  let bits = 0;
  for (const count of counts.values()) bits -= (count / length) * Math.log2(count / length);
  return bits;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]+$/i;
const DIGITS = /^[0-9]+$/;

/**
 * The share of a token's characters inside words: runs of three or more letters (`Token`, `token`, a capitalised or
 * lowercase word) or three or more capitals. Parts of up to SHORT_PART characters between `-` and `_` (`E008`, `AC6`)
 * are tags, not content, and are left out; a token of nothing but tags has no readable share.
 */
const readableShare = (token) => {
  let letters = 0;
  let length = 0;
  for (const part of token.split(/[-_]/).filter((part) => part.length > SHORT_PART)) {
    for (const word of part.matchAll(/[A-Z][a-z]{2,}|[a-z]{3,}|[A-Z]{3,}(?![a-z])/g))
      letters += word[0].length;
    length += part.length;
  }
  return length === 0 ? 0 : letters / length;
};

/**
 * True when a token is a slug or a constant name: four or more short parts, each all lowercase or all capitals (digits
 * go with either): `NEXT_PUBLIC_POSTHOG_KEY`, `feature-57-hold-a-spot`. A random token cut by `-` and `_` has mixed-case
 * parts and is no slug.
 */
const isSlug = (token) => {
  const parts = token.split(/[-_]/);
  return (
    parts.length >= 4 &&
    parts.every((part) => part.length <= SLUG_PART && /^(?:[a-z0-9]+|[A-Z0-9]+)$/.test(part)) &&
    token.length / parts.length <= SLUG_MEAN
  );
};

/** True when the token is a unit repeated, such as `0123456789abcdef0123456789abcdef`. */
const repeatsAUnit = (token) => {
  for (let unit = 1; unit <= token.length / 2; unit++) {
    if (token.length % unit === 0 && token.slice(0, unit).repeat(token.length / unit) === token)
      return true;
  }
  return false;
};

/** True when one token (no whitespace, 20 or more characters) looks like a random secret. */
export const looksRandom = (token) => {
  if (token.length < MIN_LITERAL_LENGTH) return false;
  if (UUID.test(token) || DIGITS.test(token) || repeatsAUnit(token) || isSlug(token)) return false;
  if (HEX.test(token)) return entropy(token) >= HEX_ENTROPY;
  return entropy(token) >= TEXT_ENTROPY && readableShare(token) < READABLE_SHARE;
};

/** The tokens of a literal's text: runs of `A-Z a-z 0-9 + = _ -` between anything else, with their offsets. */
const tokens = (text) =>
  [...text.matchAll(/[A-Za-z0-9+=_-]{20,}/g)].map((match) => ({
    token: match[0],
    offset: match.index,
  }));

/** The first random-looking token of a text, or undefined. */
const randomToken = (text) => tokens(text).find(({ token }) => looksRandom(token));

// The lexer: the string literals of a file with the line each starts on. Comments are skipped; an interpolation is
// replaced by a space, as an escape such as \n is. It knows enough of each language to find literals, nothing more. What
// differs per language is a property of its row, not a test of which language it is:
//   quotes          the characters that open a literal
//   lineComment     what starts a comment to the end of the line (`#` only after whitespace or at the start)
//   blockComment    whether `/* */` is a comment
//   triple          whether a tripled quote opens a multi-line literal
//   rawTriple       whether that literal takes no escapes (Kotlin `"""`; Swift's `"""` does take them)
//   hashRaw         whether `#"..."#` is a raw literal, closing on a quote and as many hashes (Swift)
//   parenInterpolation  whether `\(` starts an interpolation (Swift)
//   dollarQuotes    the quotes whose literals take `${...}` (a JS template, every Kotlin literal)
const LANGUAGES = {
  js: {
    quotes: `'"\``,
    lineComment: '//',
    blockComment: true,
    triple: false,
    rawTriple: false,
    hashRaw: false,
    parenInterpolation: false,
    dollarQuotes: '`',
  },
  swift: {
    quotes: '"',
    lineComment: '//',
    blockComment: true,
    triple: true,
    rawTriple: false,
    hashRaw: true,
    parenInterpolation: true,
    dollarQuotes: '',
  },
  kotlin: {
    quotes: '"',
    lineComment: '//',
    blockComment: true,
    triple: true,
    rawTriple: true,
    hashRaw: false,
    parenInterpolation: false,
    dollarQuotes: '"',
  },
  data: {
    quotes: `'"`,
    lineComment: '#',
    blockComment: false,
    triple: false,
    rawTriple: false,
    hashRaw: false,
    parenInterpolation: false,
    dollarQuotes: '',
  },
};
const languageOf = (path) => {
  if (/\.swift$/.test(path)) return LANGUAGES.swift;
  if (/\.kts?$/.test(path)) return LANGUAGES.kotlin;
  if (/\.ya?ml$/.test(path)) return LANGUAGES.data;
  return LANGUAGES.js;
};

/** Skips from an interpolation's opening (after `${` or `\(`) to its end; returns the index after it. */
const skipInterpolation = (text, from, open, close) => {
  let depth = 1;
  let index = from;
  while (index < text.length && depth > 0) {
    if (text[index] === open) depth++;
    else if (text[index] === close) depth--;
    index++;
  }
  return index;
};

/** True at a comment that runs to the end of the line. */
const startsLineComment = (language, text, index) =>
  language.lineComment === '#'
    ? text[index] === '#' && (index === 0 || /\s/.test(text[index - 1]))
    : text.startsWith(language.lineComment, index);

/**
 * How a literal opens at `index`: `{ delimiter, opening, multiline, raw, dollar }`, or undefined when none does.
 * `delimiter` closes it, `opening` is the length of what opens it, `multiline` whether it may span lines, `raw` whether
 * it takes no escapes and `dollar` whether it takes `${...}`.
 */
const opening = (language, text, index) => {
  const char = text[index];
  if (language.hashRaw && char === '#') {
    const hashes = /^#+/.exec(text.slice(index))[0];
    if (text[index + hashes.length] !== '"') return undefined;
    const triple = text.startsWith('"""', index + hashes.length);
    const quotes = triple ? '"""' : '"';
    return {
      delimiter: quotes + hashes,
      opening: hashes.length + quotes.length,
      multiline: triple,
      raw: true,
      dollar: false,
    };
  }
  if (!language.quotes.includes(char)) return undefined;
  const triple = language.triple && text.startsWith(char.repeat(3), index);
  const delimiter = triple ? char.repeat(3) : char;
  return {
    delimiter,
    opening: delimiter.length,
    multiline: triple || char === '`',
    raw: triple && language.rawTriple,
    dollar: language.dollarQuotes.includes(char),
  };
};

/**
 * The string literals of source text: `{ value, start, end, line }`. `value` is the text without quotes. A literal that
 * never closes is not one: the scan resumes just after its opening quote, so what follows is still read.
 */
export const literals = (text, path = 'file.ts') => {
  const language = languageOf(path);
  const found = [];
  const lineAt = (offset) => text.slice(0, offset).split('\n').length;
  let index = 0;
  while (index < text.length) {
    if (startsLineComment(language, text, index)) {
      while (index < text.length && text[index] !== '\n') index++;
      continue;
    }
    if (language.blockComment && text.startsWith('/*', index)) {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    const open = opening(language, text, index);
    if (!open) {
      index++;
      continue;
    }
    const start = index;
    let cursor = index + open.opening;
    let value = '';
    let closed = false;
    while (cursor < text.length) {
      const here = text[cursor];
      if (text.startsWith(open.delimiter, cursor)) {
        closed = true;
        cursor += open.delimiter.length;
        break;
      }
      if (here === '\n' && !open.multiline) break;
      if (here === '\\' && !open.raw) {
        const escaped = text[cursor + 1] ?? '';
        if (escaped === '(' && language.parenInterpolation) {
          cursor = skipInterpolation(text, cursor + 2, '(', ')');
          value += ' ';
          continue;
        }
        value += /[ntr0]/.test(escaped) ? ' ' : escaped;
        cursor += 2;
        continue;
      }
      if (here === '$' && text[cursor + 1] === '{' && open.dollar) {
        cursor = skipInterpolation(text, cursor + 2, '{', '}');
        value += ' ';
        continue;
      }
      value += here;
      cursor++;
    }
    if (closed) {
      found.push({ value, start, end: cursor, line: lineAt(start) });
      index = cursor;
    } else {
      index = start + 1;
    }
  }
  return found;
};

/** The line of the token at `offset` of a literal's value, counting from the literal's own first line. */
const lineOfToken = (literal, offset) =>
  literal.line + literal.value.slice(0, offset).split('\n').length - 1;

/**
 * The finding rows of one file: `{ line, kind }`, `kind` being `literal` (a random-looking token in one literal) or
 * `assembled` (literals joined or added up make one).
 */
export const scan = (path, text) => {
  const all = literals(text, path);
  const findings = [];
  const seen = new Set();
  const report = (line, kind) => {
    const key = `${line}:${kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push({ line, kind });
    }
  };

  for (const literal of all) {
    if (literal.value.length < MIN_LITERAL_LENGTH) continue;
    const hit = randomToken(literal.value);
    if (hit) report(lineOfToken(literal, hit.offset), 'literal');
  }

  // Runs of literals that make one value: `a + b + c`, and `[a, b, c].join(…)` / `listOf(a, b).joinToString(…)`.
  const between = (left, right) => text.slice(left.end, right.start);
  for (let from = 0; from < all.length; from++) {
    for (const [glue, joiner] of [
      [/^\s*\+\s*$/, false],
      [/^\s*,\s*$/, true],
    ]) {
      if (from > 0 && glue.test(between(all[from - 1], all[from]))) continue; // a run is reported from its first literal
      let to = from;
      while (to + 1 < all.length && glue.test(between(all[to], all[to + 1]))) to++;
      if (to === from) continue;
      const run = all.slice(from, to + 1);
      let separator = '';
      if (joiner) {
        const before = text.slice(Math.max(0, run[0].start - 12), run[0].start);
        const after = text.slice(run[run.length - 1].end);
        const call =
          /^\s*,?\s*[\])]\s*\.(join|joined|joinToString)\(\s*(?:(["'`])((?:\\.|(?!\2).)*)\2)?\s*\)/.exec(
            after,
          );
        if (!call || !/(\[|listOf\(|arrayOf\()\s*$/.test(before)) continue;
        separator = call[3] ?? (call[1] === 'join' ? ',' : call[1] === 'joinToString' ? ', ' : '');
      }
      if (run.length < 2) continue;
      const whole = run.map((literal) => literal.value).join(joiner ? separator : '');
      if (whole.length >= MIN_LITERAL_LENGTH && randomToken(whole))
        report(run[0].line, 'assembled');
    }
  }
  return findings;
};

const MESSAGE = {
  literal: 'a token that looks like a random secret',
  assembled: 'a value assembled from parts that makes a token that looks like a random secret',
};
const HINT =
  'use an obviously fake, low-entropy, self-describing value (e.g. fake-link-token-for-tests), not a realistic one and not one joined from parts';

/** The allowlist: `path-glob: exact literal  # reason`, one per line. Returns { entries, problems }. */
export const parseAllowlist = (text) => {
  const entries = [];
  const problems = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const match = /^(\S+):\s+(\S+)\s+#\s*(\S.*)$/.exec(line);
    if (!match) {
      problems.push(
        `secrets-allowlist.txt:${index + 1}: expected "path-glob: value  # reason" (a reason is required)`,
      );
      return;
    }
    entries.push({ path: match[1], value: match[2] });
  });
  return { entries, problems };
};

const globToRegExp = (glob) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\0')
      .replace(/\*/g, '[^/]*')
      .replace(/\0/g, '.*')}$`,
  );

/** The findings of one file with allowlisted tokens removed: rows of `{ line, kind }`. */
export const check = (path, text, allowlist = []) => {
  const allowed = allowlist
    .filter((entry) => globToRegExp(entry.path).test(path))
    .map((entry) => entry.value);
  if (allowed.length === 0) return scan(path, text);
  let scrubbed = text;
  for (const value of allowed)
    scrubbed = scrubbed.split(value).join('x'.repeat(Math.min(value.length, 8)));
  return scan(path, scrubbed);
};

const trackedTestFiles = (cwd = ROOT) =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((path) => path !== '' && isTestFile(path));

/** Runs the guard on a checkout; returns the lines to print (empty when clean). */
export const run = (
  cwd = ROOT,
  allowlistText = existsSync(ALLOWLIST) ? readFileSync(ALLOWLIST, 'utf8') : '',
) => {
  const { entries, problems } = parseAllowlist(allowlistText);
  const lines = [...problems];
  for (const path of trackedTestFiles(cwd)) {
    if (!existsSync(join(cwd, path))) continue;
    for (const { line, kind } of check(path, readFileSync(join(cwd, path), 'utf8'), entries)) {
      lines.push(`${path}:${line}: ${MESSAGE[kind]}`);
    }
  }
  if (lines.length > 0)
    lines.push(
      `  fix: ${HINT}; scripts/secrets-allowlist.txt lists what may stay realistic, with a reason`,
    );
  return lines;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lines = run(process.argv[2] ?? ROOT);
  if (lines.length > 0) {
    console.error(lines.join('\n'));
    process.exit(1);
  }
}
