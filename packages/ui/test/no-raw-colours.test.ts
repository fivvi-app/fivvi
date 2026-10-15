import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findRawColours, vendoredComponents } from '../lint/no-raw-colours.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
// Scratch copies stay inside the package (ignored with node_modules), not in the system temp directory.
const scratchDir = path.join(packageRoot, 'node_modules/.cache/no-raw-colours-test');
// Starting Node takes seconds on a busy CI runner, more than Vitest's 5 s default allows.
const SPAWN_TEST_TIMEOUT_MS = 30_000;

async function runCheck(root: string) {
  try {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [path.join(packageRoot, 'lint/cli.ts'), '--root', root],
      { env: { ...process.env, NO_COLOR: '1' } },
    );
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, output: failed.stdout + failed.stderr };
  }
}

describe('E007 raw-colour guard: what counts as a raw colour', () => {
  const flagged: Record<string, [file: string, source: string, value: string]> = {
    'a short hex': ['app/a.css', '.a { color: #fff; }', '#fff'],
    'a hex with alpha': ['app/a.css', '.a { color: #ffffff80; }', '#ffffff80'],
    'a hex in a string': ['app/a.tsx', "const c = '#1A2B3C';", '#1A2B3C'],
    'rgb()': ['app/a.css', '.a { color: rgb(0 0 0 / 50%); }', 'rgb(0 0 0 / 50%)'],
    'rgba()': ['app/a.ts', "const c = 'rgba(0, 0, 0, 0.5)';", 'rgba(0, 0, 0, 0.5)'],
    'hsl()': ['app/a.css', '.a { color: hsl(210 40% 50%); }', 'hsl(210 40% 50%)'],
    'oklch()': ['app/a.css', '.a { color: oklch(0.7 0.1 250); }', 'oklch(0.7 0.1 250)'],
    'color() in a colour space': ['app/a.css', '.a { color: color(display-p3 1 0 0); }', 'color('],
    'an arbitrary hex class': ['app/a.tsx', '<div className="p-4 bg-[#fff]" />', 'bg-[#fff]'],
    'an arbitrary rgb class with a variant': [
      'app/a.tsx',
      '<div className="hover:text-[rgb(0_0_0)]" />',
      'text-[rgb(0_0_0)]',
    ],
    'an arbitrary color-mix class': [
      'app/a.tsx',
      '<div className="bg-[color-mix(in_oklch,var(--primary),var(--foreground)_5%)]" />',
      'bg-[color-mix(',
    ],
    'an arbitrary named colour': ['app/a.tsx', '<div className="border-[red]" />', 'border-[red]'],
    'a colour after a URL in a string': [
      'app/a.ts',
      "const a = 'https://example.com', c = '#000';",
      '#000',
    ],
    'a colour after a glob in a string': [
      'app/a.ts',
      "const a = ['app/*.ts'], c = '#000'; // */",
      '#000',
    ],
    'a colour after // in a template literal': [
      'app/a.ts',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source of a fixture
      "const a = `${{ b: 1 }.b} // x`, c = '#000';",
      '#000',
    ],
  };

  const allowed: Record<string, [file: string, source: string]> = {
    'token classes': [
      'app/a.tsx',
      '<div className="bg-primary text-muted-foreground ring-ring/50" />',
    ],
    'a token variable': ['app/a.css', '.a { color: var(--primary); }'],
    'a variable as an arbitrary value': [
      'app/a.tsx',
      '<div className="bg-(--primary) text-[var(--x)]" />',
    ],
    'other arbitrary values': [
      'app/a.tsx',
      '<div className="w-[37px] text-[0.8rem] rounded-[min(var(--radius-md),10px)] data-[state=open]:p-2" />',
    ],
    'a colour in a line comment': [
      'app/a.ts',
      '// Was #fff and rgb(0 0 0), see #123.\nconst a = 1;',
    ],
    'a colour in a block comment': ['app/a.css', '/* #fff, issue #123 */\n.a { color: var(--x); }'],
    'a colour in a JSX comment': ['app/a.tsx', '<div>{/* #fff */}</div>'],
    'a colour in a comment after a regex with a quote': ['app/a.ts', 'const r = /"/; // "#fff"'],
    'a URL fragment or HTML entity': ['app/a.tsx', '<a href="/page#cafe">&#123;</a>'],
    'a word that merely ends in a colour function name': ['app/a.ts', 'const x = collab(1);'],
  };

  it.each(Object.entries(flagged))('AC8: flags %s', (_, [file, source, value]) => {
    const found = findRawColours(file, source);

    expect(found).toHaveLength(1);
    expect(found[0]?.value).toContain(value);
  });

  it.each(Object.entries(allowed))('allows %s', (_, [file, source]) => {
    expect(findRawColours(file, source)).toEqual([]);
  });

  it('AC8: names the line and column of each raw colour', () => {
    const source = ['/* #fff */', '.a {', '  color: #000;', '}', ''].join('\n');

    expect(findRawColours('app/a.css', source)).toEqual([
      { file: 'app/a.css', line: 3, column: 10, value: '#000' },
    ]);
  });
});

