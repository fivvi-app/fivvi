import { readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';

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
