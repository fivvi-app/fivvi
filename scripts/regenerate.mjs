#!/usr/bin/env node
// Generated files are never merged by hand (E001 #1484). Two PRs that each change a route, a string or a token conflict
// in the files generated from them (the contract clients, the native string catalogs, the design-token outputs), and
// the conflict is noise: the right content is whatever the generator writes from the resolved sources. This finishes a
// merge of `origin/main` that way:
//
//   node scripts/regenerate.mjs [--all] [--no-check]
//       1. Refuses (exit 1, naming each file) while a source file still has a conflict, unmerged in the index or with
//          conflict markers in it. Resolve the sources first (en.json, nl-NL.json, comments.json, the token files, the
//          API routes and what their schemas import, the generators themselves). `openapi.json` is no source: the
//          contract generator writes it from the API routes, so it is generated like the clients.
//       2. For each group (contract, i18n, design tokens) with a generated file or a source that the merge touched (a
//          changed or unmerged path against HEAD), takes our side of each conflicted generated file, so no conflict
//          markers reach a generator, runs the group's generator and stages everything under the group's generated
//          paths (`git add -A`, deletions included). A generator that leaves any other file changed or new, unstaged,
//          fails the run, naming the file.
//       3. Runs the group's drift check (`--no-check` leaves that to `scripts/check.sh`). `--all` runs every group,
//          touched or not.
//
// Run it in the middle of a merge, after the sources are resolved, then commit the merge. It changes only the generated
// paths below and stages only them.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND = 'node scripts/regenerate.mjs';

/**
 * One group per generator. `generated` are the paths the generator owns (a directory or a file), `sources` the paths
 * it reads that a person edits (a directory covers everything under it). `openapi.json` is generated
 * (`GENERATED_PATHS.spec` in `packages/contract/scripts/pipeline.ts`): `generate:contract` writes it from the API
 * routes, and the clients from it. What the routes' schemas import (the domain, the database, ...) is a source too.
 */
export const GROUPS = [
  {
    name: 'contract',
    generated: [
      'packages/contract/openapi.json',
      'packages/contract/src/generated',
      'packages/contract/swift/Sources/FivviAPI/Generated',
      'packages/contract/kotlin/generated',
    ],
    sources: [
      'packages/contract/config',
      'packages/contract/tools',
      'packages/contract/scripts',
      'packages/api/src',
      // What the API's route schemas import (`dependencies` of packages/api, the email package it uses, and the
      // locales and trainer words of i18n that feed the spec's enums).
      'packages/domain/src',
      'packages/i18n/src',
      'packages/database/src',
      'packages/observability/src',
      'packages/email/src',
    ],
    generate: ['pnpm', 'generate:contract'],
    check: ['pnpm', '--filter', '@fivvi/contract', 'check'],
  },
  {
    name: 'i18n',
    generated: ['packages/i18n/generated'],
    sources: [
      'packages/i18n/en.json',
      'packages/i18n/nl-NL.json',
      'packages/i18n/comments.json',
      'packages/i18n/src',
    ],
    generate: ['pnpm', '--filter', '@fivvi/i18n', 'generate'],
    check: ['pnpm', '--filter', '@fivvi/i18n', 'check:generated'],
  },
  {
    name: 'design tokens',
    generated: [
      'packages/design-tokens/generated',
      'packages/design-tokens/FivviDesignTokens/Sources/FivviDesignTokens/Generated',
      'packages/design-tokens/kotlin/generated',
    ],
    sources: ['packages/design-tokens/tokens', 'packages/design-tokens/src'],
    generate: ['pnpm', '--filter', '@fivvi/design-tokens', 'generate'],
    check: [
      'pnpm',
      '--filter',
      '@fivvi/design-tokens',
      'exec',
      'node',
      'src/cli.ts',
      'check',
      'generated',
    ],
  },
];

const git = (dir, args) =>
  execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
const gitOk = (dir, args) =>
  spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .status === 0;
const nulList = (text) => text.split('\0').filter(Boolean);

const under = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);
const underAny = (path, prefixes) => prefixes.some((prefix) => under(path, prefix));

const hasMarkers = (text) => /^<{7}( |$)/m.test(text) && /^>{7}( |$)/m.test(text);

/** The paths a merge touches against HEAD (staged, unstaged, unmerged), and the unmerged ones. */
const touched = (dir) => {
  const unmerged = nulList(git(dir, ['diff', '--name-only', '--diff-filter=U', '-z']));
  const changed = nulList(git(dir, ['diff', 'HEAD', '--name-only', '-z']));
  return { unmerged: new Set(unmerged), changed: new Set([...changed, ...unmerged]) };
};