describe('E007 raw-colour guard (what `pnpm check` runs)', {
  timeout: SPAWN_TEST_TIMEOUT_MS,
}, () => {
  let root: string;

  beforeEach(async () => {
    await mkdir(scratchDir, { recursive: true });
    root = await mkdtemp(path.join(scratchDir, 'check-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const write = async (file: string, text: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  };

  it('AC8: a hex, rgb or arbitrary colour literal fails the check with file and line', async () => {
    await write(
      'apps/web/app/page.tsx',
      [
        'export const Page = () => (',
        '  <main style={{ color: "#1a2b3c" }}>',
        '    <div className="bg-[#fff] p-4" />',
        '  </main>',
        ');',
        '',
      ].join('\n'),
    );
    await write(
      'packages/ui/src/styles/extra.css',
      ['.badge {', '  border-color: rgb(12 34 56);', '}', ''].join('\n'),
    );

    const { code, output } = await runCheck(root);

    expect(code).toBe(1);
    expect(output).toContain('apps/web/app/page.tsx:2');
    expect(output).toContain('#1a2b3c');
    expect(output).toContain('apps/web/app/page.tsx:3');
    expect(output).toContain('bg-[#fff]');
    expect(output).toContain('packages/ui/src/styles/extra.css:2');
    expect(output).toContain('rgb(');
  });

  it('passes on the current apps/web and packages/ui sources', async () => {
    const { code, output } = await runCheck(repoRoot);

    expect(output).toContain('✓ no raw colours');
    expect(code).toBe(0);
  });

  it('leaves the vendored shadcn components, tests and build output alone', async () => {
    const raw = 'export const c = "bg-[#fff] text-[rgb(0_0_0)]";\n';
    await write('packages/ui/src/components/button.tsx', raw);
    await write('packages/ui/test/fixture.ts', raw);
    await write('apps/web/app/page.test.tsx', raw);
    await write('apps/web/e2e/theme.spec.ts', raw);
    await write('apps/web/node_modules/pkg/index.js', raw);
    await write('apps/web/.next/server/page.js', raw);
    await write('apps/web/app/page.tsx', 'export const c = "bg-primary";\n');

    const { code, output } = await runCheck(root);

    expect(output).toContain('✓ no raw colours: scanned 1 file(s)');
    expect(code).toBe(0);
  });

  it('AC8: still scans app directories that share a name with build output', async () => {
    await write('packages/ui/src/styles/globals.css', '.a { color: var(--primary); }\n');
    await write('apps/web/app/build/page.tsx', 'export const c = "text-[#000]";\n');

    const { code, output } = await runCheck(root);

    expect(output).toContain('apps/web/app/build/page.tsx:1');
    expect(code).toBe(1);
  });

  it('exempts exactly the directory where the shadcn CLI writes components', async () => {
    const readJson = async (file: string) =>
      JSON.parse(await readFile(path.join(packageRoot, file), 'utf8'));
    const alias: string = (await readJson('components.json')).aliases.ui;
    const paths: Record<string, string[]> = (await readJson('tsconfig.json')).compilerOptions.paths;
    // The shadcn CLI resolves the alias (`@trainer-hub/ui/components`) through tsconfig's paths.
    const resolved = Object.entries(paths).flatMap(([from, [to]]) => {
      const prefix = from.replace(/\*$/, '');
      return alias.startsWith(prefix) && to ? [to.replace(/\*$/, alias.slice(prefix.length))] : [];
    });

    expect(resolved.map((dir) => path.relative(repoRoot, path.join(packageRoot, dir)))).toEqual([
      vendoredComponents,
    ]);
  });
});
