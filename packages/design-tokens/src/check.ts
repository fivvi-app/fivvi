import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { generatedDir, renderOutputs } from './build.ts';
import { contrastResults, describeFailure } from './contrast.ts';
import { nativeDirs } from './native.ts';
import { readTokenSource, type TokenSource, TokenSourceError } from './source.ts';

export const checkNames = ['generated', 'contrast'] as const;
export type CheckName = (typeof checkNames)[number];

export interface CheckResult {
  name: CheckName;
  problems: string[];
  /** One line describing what passed, for the CLI. */
  summary: string;
}

/** Directories whose every file the build writes: the web outputs and the native sources. */
const ownedDirs = [generatedDir, ...nativeDirs];

/** Generated files that differ from what the build would write, are missing, or shouldn't exist. */
export async function staleOutputs(root: string, expected: Map<string, string>): Promise<string[]> {
  const stale: string[] = [];
  for (const [file, content] of expected) {
    const actual = await readFile(path.join(root, file), 'utf8').catch(() => undefined);
    if (actual === undefined) stale.push(`${file} is missing`);
    else if (actual !== content) stale.push(`${file} is out of date`);
  }
  const existing = await Promise.all(
    ownedDirs.map((dir) =>
      readdir(path.join(root, dir), { recursive: true, withFileTypes: true }).catch(() => []),
    ),
  );
  for (const entry of existing.flat()) {
    if (!entry.isFile()) continue;
    const file = path
      .relative(root, path.join(entry.parentPath, entry.name))
      .split(path.sep)
      .join('/');
    if (!expected.has(file)) stale.push(`${file} is not produced by the build; delete it`);
  }
  return stale;
}

type Outcome<T> = { value: T } | { problems: string[] };

/** Runs a step, turning an incomplete token source into problems instead of an exception. */
async function attempt<T>(step: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { value: await step() };
  } catch (error) {
    if (error instanceof TokenSourceError) return { problems: error.problems };
    throw error;
  }
}

/**
 * The guardrails of ADR-015, run by `pnpm check` (turbo):
 * - `generated`: the build regenerates every output (web, Swift, Kotlin) in memory; each committed
 *   file must match.
 * - `contrast`: every declared pair meets its WCAG minimum in light and dark mode.
 */
export async function runChecks(
  root: string,
  names: readonly CheckName[] = checkNames,
  givenSource?: TokenSource,
): Promise<CheckResult[]> {
  const source = await attempt(async () => givenSource ?? (await readTokenSource(root)));
  const results: CheckResult[] = [];
  for (const name of names) {
    if ('problems' in source) {
      results.push({ name, problems: source.problems, summary: '' });
      continue;
    }
    switch (name) {
      case 'generated': {
        const outputs = await attempt(() => renderOutputs(source.value));
        let problems = 'problems' in outputs ? outputs.problems : [];
        if ('value' in outputs) {
          problems = await staleOutputs(root, outputs.value);
          if (problems.length > 0) {
            problems.push(
              'Run `pnpm --filter @fivvi/design-tokens generate` and commit the result.',
            );
          }
        }
        results.push({ name, problems, summary: 'generated files are up to date' });
        break;
      }
      case 'contrast': {
        const checked = await attempt(() => contrastResults(source.value));
        const problems =
          'problems' in checked
            ? checked.problems
            : checked.value.filter((result) => !result.passes).map(describeFailure);
        results.push({
          name,
          problems,
          summary: `${source.value.pairs.length} pairs meet WCAG AA in light and dark`,
        });
        break;
      }
    }
  }
  return results;
}