/** Source files that are unmerged or still hold conflict markers, across every group (they all have to be resolved). */
export const sourceConflicts = (dir, groups = GROUPS) => {
  const sources = groups.flatMap((group) => group.sources);
  const { unmerged, changed } = touched(dir);
  const found = new Set();
  for (const path of changed) {
    if (!underAny(path, sources)) continue;
    if (unmerged.has(path)) {
      found.add(path);
      continue;
    }
    const file = join(dir, path);
    if (existsSync(file) && statSync(file).isFile() && hasMarkers(readFileSync(file, 'utf8')))
      found.add(path);
  }
  return [...found].sort();
};

/** Paths with a change that is not staged: modified or deleted in the working tree, or new and untracked. */
const unstagedPaths = (dir) => {
  const paths = new Set(nulList(git(dir, ['diff', '--name-only', '-z'])));
  for (const path of nulList(git(dir, ['ls-files', '--others', '--exclude-standard', '-z'])))
    paths.add(path);
  return paths;
};

/** Takes our side of a conflicted generated file (or drops it when we don't have one), so no markers remain. */
const takeOurs = (dir, path) => {
  if (gitOk(dir, ['checkout', '--ours', '--', path])) return;
  if (!gitOk(dir, ['rm', '-f', '--quiet', '--', path])) rmSync(join(dir, path), { force: true });
};

const exec = (dir, argv, log) => {
  log(`$ ${argv.join(' ')}`);
  const result = spawnSync(argv[0], argv.slice(1), { cwd: dir, stdio: 'inherit' });
  if (result.error) throw new Error(`${argv[0]}: ${result.error.message}`);
  return result.status === 0;
};

/**
 * Regenerates what the merge touched. Returns `{ refused: string[] }` naming the conflicted sources, or
 * `{ ran: string[], failed?: string }`.
 */
export const regenerate = ({
  dir,
  groups = GROUPS,
  all = false,
  check = true,
  log = console.log,
}) => {
  const conflicts = sourceConflicts(dir, groups);
  if (conflicts.length > 0) return { refused: conflicts };

  const { unmerged, changed } = touched(dir);
  const selected = groups.filter(
    (group) =>
      all || [...changed].some((path) => underAny(path, [...group.generated, ...group.sources])),
  );
  const ran = [];
  for (const group of selected) {
    for (const path of [...unmerged].filter((p) => underAny(p, group.generated)))
      takeOurs(dir, path);
    log(`Regenerating ${group.name}…`);
    const unstagedBefore = unstagedPaths(dir);
    if (!exec(dir, group.generate, log))
      return { ran, failed: `the ${group.name} generator failed (${group.generate.join(' ')})` };
    // A path that neither exists nor is tracked (a generator that stopped writing it) makes `git add` fail.
    const present = group.generated.filter(
      (path) => existsSync(join(dir, path)) || git(dir, ['ls-files', '--', path]).trim() !== '',
    );
    if (present.length > 0) git(dir, ['add', '-A', '--', ...present]);
    const left = [...unstagedPaths(dir)].filter((path) => !unstagedBefore.has(path)).sort();
    if (left.length > 0)
      return {
        ran,
        failed: `the ${group.name} generator left files that are not staged (not a generated path of the group, add the path to GROUPS in scripts/regenerate.mjs or fix the generator): ${left.join(', ')}`,
      };
    ran.push(group.name);
    if (check && group.check && !exec(dir, group.check, log))
      return { ran, failed: `the ${group.name} drift check failed (${group.check.join(' ')})` };
  }
  return { ran };
};

const usage = () => {
  console.error(`Usage: ${COMMAND} [--all] [--no-check]`);
  process.exit(2);
};

const run = () => {
  const options = { all: false, check: true };
  for (const flag of process.argv.slice(2)) {
    if (flag === '--all') options.all = true;
    else if (flag === '--no-check') options.check = false;
    else usage();
  }
  try {
    const dir = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const result = regenerate({ dir, ...options });
    if (result.refused) {
      console.error('Not regenerating: these source files still have a conflict.');
      for (const path of result.refused) console.error(`  ${path}`);
      console.error(
        `Resolve them (keep both sides' changes), \`git add\` them, then run \`${COMMAND}\` again. Never merge a generated file by hand.`,
      );
      process.exit(1);
    }
    if (result.failed) {
      console.error(`error: ${result.failed}`);
      process.exit(1);
    }
    console.log(
      result.ran.length === 0
        ? 'nothing to regenerate: the merge touched no generated file or source.'
        : `Regenerated and staged: ${result.ran.join(', ')}. Commit the merge.`,
    );
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) run();
