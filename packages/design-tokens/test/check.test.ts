import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { webOutputs } from '../src/build.ts';
import { sourceFiles, type TokenTree } from '../src/source.ts';
import { withoutToken, withValue } from './tokens.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');
// Scratch copies stay inside the package (ignored with node_modules), not in the system temp directory.
const scratchDir = path.join(packageRoot, 'node_modules/.cache/design-tokens-test');

describe('E007 design tokens check (what `pnpm check` runs)', () => {
  let root: string;

  beforeEach(async () => {
    await mkdir(scratchDir, { recursive: true });
    root = await mkdtemp(path.join(scratchDir, 'check-'));
    for (const dir of ['tokens', 'generated']) {
      await cp(path.join(packageRoot, dir), path.join(root, dir), { recursive: true });
    }
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const run = async (...args: string[]) => {
    try {
      const { stdout, stderr } = await promisify(execFile)(
        process.execPath,
        [path.join(packageRoot, 'src/cli.ts'), ...args, '--root', root],
        { env: { ...process.env, NO_COLOR: '1' } },
      );
      return { code: 0, output: stdout + stderr };
    } catch (error) {
      const failed = error as { code: number; stdout: string; stderr: string };
      return { code: failed.code, output: failed.stdout + failed.stderr };
    }
  };

  const editTokens = async (file: string, edit: (tree: TokenTree) => TokenTree) => {
    const tree = JSON.parse(await readFile(path.join(root, file), 'utf8'));
    await writeFile(path.join(root, file), JSON.stringify(edit(tree)));
  };

  it('passes on the committed token source and outputs', async () => {
    const { code, output } = await run('check');
    expect(output).toContain('✓ design-tokens generated');
    expect(output).toContain('✓ design-tokens contrast');
    expect(code).toBe(0);
  });

  it('AC2: check fails on a stale generated file and names it', async () => {
    await editTokens(sourceFiles.light, (tree) =>
      withValue(tree, 'color.action.primary.bg', '#4F4889'),
    );

    const stale = await run('check');
    expect(stale.output).toContain('✗ design-tokens generated: 2 problem(s)');
    expect(stale.output).toContain(`${webOutputs.tokens} is out of date`);
    expect(stale.output).toContain('Run `pnpm --filter @trainer-hub/design-tokens generate`');
    expect(stale.output).not.toContain(`${webOutputs.shadcn} is out of date`);
    expect(stale.code).toBe(1);

    expect((await run('generate')).code).toBe(0);
    const fresh = await run('check');
    expect(fresh.output).toContain('✓ design-tokens generated');
    expect(fresh.code).toBe(0);
  });

  it('AC2: check fails on a hand-edited, missing or stray generated file', async () => {
    const theme = path.join(root, webOutputs.theme);
    await writeFile(theme, (await readFile(theme, 'utf8')).replace('--radius)', '--radius) '));
    await rm(path.join(root, webOutputs.shadcn));
    await writeFile(path.join(root, 'generated/web/old.css'), '');

    const { code, output } = await run('check', 'generated');
    expect(output).toContain(`${webOutputs.theme} is out of date`);
    expect(output).toContain(`${webOutputs.shadcn} is missing`);
    expect(output).toContain('generated/web/old.css is not produced by the build; delete it');
    expect(code).toBe(1);
  });

  it('refuses to generate from a source without a dark value', async () => {
    await editTokens(sourceFiles.dark, (tree) => withoutToken(tree, 'color.bg.subtle'));
    const { code, output } = await run('generate');
    expect(output).toContain('color.bg.subtle has no dark value in tokens/color.dark.json');
    expect(code).toBe(1);
  });
});
