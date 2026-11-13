import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename, join, matchesGlob, relative, resolve } from 'node:path';

// turbo caches `//#test:root` by its `inputs` (turbo.json), so a file a root test reads must be one of them: otherwise
// a change to it can pass from the cache without the test running. Each test file that reads files outside `scripts/`
// records what it reads and checks it here.

const ROOT = join(import.meta.dirname, '..', '..');

/** The inputs of the root tests, as turbo.json lists them. */
export const rootTestInputs = () =>
  JSON.parse(readFileSync(join(ROOT, 'turbo.json'), 'utf8')).tasks['//#test:root'].inputs;

/** The files (paths relative to the repository root) that no glob of `inputs` covers. */
export const uncoveredBy = (inputs, files) =>
  [...new Set(files)]
    // turbo.json itself needs no entry: a task's definition is part of its hash.
    .filter((file) => file !== 'turbo.json')
    .filter((file) => !inputs.some((input) => matchesGlob(file, input)));

/** The files the root tests read that turbo does not take as inputs of them. */
export const uncovered = (files) => uncoveredBy(rootTestInputs(), files);

export const UNCOVERED_MESSAGE = 'add these to the inputs of //#test:root in turbo.json';

// Folders that hold build output, never a file a test means to read.
const BUILD_DIRS = ['.build', 'build', '.gradle', 'node_modules', 'DerivedData'];

/**
 * The files (paths relative to the repository root) under the folder `dir` that git sees (tracked, or new and not
 * ignored, so no `.DS_Store` and no build output), whose name `accept` takes. `root` is the repository to look in (the
 * real one unless a test gives its own).
 */
export const filesUnder = (dir, accept = () => true, root = ROOT) =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', dir], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.split('/').some((part) => BUILD_DIRS.includes(part)))
    .filter((file) => statSync(join(root, file), { throwIfNoEntry: false })?.isFile())
    .filter((file) => accept(basename(file)));

/**
 * Records the files a test reads under `prefixes` (paths relative to the repository root, such as 'apps/ios/'), for
 * `uncovered`. `note(path)` takes an absolute or a relative path, a file or a folder (a folder stands for every file in
 * it, as a recursive copy reads them; `pattern`, a RegExp, keeps the files a recursive grep with `--include` reads),
 * records it and returns it, so a read can be wrapped in place:
 * `readFileSync(note(join(ROOT, 'apps/ios/README.md')))`.
 */
export const readRecorder = (...prefixes) => {
  const reads = new Set();
  const record = (path, pattern) => {
    const file = relative(ROOT, resolve(ROOT, path));
    if (file.startsWith('..') || !prefixes.some((prefix) => `${file}/`.startsWith(prefix))) return;
    if (!statSync(join(ROOT, file), { throwIfNoEntry: false })?.isDirectory()) {
      if (!pattern || pattern.test(file)) reads.add(file);
    } else
      for (const found of filesUnder(file)) if (!pattern || pattern.test(found)) reads.add(found);
  };
  return {
    reads,
    note: (path, pattern) => {
      record(path, pattern);
      return path;
    },
  };
};
